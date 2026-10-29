// pump.fun bonding curve math (constant product on virtual reserves).
// Every pump.fun token has a 1,000,000,000 supply with 6 decimals; the feed
// reports token amounts already in whole tokens.

export const TOTAL_SUPPLY = 1_000_000_000;
export const FEE_RATE = 0.01; // pump.fun charges 1% per trade

export function price(curve) {
  return curve.vSol / curve.vTokens; // SOL per token
}

// Tokens received for spending `sol` (fee taken from the input).
export function quoteBuy(curve, sol) {
  const solIn = sol * (1 - FEE_RATE);
  const k = curve.vSol * curve.vTokens;
  return curve.vTokens - k / (curve.vSol + solIn);
}

// SOL received for selling `tokens` (fee taken from the output).
export function quoteSell(curve, tokens) {
  const k = curve.vSol * curve.vTokens;
  const solOut = curve.vSol - k / (curve.vTokens + tokens);
  return solOut * (1 - FEE_RATE);
}

export function pctOfSupply(tokens) {
  return (tokens / TOTAL_SUPPLY) * 100;
}
