# Pump Trader

Watches new pump.fun launches, runs rug checks on each one, and paper-trades the ones that pass. Every coin's steps (found → checks → bought → sold) show live in a web dashboard.

**Paper trading only.** No wallet, no private keys, no real money. That's on purpose; see "Before you go live" below.

## Run

Requires Node 22+. No dependencies.

```bash
npm start          # simulated launches (works offline) → http://localhost:3000
npm run live       # real pump.fun launches via PumpPortal websocket, still paper trading
npm test
```

## Rules (all editable in the dashboard)

| Rule | Default |
|---|---|
| Skip if dev bought > X% of supply at launch | 10% |
| Skip if other wallets bought > X% within the first second (bundles/snipers) | 25% |
| Skip forever if the dev has rugged before (persisted in `data/blacklist.json`) | on |
| Skip if the dev already sold during the observation window | on |
| Sell immediately if the dev wallet sells | on |
| Take profit / stop loss / trailing stop / max hold | +100% / −25% / 20% / 60s |
| Stop buying when equity reaches X× the start balance | 5× |

The dashboard also counts **skipped → rugged** and **bought → rugged**, so you can see whether the filters actually catch rugs on real data.

## Layout

- `src/feeds.js`: `PumpPortalFeed` (live, `wss://pumpportal.fun/api/data`) and `SimulatedFeed` (fake)
- `src/rugcheck.js`: the checks; each returns ✓/✕ with a reason
- `src/engine.js`: the per-coin pipeline, position management, goal stop
- `src/executor.js`: `PaperExecutor` fills on the bonding curve with slippage
- `server.js` + `public/index.html`: HTTP + server-sent events dashboard

## Before you go live

- **Simulated results mean nothing.** The simulator is built so bad coins rug, so of course the filter "works" there. Run `npm run live` for days and look at real paper P/L.
- **Paper fills are optimistic.** Snipers using Jito bundles land in the same block as the launch. You'll be slots behind them, buying from them. Expect worse prices than paper shows.
- **Most pump.fun tokens go to zero.** The fees (1% each way plus priority fees) are taken on every trade, win or lose.
- "X posts" / Grok signals aren't included. The X API is paid, and a 2-second-old coin has no posts yet anyway.
- If you do add live execution, use a fresh wallet holding only what you can afford to lose. Never paste a seed phrase into any "auto-trader" app you didn't build.
