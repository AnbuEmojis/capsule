// liquidity-pool.test.js
const LiquidityPool = require('./liquidity-pool');

describe('LiquidityPool', () => {
  let pool;

  beforeEach(() => {
    pool = new LiquidityPool();
  });

  describe('addLiquidity()', () => {
    it('adds liquidity and mints LP tokens', () => {
      const result = pool.addLiquidity({
        providerAddress: 'alice',
        amountToken: 1000,
        amountBase: 10
      });

      expect(result.shareMinted).toBeGreaterThan(0);
      expect(pool.getReserves()).toEqual({ CAP: 1000, NATIVE: 10 });
    });
  });

  describe('removeLiquidity()', () => {
    it('returns reserves proportionally to share burned', () => {
      pool.addLiquidity({ providerAddress: 'alice', amountToken: 1000, amountBase: 10 });
      const result = pool.removeLiquidity({ providerAddress: 'alice', share: 500 });

      expect(result.tokenOut).toBeGreaterThan(0);
      expect(result.baseOut).toBeGreaterThan(0);
      expect(pool.getLiquidity('alice')).toBeLessThan(1000);
    });

    it('throws on invalid share removal', () => {
      expect(() => pool.removeLiquidity({ providerAddress: 'bob', share: 100 })).toThrow();
    });
  });

  describe('swap()', () => {
    beforeEach(() => {
      pool.addLiquidity({ providerAddress: 'alice', amountToken: 1000, amountBase: 10 });
    });

    it('swaps CAP to NATIVE and updates reserves', () => {
      const result = pool.swap({ inputSymbol: 'CAP', inputAmount: 100 });
      expect(result.outputSymbol).toBe('NATIVE');
      expect(result.outputAmount).toBeGreaterThan(0);

      const reserves = pool.getReserves();
      expect(reserves.CAP).toBeGreaterThan(1000);
      expect(reserves.NATIVE).toBeLessThan(10);
    });

    it('swaps NATIVE to CAP and updates reserves', () => {
      const result = pool.swap({ inputSymbol: 'NATIVE', inputAmount: 1 });
      expect(result.outputSymbol).toBe('CAP');
      expect(result.outputAmount).toBeGreaterThan(0);

      const reserves = pool.getReserves();
      expect(reserves.NATIVE).toBeGreaterThan(10);
      expect(reserves.CAP).toBeLessThan(1000);
    });

    it('throws if reserves are uninitialized', () => {
      const emptyPool = new LiquidityPool();
      expect(() => emptyPool.swap({ inputSymbol: 'CAP', inputAmount: 100 })).toThrow();
    });
  });
});
