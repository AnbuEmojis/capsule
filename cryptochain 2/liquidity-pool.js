// liquidity-pool.js
class LiquidityPool {
    constructor(tokenSymbol = 'CAP', baseSymbol = 'NATIVE') {
      this.tokenSymbol = tokenSymbol;
      this.baseSymbol = baseSymbol;
      this.reserves = {
        [tokenSymbol]: 0,
        [baseSymbol]: 0
      };
      this.liquidityProviders = {}; // address: share
      this.totalLiquidity = 0;
      this.feePercent = 0.003; // 0.3% fee
    }
  
    addLiquidity({ providerAddress, amountToken, amountBase }) {
      if (amountToken <= 0 || amountBase <= 0) throw new Error('Invalid liquidity amounts');
  
      const share = this.totalLiquidity === 0
        ? 1000
        : (amountBase / this.reserves[this.baseSymbol]) * this.totalLiquidity;
  
      this.reserves[this.tokenSymbol] += amountToken;
      this.reserves[this.baseSymbol] += amountBase;
      this.liquidityProviders[providerAddress] = (this.liquidityProviders[providerAddress] || 0) + share;
      this.totalLiquidity += share;
  
      return { shareMinted: share };
    }
  
    removeLiquidity({ providerAddress, share }) {
      const providerShare = this.liquidityProviders[providerAddress];
      if (!providerShare || share > providerShare) throw new Error('Insufficient LP tokens');
  
      const tokenOut = (share / this.totalLiquidity) * this.reserves[this.tokenSymbol];
      const baseOut = (share / this.totalLiquidity) * this.reserves[this.baseSymbol];
  
      this.reserves[this.tokenSymbol] -= tokenOut;
      this.reserves[this.baseSymbol] -= baseOut;
      this.liquidityProviders[providerAddress] -= share;
      this.totalLiquidity -= share;
  
      return {
        tokenOut,
        baseOut
      };
    }
  
    swap({ inputSymbol, inputAmount }) {
      const outputSymbol = inputSymbol === this.tokenSymbol ? this.baseSymbol : this.tokenSymbol;
      if (inputAmount > this.reserves[inputSymbol] * 0.5) {
        throw new Error('Swap amount exceeds 50% of reserve');
      }
      
      if (!this.reserves[inputSymbol] || !this.reserves[outputSymbol]) {
        throw new Error('Pool not initialized');
      }
  
      const inputWithFee = inputAmount * (1 - this.feePercent);
      const inputReserve = this.reserves[inputSymbol];
      const outputReserve = this.reserves[outputSymbol];
  
      const numerator = inputWithFee * outputReserve;
      const denominator = inputReserve + inputWithFee;
      const outputAmount = numerator / denominator;
  
      this.reserves[inputSymbol] += inputAmount;
      this.reserves[outputSymbol] -= outputAmount;
  
      return {
        outputSymbol,
        outputAmount,
        updatedReserves
      };
    }
  
    getReserves() {
      return { ...this.reserves };
    }
  
    getLiquidity(address) {
      return this.liquidityProviders[address] || 0;
    }
  }
  
  module.exports = LiquidityPool;