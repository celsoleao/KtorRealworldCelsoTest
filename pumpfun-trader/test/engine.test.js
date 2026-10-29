import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { quoteBuy, quoteSell } from '../src/curve.js';
import { runRugChecks } from '../src/rugcheck.js';
import { Blacklist } from '../src/blacklist.js';
import { Engine, DEFAULT_CONFIG } from '../src/engine.js';
import { PaperExecutor } from '../src/executor.js';

const curve = { vSol: 30, vTokens: 1_073_000_000 };

test('buy then immediate sell loses roughly the 2% round-trip fee', () => {
  const tokens = quoteBuy(curve, 1);
  const after = { vSol: curve.vSol + 0.99, vTokens: curve.vTokens - tokens };
  const back = quoteSell(after, tokens);
  assert.ok(back < 1 && back > 0.97, `got ${back}`);
});

const coin = (over = {}) => ({ dev: 'DEV', devTokens: 20_000_000, createdAt: 0, trades: [], ...over });

test('rug checks: dev > 10% fails', () => {
  const r = runRugChecks(coin({ devTokens: 150_000_000 }), DEFAULT_CONFIG, new Blacklist());
  assert.equal(r.pass, false);
  assert.equal(r.checks.find((c) => c.name === 'Dev wallet').pass, false);
});

test('rug checks: bundled supply > 25% fails', () => {
  const trades = [1, 2, 3].map((i) => ({ type: 'buy', wallet: `W${i}`, tokens: 100_000_000, ts: 200 }));
  const r = runRugChecks(coin({ trades }), DEFAULT_CONFIG, new Blacklist());
  assert.equal(r.checks.find((c) => c.name === 'Bundles').pass, false);
});

test('rug checks: blacklisted dev fails, clean coin passes', () => {
  const bl = new Blacklist();
  assert.equal(runRugChecks(coin(), DEFAULT_CONFIG, bl).pass, true);
  bl.add('DEV', 'rugged X');
  assert.equal(runRugChecks(coin(), DEFAULT_CONFIG, bl).pass, false);
});

class FakeFeed extends EventEmitter {
  start() {}
  stop() {}
  watch() {}
  unwatch() {}
}

test('engine buys a clean coin and sells when the dev wallet moves', async () => {
  const feed = new FakeFeed();
  const engine = new Engine({ feed, executor: new PaperExecutor({ slippagePct: 0 }), blacklist: new Blacklist(), config: { observeMs: 0 } });
  engine.running = true;
  feed.emit('create', { mint: 'M', symbol: 'TEST', dev: 'DEV', devTokens: 20_000_000, curve, ts: Date.now() });
  await engine.decide(engine.coins.get('M'));
  assert.equal(engine.coins.get('M').status, 'holding');

  feed.emit('trade', { mint: 'M', wallet: 'DEV', type: 'sell', tokens: 20_000_000, sol: 0.5, curve: { vSol: 29.5, vTokens: 1_093_000_000 }, ts: Date.now() });
  await new Promise((r) => setImmediate(r));
  const c = engine.coins.get('M');
  assert.equal(c.status, 'closed');
  assert.match(c.steps.at(-1).text, /dev wallet moved|Sold/);
  assert.equal(engine.blacklist.has('DEV'), true);
  assert.equal(engine.stats.trades, 1);
});

test('engine stops buying once the goal is reached', async () => {
  const feed = new FakeFeed();
  const engine = new Engine({ feed, executor: new PaperExecutor(), blacklist: new Blacklist(), config: { observeMs: 0 } });
  engine.running = true;
  engine.balance = engine.cfg.startBalanceSol * engine.cfg.goalMultiple;
  engine.checkGoal();
  feed.emit('create', { mint: 'M', symbol: 'TEST', dev: 'D2', devTokens: 1, curve, ts: Date.now() });
  await engine.decide(engine.coins.get('M'));
  assert.equal(engine.coins.get('M').position, undefined);
});
