import { EventEmitter } from 'node:events';
import { TOTAL_SUPPLY } from './curve.js';

// Feeds emit normalized events:
//   'create' { mint, name, symbol, dev, devTokens, curve, uri, ts }
//   'trade'  { mint, wallet, type: 'buy'|'sell', tokens, sol, curve, ts }
// and expose watch(mint) / unwatch(mint) for per-token trade streams.

// Live data from PumpPortal's free websocket (no key needed for data).
// https://pumpportal.fun/data-api/real-time
export class PumpPortalFeed extends EventEmitter {
  constructor(url = 'wss://pumpportal.fun/api/data') {
    super();
    this.url = url;
    this.watched = new Set();
    this.closed = false;
  }

  start() {
    this.closed = false;
    this.ws = new WebSocket(this.url);
    this.ws.onopen = () => {
      this.send({ method: 'subscribeNewToken' });
      if (this.watched.size) this.send({ method: 'subscribeTokenTrade', keys: [...this.watched] });
      this.emit('status', 'connected to PumpPortal');
    };
    this.ws.onmessage = (ev) => this.handle(ev.data);
    this.ws.onerror = () => this.emit('status', 'PumpPortal websocket error');
    this.ws.onclose = () => {
      if (this.closed) return;
      this.emit('status', 'PumpPortal disconnected, reconnecting in 3s');
      setTimeout(() => !this.closed && this.start(), 3000);
    };
  }

  stop() {
    this.closed = true;
    this.ws?.close();
  }

  send(msg) {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg));
  }

  watch(mint) {
    this.watched.add(mint);
    this.send({ method: 'subscribeTokenTrade', keys: [mint] });
  }

  unwatch(mint) {
    this.watched.delete(mint);
    this.send({ method: 'unsubscribeTokenTrade', keys: [mint] });
  }

  handle(raw) {
    let m;
    try {
      m = JSON.parse(raw);
    } catch {
      return;
    }
    if (!m.mint || !m.txType) return;
    const curve = { vSol: m.vSolInBondingCurve, vTokens: m.vTokensInBondingCurve };
    const ts = Date.now();
    if (m.txType === 'create') {
      this.emit('create', {
        mint: m.mint,
        name: m.name,
        symbol: m.symbol,
        dev: m.traderPublicKey,
        devTokens: m.initialBuy || 0,
        curve,
        uri: m.uri,
        ts,
      });
    } else if (m.txType === 'buy' || m.txType === 'sell') {
      this.emit('trade', {
        mint: m.mint,
        wallet: m.traderPublicKey,
        type: m.txType,
        tokens: m.tokenAmount,
        sol: m.solAmount,
        curve,
        ts,
      });
    }
  }
}

// Offline simulator so the whole pipeline can be exercised without network
// or money. Outcomes are random and most coins go nowhere, like the real thing.
// Do NOT read simulated P/L as evidence the strategy works.
export class SimulatedFeed extends EventEmitter {
  constructor({ intervalMs = 2500, rng = Math.random } = {}) {
    super();
    this.intervalMs = intervalMs;
    this.rng = rng;
    this.timers = new Set();
    this.coins = new Map();
    this.ruggers = [];
    this.n = 0;
  }

  start() {
    this.emit('status', 'SIMULATION: fake tokens, fake trades');
    this.loop = setInterval(() => this.spawn(), this.intervalMs);
    this.spawn();
  }

  stop() {
    clearInterval(this.loop);
    for (const t of this.timers) clearTimeout(t);
    this.timers.clear();
    this.coins.clear();
  }

  watch() {}
  unwatch(mint) {
    this.coins.delete(mint);
  }

  later(ms, fn) {
    const t = setTimeout(() => {
      this.timers.delete(t);
      fn();
    }, ms);
    this.timers.add(t);
  }

  wallet() {
    const abc = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
    let s = '';
    for (let i = 0; i < 44; i++) s += abc[Math.floor(this.rng() * abc.length)];
    return s;
  }

