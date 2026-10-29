import { EventEmitter } from 'node:events';
import { price, quoteSell, pctOfSupply } from './curve.js';
import { runRugChecks, short } from './rugcheck.js';

export const DEFAULT_CONFIG = {
  startBalanceSol: 5,
  buySol: 0.5,
  maxOpenPositions: 3,
  observeMs: 1500, // watch early trades before deciding (bundle detection)
  bundleWindowMs: 1000,
  maxDevPct: 10, // rule 1
  maxBundlePct: 25, // rule 2
  requireSocials: false,
  takeProfitPct: 100,
  stopLossPct: 25,
  trailingStopPct: 20, // from peak, once in profit
  maxHoldMs: 60_000,
  goalMultiple: 5, // rule 5: stop buying once equity hits this
  rugDropPct: 70, // price drop from peak that counts as a rug
  trackAfterMs: 20_000, // keep watching skipped/closed coins to see if they rug
  maxCoinsShown: 60,
};

// Engine: Found → rug check → buy → sell, with every step recorded on the
// coin so the UI can show it.
export class Engine extends EventEmitter {
  constructor({ feed, executor, blacklist, config = {} }) {
    super();
    this.feed = feed;
    this.executor = executor;
    this.blacklist = blacklist;
    this.cfg = { ...DEFAULT_CONFIG, ...config };
    this.coins = new Map();
    this.order = [];
    this.running = false;
    this.reset();

    feed.on('create', (e) => this.running && this.onCreate(e));
    feed.on('trade', (e) => this.onTrade(e));
    feed.on('status', (s) => this.log(s));
  }

  reset() {
    this.balance = this.cfg.startBalanceSol;
    this.goalReached = false;
    this.stats = { trades: 0, wins: 0, losses: 0, skipped: 0, skippedThenRugged: 0, boughtThenRugged: 0, realizedSol: 0 };
    this.coins.clear();
    this.order = [];
    this.logs = [];
    this.changed();
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.feed.start();
    this.ticker = setInterval(() => this.tick(), 500);
    this.log(`started (${this.executor.label} trading)`);
  }

  stop() {
    this.running = false;
    clearInterval(this.ticker);
    this.feed.stop();
    this.log('stopped');
  }

  setConfig(patch) {
    for (const [k, v] of Object.entries(patch)) {
      if (!(k in DEFAULT_CONFIG)) continue;
      this.cfg[k] = typeof DEFAULT_CONFIG[k] === 'boolean' ? Boolean(v) : Number(v);
    }
    this.changed();
  }

  // Equity = cash + open positions marked to what they'd sell for now.
  equity() {
    let eq = this.balance;
    for (const c of this.coins.values()) if (c.position && !c.position.closed) eq += quoteSell(c.curve, c.position.tokens);
    return eq;
  }

  openPositions() {
    return [...this.coins.values()].filter((c) => c.position && !c.position.closed).length;
  }

  // --- feed handlers -------------------------------------------------------

  onCreate(e) {
    const coin = {
      ...e,
      createdAt: e.ts,
      trades: [],
      steps: [],
      status: 'checking',
      peakPrice: price(e.curve),
      rugged: false,
    };
    this.coins.set(e.mint, coin);
    this.order.unshift(e.mint);
    this.trim();
    this.step(coin, 'found', true, `Found on pump.fun · dev ${short(e.dev)} bought ${pctOfSupply(e.devTokens).toFixed(1)}%`);
    this.feed.watch(e.mint);
    if (e.uri && !e.socials) this.fetchSocials(coin);
    coin.decideAt = e.ts + this.cfg.observeMs;
  }

