import { pctOfSupply } from './curve.js';

// Each check returns { name, pass, detail }. One failure means "skip".
// Inputs come from what the engine observed during the observation window
// right after the token was created.

export function devHoldingCheck(coin, cfg) {
  const pct = pctOfSupply(coin.devTokens);
  return {
    name: 'Dev wallet',
    pass: pct <= cfg.maxDevPct,
    detail: `dev holds ${pct.toFixed(1)}% (max ${cfg.maxDevPct}%)`,
  };
}

// "Bundles": supply bought by wallets other than the dev within the first
// `bundleWindowMs` after creation. Real humans can't buy that fast, so this
// is sniper/bundler supply that usually gets dumped on you.
export function bundleCheck(coin, cfg) {
  const early = coin.trades.filter(
    (t) => t.type === 'buy' && t.wallet !== coin.dev && t.ts - coin.createdAt <= cfg.bundleWindowMs,
  );
  const tokens = early.reduce((s, t) => s + t.tokens, 0);
  const pct = pctOfSupply(tokens);
  const wallets = new Set(early.map((t) => t.wallet)).size;
  return {
    name: 'Bundles',
    pass: pct <= cfg.maxBundlePct,
    detail: `${pct.toFixed(1)}% bought by ${wallets} wallet(s) in first ${cfg.bundleWindowMs}ms (max ${cfg.maxBundlePct}%)`,
  };
}

export function knownRuggerCheck(coin, blacklist) {
  const hit = blacklist.has(coin.dev);
  return {
    name: 'Dev history',
    pass: !hit,
    detail: hit ? `dev ${short(coin.dev)} rugged before: ${blacklist.reason(coin.dev)}` : 'no prior rugs recorded',
  };
}

// Dev already selling during the observation window is the clearest rug signal.
export function devSellingCheck(coin) {
  const sold = coin.trades.some((t) => t.type === 'sell' && t.wallet === coin.dev);
  return { name: 'Dev activity', pass: !sold, detail: sold ? 'dev already sold' : 'dev has not sold' };
}

export function socialCheck(coin, cfg) {
  if (!cfg.requireSocials) return { name: 'Socials', pass: true, detail: 'not required' };
  const s = coin.socials || {};
  const have = ['twitter', 'telegram', 'website'].filter((k) => s[k]);
  return {
    name: 'Socials',
    pass: have.length > 0,
    detail: have.length ? `links: ${have.join(', ')}` : 'no social links in metadata',
  };
}

export function runRugChecks(coin, cfg, blacklist) {
  const checks = [
    knownRuggerCheck(coin, blacklist),
    devHoldingCheck(coin, cfg),
    bundleCheck(coin, cfg),
    devSellingCheck(coin),
    socialCheck(coin, cfg),
  ];
  return { pass: checks.every((c) => c.pass), checks };
}

export function short(addr) {
  return addr ? `${addr.slice(0, 4)}…${addr.slice(-4)}` : '?';
}
