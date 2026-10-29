import { quoteBuy, quoteSell } from './curve.js';

// Paper trading: fills at the current bonding-curve price minus slippage.
// Real fills are worse. You land in a later slot than the snipers, and Jito
// bundles front-run you, so treat paper results as an upper bound.
export class PaperExecutor {
  constructor({ slippagePct = 5 } = {}) {
    this.slippagePct = slippagePct;
    this.label = 'paper';
  }

  async buy(coin, sol) {
    const tokens = quoteBuy(coin.curve, sol) * (1 - this.slippagePct / 100);
    return { sol, tokens };
  }

  async sell(coin, tokens) {
    const sol = quoteSell(coin.curve, tokens) * (1 - this.slippagePct / 100);
    return { sol, tokens };
  }
}

// A live executor would build and sign transactions with your wallet, for
// example via PumpPortal's trade-local endpoint plus @solana/web3.js. It is
// left out on purpose. Run paper mode for weeks first, and only add live
// trading if the numbers hold up after realistic slippage.