  spawn() {
    const r = this.rng();
    // Archetypes: fat dev bag, bundled launch, repeat rugger, or "clean".
    const kind = r < 0.2 ? 'devheavy' : r < 0.4 ? 'bundled' : r < 0.5 && this.ruggers.length ? 'repeat' : 'clean';
    const dev = kind === 'repeat' ? this.ruggers[Math.floor(this.rng() * this.ruggers.length)] : this.wallet();
    const names = ['DOGGO', 'MEOWZ', 'FROGGY', 'WADDLE', 'BRUNO', 'FOXXY', 'HAMMY', 'PANDY', 'OWLY', 'BUNZ', 'PEPU', 'GOOBY'];
    const symbol = `${names[this.n++ % names.length]}${this.n > names.length ? this.n : ''}`;
    const mint = `${this.wallet().slice(0, 40)}pump`;
    const coin = { curve: { vSol: 30, vTokens: 1_073_000_000 }, holders: new Map(), kind, dev };
    this.coins.set(mint, coin);

    const devSol = kind === 'devheavy' ? 3 + this.rng() * 5 : 0.2 + this.rng() * 1.2;
    const devTokens = this.applyBuy(coin, dev, devSol);
    this.emit('create', {
      mint, name: `${symbol} coin`, symbol, dev, devTokens, curve: { ...coin.curve }, uri: null, ts: Date.now(),
      socials: this.rng() < 0.7 ? { twitter: `https://x.com/${symbol.toLowerCase()}` } : {},
    });

    if (kind === 'bundled') {
      for (let i = 0; i < 6; i++) this.later(40 + i * 30, () => this.trade(mint, this.wallet(), 'buy', 1 + this.rng() * 2));
    }

    // Rough lifecycle: bad archetypes rug quickly; "clean" ones random-walk
    // and usually fade, sometimes pump, sometimes rug anyway.
    const fate = kind === 'clean' ? this.rng() : 0;
    const rugAt = kind === 'clean' ? (fate < 0.35 ? 8000 + this.rng() * 30000 : Infinity) : 2000 + this.rng() * 3000;
    const drift = kind === 'clean' ? (fate > 0.8 ? 0.65 : fate > 0.55 ? 0.55 : 0.42) : 0.5;
    const start = Date.now();
    const tick = () => {
      if (!this.coins.has(mint)) return;
      const age = Date.now() - start;
      if (age >= rugAt) {
        const devBag = coin.holders.get(dev) || 0;
        if (devBag > 0) this.trade(mint, dev, 'sell', devBag);
        if (kind === 'clean' || kind === 'repeat' || kind === 'devheavy') this.ruggers.push(dev);
        for (const [w, bag] of [...coin.holders]) if (w !== dev && bag > 0 && this.rng() < 0.6) this.trade(mint, w, 'sell', bag);
        return;
      }
      if (age > 90000) return;
      if (this.rng() < drift) this.trade(mint, this.wallet(), 'buy', 0.1 + this.rng() * 1.5);
      else {
        const sellers = [...coin.holders].filter(([w, b]) => w !== dev && b > 0);
        if (sellers.length) {
          const [w, b] = sellers[Math.floor(this.rng() * sellers.length)];
          this.trade(mint, w, 'sell', b * (0.3 + this.rng() * 0.7));
        }
      }
      this.later(150 + this.rng() * 500, tick);
    };
    this.later(300, tick);
  }

  applyBuy(coin, wallet, sol) {
    const k = coin.curve.vSol * coin.curve.vTokens;
    coin.curve.vSol += sol;
    const out = coin.curve.vTokens - k / coin.curve.vSol;
    coin.curve.vTokens -= out;
    coin.holders.set(wallet, (coin.holders.get(wallet) || 0) + out);
    return out;
  }

  trade(mint, wallet, type, amount) {
    const coin = this.coins.get(mint);
    if (!coin) return;
    let tokens, sol;
    if (type === 'buy') {
      sol = amount;
      tokens = this.applyBuy(coin, wallet, sol);
    } else {
      tokens = Math.min(amount, coin.holders.get(wallet) || 0);
      if (tokens <= 0) return;
      const k = coin.curve.vSol * coin.curve.vTokens;
      coin.curve.vTokens += tokens;
      sol = coin.curve.vSol - k / coin.curve.vTokens;
      coin.curve.vSol -= sol;
      coin.holders.set(wallet, coin.holders.get(wallet) - tokens);
    }
    this.emit('trade', { mint, wallet, type, tokens, sol, curve: { ...coin.curve }, ts: Date.now() });
  }
}

export { TOTAL_SUPPLY };
