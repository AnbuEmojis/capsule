// backend/routes/quotes.js
const express = require('express');
const router = express.Router();

const num = (v, d) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
};

function nativeUsd() {
  return num(process.env.NATIVE_USD, 1.0);
}

function solUsd() {
  return num(process.env.SOL_USD, 150.0);
}

async function midCapPerNative(req) {
  try {
    const base = `${req.protocol}://${req.get('host')}`;
    const r = await fetch(`${base}/api/liquidity/reserves`).then(r => r.json());
    const cap = Number(r?.CAP || r?.cap || 0);
    const nat = Number(r?.NATIVE || r?.native || 0);
    if (cap > 0 && nat > 0) return nat / cap; // CAP→NATIVE
  } catch (_) {}
  return num(process.env.CAP_NATIVE, 0.01);
}

// GET /api/quotes/cap2sol?amount=10
router.get('/cap2sol', async (req, res) => {
  try {
    const amountIn = num(req.query.amount, 0);
    if (!(amountIn > 0)) return res.status(400).json({ message: 'amount > 0 required' });

    const mid_CAP_NATIVE = await midCapPerNative(req); // CAP→NATIVE
    // NATIVE→SOL ≈ (NATIVE USD) / (SOL USD)
    const mid_NATIVE_SOL = nativeUsd() / solUsd();

    const amountOut = amountIn * mid_CAP_NATIVE * mid_NATIVE_SOL;

    res.json({
      route: ['CAP', 'NATIVE', 'SOL'],
      amountIn,
      amountOut,
      midPrice_CAP_NATIVE: mid_CAP_NATIVE,
      midPrice_NATIVE_SOL: mid_NATIVE_SOL,
      slippage: 0
    });
  } catch (e) {
    res.status(500).json({ message: 'quote failed', error: String(e?.message || e) });
  }
});

module.exports = router;
