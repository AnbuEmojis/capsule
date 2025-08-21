// cryptochain/liquidity-pool.js
class LiquidityPool {
  constructor(tokenSymbol = 'CAP', baseSymbol = 'NATIVE') {
    this.tokenSymbol    = tokenSymbol;
    this.baseSymbol     = baseSymbol;
    this.reserves       = { [tokenSymbol]: 0, [baseSymbol]: 0 };
    this.liquidityProviders = {};    // address → share
    this.totalLiquidity = 0;
    this.feePercent     = 0.00024;    // 0.024% fee ⇒ 0.0024 CAP on a 10 CAP swap :contentReference[oaicite:0]{index=0}
  }

  // One-time seeding: call this on startup
  seed({ amountToken, amountBase }) {
    if (this.totalLiquidity > 0) throw new Error('Already seeded');
    this.reserves[this.tokenSymbol] = amountToken;
    this.reserves[this.baseSymbol]  = amountBase;
    this.totalLiquidity = 1000;
    this.liquidityProviders['__INIT__'] = 1000;
  }

  getQuote({ inputSymbol, inputAmount }) {
    const outputSymbol = inputSymbol === this.tokenSymbol
      ? this.baseSymbol
      : this.tokenSymbol;

    if (this.reserves[inputSymbol] === 0 || this.reserves[outputSymbol] === 0) {
      throw new Error('Pool not initialized');
    }

    const inputWithFee  = inputAmount * (1 - this.feePercent);
    const inputReserve  = this.reserves[inputSymbol];
    const outputReserve = this.reserves[outputSymbol];

    const numerator   = inputWithFee * outputReserve;
    const denominator = inputReserve + inputWithFee;

    return {
      outputSymbol,
      outputAmount: numerator / denominator,
      fee: inputAmount - inputWithFee
    };
  }

  swap({ inputSymbol, inputAmount }) {
    const { outputSymbol, outputAmount, fee } = this.getQuote({ inputSymbol, inputAmount });

    // Update reserves
    this.reserves[inputSymbol] += inputAmount;
    this.reserves[outputSymbol] -= outputAmount;
    // Fee remains in reserves (implicitly goes to LPs)

    return { inputSymbol, inputAmount, outputSymbol, outputAmount, fee };
  }

  getReserves() {
    return { ...this.reserves };
  }
}

// Export a singleton pool
const pool = new LiquidityPool();
module.exports = { LiquidityPool, pool };
