// backend/routes/swaps.js
const express = require('express');
const router = express.Router();
const { toFiat, fiatToNative } = require('../services/oracle');
const { computeCaTaxCAD } = require('../services/tax_ca');

/* -------- helpers -------- */
function tp(app){ return app?.locals?.transactionPool; }
function enqueue(app, tx){ if(tp(app)?.setTransaction) tp(app).setTransaction(tx); return tx; }
function pennyTreasury(){ return process.env.PENNY_TREASURY_ADDRESS || null; }
function nowId(){ return Date.now().toString(16) + Math.random().toString(16).slice(2); }
function chargePenny(app, pennyAmount, noteCtx){
  const amt = Number(pennyAmount||0);
  const tre = pennyTreasury();
  if (!tre || !amt || !(amt>0)) return null;
  const tx = {
    id: `penny-${nowId()}`,
    type: 'FEE',
    asset: 'NATIVE',
    outputMap: { [tre]: amt },
    note: `PENNY_FEE:${noteCtx||''}`
  };
  return enqueue(app, tx);
}
function regionFrom(req){
  return {
    country: String(req.body?.country || req.query?.country || 'CA').toUpperCase(),
    province: String(req.body?.province || req.query?.province || 'ON').toUpperCase(),
    currency: String(req.body?.currency || req.query?.currency || 'CAD').toUpperCase()
  };
}
function autoTaxPenny(req, { asset, amount, op }) {
  const { pool } = req.app.locals;
  const r = regionFrom(req);
  if (r.country !== 'CA') return { penny: 0, detail: null };
  const fx = toFiat({ pool, asset, amount, vs: r.currency });
  const ca = computeCaTaxCAD({ province: r.province, cadAmount: fx.value, op });
  const penny = fiatToNative({ fiatAmount: ca.cadTax, vs: r.currency });
  return {
    penny: Number(penny || 0),
    detail: { fiatBase: fx.value, taxFiat: ca.cadTax, ratePercent: ca.ratePercent, region: r, breakdown: ca.breakdown }
  };
}

/** GET /api/swaps/quote?fromToken=CAP&toToken=NATIVE&amount=10 */
router.get('/quote', (req, res) => {
  const { pool } = req.app.locals;
  const { fromToken, toToken, amount } = req.query;
  const amt = Number(amount);

  if (!fromToken || !toToken || !Number.isFinite(amt) || amt <= 0) {
    return res.status(400).json({ message: 'Bad query' });
  }
  if (fromToken === toToken) {
    return res.status(400).json({ message: 'Tokens must differ' });
  }

  try {
    if (typeof pool?.getQuote === 'function') {
      const q = pool.getQuote({ inputSymbol: fromToken, inputAmount: amt });
      return res.json({
        price: q.price,
        amountOut: q.outputAmount,
        fee: q.fee ?? 0,
        slippage: q.slippage ?? 0,
        pool: pool.getReserves ? pool.getReserves() : undefined
      });
    }

    if (!pool?.getReserves) throw new Error('Pool not available');
    const { CAP, NATIVE } = pool.getReserves();
    const x = fromToken === 'CAP' ? CAP : NATIVE;
    const y = fromToken === 'CAP' ? NATIVE : CAP;
    const k = x * y;
    const xNew = x + amt;
    const yNew = k / xNew;
    const out = y - yNew;

    return res.json({
      price: out / amt,
      amountOut: out,
      fee: 0,
      slippage: 0,
      pool: { CAP, NATIVE }
    });
  } catch (e) {
    return res.status(400).json({ message: e.message });
  }
});

/** POST /api/swaps/execute
 * Body: { fromToken, toToken, amountIn, minAmountOut, minerFee?, autoTax?, country?, province?, currency? }
 */
router.post('/execute', (req, res) => {
  const { pool } = req.app.locals;
  const { fromToken, toToken, amountIn, minAmountOut, minerFee, autoTax } = req.body || {};
  const amt = Number(amountIn);
  const minOut = Number(minAmountOut || 0);

  if (!fromToken || !toToken || !Number.isFinite(amt) || amt <= 0) {
    return res.status(400).json({ message: 'Bad body' });
  }
  if (fromToken === toToken) {
    return res.status(400).json({ message: 'Tokens must differ' });
  }

  try {
    let result;
    const execFn = pool?.executeSwap || pool?.swap;
    if (typeof execFn === 'function') {
      result = execFn.call(pool, {
        inputSymbol: fromToken,
        inputAmount: amt,
        minOutputAmount: minOut
      });
    } else {
      if (!pool?.getReserves) throw new Error('Pool not available');
      const R = pool.getReserves();
      let CAP = Number(R.CAP), NATIVE = Number(R.NATIVE);
      const x = fromToken === 'CAP' ? CAP : NATIVE;
      const y = fromToken === 'CAP' ? NATIVE : CAP;
      const k = x * y;
      const xNew = x + amt;
      const yNew = k / xNew;
      const out = y - yNew;
      if (out < minOut) throw new Error('Slippage: minAmountOut not met');

      if (typeof pool.setReserves === 'function') {
        if (fromToken === 'CAP') { CAP += amt; NATIVE -= out; }
        else { NATIVE += amt; CAP -= out; }
        pool.setReserves({ CAP, NATIVE });
      }

      result = { outputAmount: out, price: out/amt, fee: 0, txId: null };
    }

    // Penny fee
    let pennyApplied = 0;
    let taxDetail = null;

    if (autoTax) {
      const a = autoTaxPenny(req, { asset: fromToken, amount: amt, op: 'SWAP' });
      pennyApplied = a.penny;
      taxDetail = a.detail;
      chargePenny(req.app, pennyApplied, 'SWAP_AUTO_TAX');
    } else if (minerFee) {
      pennyApplied = Number(minerFee || 0);
      chargePenny(req.app, pennyApplied, 'SWAP_EXECUTE');
    }

    return res.json({
      txId: result.txId ?? null,
      amountOut: result.outputAmount,
      price: result.price,
      fee: result.fee ?? 0,
      pennyApplied,
      taxDetail,
      poolAfter: pool.getReserves ? pool.getReserves() : undefined
    });
  } catch (e) {
    return res.status(400).json({ message: e.message });
  }
});

module.exports = router;