  onTrade(e) {
    const coin = this.coins.get(e.mint);
    if (!coin) return;
    coin.trades.push(e);
    coin.curve = e.curve;
    const p = price(e.curve);
    if (p > coin.peakPrice) coin.peakPrice = p;

    if (!coin.rugged && p <= coin.peakPrice * (1 - this.cfg.rugDropPct / 100)) this.markRugged(coin, `price −${this.cfg.rugDropPct}% from peak`);

    if (e.type === 'sell' && e.wallet === coin.dev) {
      const devBag = coin.devTokens;
      if (devBag > 0 && e.tokens >= devBag * 0.5) this.markRugged(coin, 'dev dumped bag');
      // rule 4: dev wallet moves → get out now
      if (coin.position && !coin.position.closed) this.sell(coin, 'dev wallet moved');
    }
    if (coin.position && !coin.position.closed) this.manage(coin);
  }

  markRugged(coin, why) {
    coin.rugged = true;
    // rule 3: same dev as an old rug → skip forever
    this.blacklist.add(coin.dev, `${coin.symbol}: ${why}`);
    if (coin.status === 'skipped') {
      this.stats.skippedThenRugged++;
      this.step(coin, 'rug', true, `rugged ${((Date.now() - coin.createdAt) / 1000).toFixed(1)}s after launch (${why}); skip was right`);
    } else if (coin.position) {
      this.stats.boughtThenRugged++;
      this.step(coin, 'rug', false, `rugged (${why})`);
    }
    this.changed();
  }

  // --- decision ------------------------------------------------------------

  tick() {
    const now = Date.now();
    for (const coin of this.coins.values()) {
      if (coin.status === 'checking' && now >= coin.decideAt) this.decide(coin);
      if (coin.position && !coin.position.closed) this.manage(coin);
      if (!coin.unwatched && coin.status !== 'checking' && coin.status !== 'holding' && now - (coin.doneAt || now) > this.cfg.trackAfterMs) {
        coin.unwatched = true;
        this.feed.unwatch(coin.mint);
      }
    }
  }

  async decide(coin) {
    const { pass, checks } = runRugChecks(coin, this.cfg, this.blacklist);
    for (const c of checks) this.step(coin, 'check', c.pass, `${c.name}: ${c.detail}`);

    if (!pass) return this.finish(coin, 'skipped', () => this.stats.skipped++);
    if (coin.rugged) return this.finish(coin, 'skipped', () => this.stats.skipped++);
    if (this.goalReached) return this.finish(coin, 'passed', null, 'goal reached, not buying');
    if (!this.running) return this.finish(coin, 'passed', null, 'engine stopped');
    if (this.openPositions() >= this.cfg.maxOpenPositions) return this.finish(coin, 'passed', null, 'max open positions');
    if (this.balance < this.cfg.buySol) return this.finish(coin, 'passed', null, 'insufficient balance');

    coin.status = 'holding';
    this.balance -= this.cfg.buySol;
    try {
      const fill = await this.executor.buy(coin, this.cfg.buySol);
      coin.position = { cost: fill.sol, tokens: fill.tokens, openedAt: Date.now(), peakValue: fill.sol, closed: false };
      this.step(coin, 'buy', true, `Bought ${fill.sol} SOL → ${Math.round(fill.tokens).toLocaleString()} tokens`);
    } catch (err) {
      this.balance += this.cfg.buySol;
      this.finish(coin, 'passed', null, `buy failed: ${err.message}`);
    }
  }

  finish(coin, status, count, note) {
    coin.status = status;
    coin.doneAt = Date.now();
    count?.();
    if (note) this.step(coin, 'note', null, note);
    else if (status === 'skipped') this.step(coin, 'skip', false, 'Skipped');
    this.changed();
  }

  manage(coin) {
    const pos = coin.position;
    const value = quoteSell(coin.curve, pos.tokens);
    if (value > pos.peakValue) pos.peakValue = value;
    const pnlPct = (value / pos.cost - 1) * 100;
    const fromPeak = (1 - value / pos.peakValue) * 100;
    pos.pnlPct = pnlPct;

    if (pnlPct >= this.cfg.takeProfitPct) return this.sell(coin, `take profit +${pnlPct.toFixed(0)}%`);
    if (pnlPct <= -this.cfg.stopLossPct) return this.sell(coin, `stop loss ${pnlPct.toFixed(0)}%`);
    if (pnlPct > 0 && pos.peakValue > pos.cost * 1.1 && fromPeak >= this.cfg.trailingStopPct) return this.sell(coin, `trailing stop (${fromPeak.toFixed(0)}% off peak)`);
    if (Date.now() - pos.openedAt >= this.cfg.maxHoldMs) return this.sell(coin, 'max hold time');
  }

  async sell(coin, reason) {
    const pos = coin.position;
    if (pos.closed || pos.selling) return;
    pos.selling = true;
    try {
      const fill = await this.executor.sell(coin, pos.tokens);
      pos.closed = true;
      pos.proceeds = fill.sol;
      const pnl = fill.sol - pos.cost;
      pos.pnlPct = (fill.sol / pos.cost - 1) * 100;
      this.balance += fill.sol;
      this.stats.trades++;
      this.stats.realizedSol += pnl;
      pnl >= 0 ? this.stats.wins++ : this.stats.losses++;
      this.step(coin, 'sell', pnl >= 0, `Sold (${reason}) → ${fill.sol.toFixed(3)} SOL, ${pnl >= 0 ? '+' : ''}${pos.pnlPct.toFixed(0)}% (${pnl >= 0 ? '+' : ''}${pnl.toFixed(3)} SOL)`);
      this.finish(coin, 'closed');
      this.checkGoal();
    } catch (err) {
      pos.selling = false;
      this.step(coin, 'note', false, `sell failed: ${err.message}, will retry`);
    }
  }

  checkGoal() {
    if (this.goalReached) return;
    if (this.equity() >= this.cfg.startBalanceSol * this.cfg.goalMultiple) {
      this.goalReached = true;
      this.log(`goal ${this.cfg.goalMultiple}× reached: no new buys until you resume`);
    }
  }

  resumeAfterGoal() {
    this.goalReached = false;
    this.cfg.startBalanceSol = this.equity();
    this.log(`resumed; new baseline ${this.cfg.startBalanceSol.toFixed(3)} SOL`);
  }

  // --- helpers -------------------------------------------------------------

  async fetchSocials(coin) {
    try {
      const res = await fetch(coin.uri, { signal: AbortSignal.timeout(1200) });
      const meta = await res.json();
      coin.socials = { twitter: meta.twitter, telegram: meta.telegram, website: meta.website };
    } catch {
      coin.socials = {};
    }
  }

  step(coin, kind, ok, text) {
    coin.steps.push({ t: Date.now() - coin.createdAt, kind, ok, text });
    this.changed();
  }

  log(msg) {
    this.logs.unshift({ at: Date.now(), msg });
    this.logs.length = Math.min(this.logs.length, 100);
    this.changed();
  }

  trim() {
    while (this.order.length > this.cfg.maxCoinsShown) {
      const mint = this.order[this.order.length - 1];
      const c = this.coins.get(mint);
      if (c?.status === 'holding' || c?.status === 'checking') break;
      this.order.pop();
      this.coins.delete(mint);
      this.feed.unwatch(mint);
    }
  }

  changed() {
    this.emit('changed');
  }

  snapshot() {
    return {
      running: this.running,
      mode: this.executor.label,
      feed: this.feed.constructor.name,
      cfg: this.cfg,
      balance: this.balance,
      equity: this.equity(),
      goalReached: this.goalReached,
      stats: this.stats,
      blacklisted: this.blacklist.size,
      logs: this.logs.slice(0, 20),
      coins: this.order.map((m) => this.coins.get(m)).filter(Boolean).map((c) => ({
        mint: c.mint,
        symbol: c.symbol,
        name: c.name,
        status: c.status,
        rugged: c.rugged,
        steps: c.steps,
        position: c.position && {
          cost: c.position.cost,
          pnlPct: c.position.pnlPct ?? 0,
          closed: c.position.closed,
          proceeds: c.position.proceeds,
        },
      })),
    };
  }
}
