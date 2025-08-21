// backend/routes/prices.js
const express = require('express');
const router = express.Router();

function num(envKey, fallback) {
  const v = process.env[envKey];
  if (v === undefined || v === null || v === '') return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

router.get('/latest', (req, res) => {
  const pool = req.app?.locals?.pool;

  // Derive CAP↔NATIVE from pool if available, else env
  let CAP_NATIVE;
  try {
    if (pool?.getQuote) {
      // 1 CAP → NATIVE
      const q = pool.getQuote({ inputSymbol: 'CAP', inputAmount: 1 });
      CAP_NATIVE = Number(q?.outputAmount) || undefined;
    } else if (pool?.getReserves) {
      const { CAP, NATIVE } = pool.getReserves();
      if (CAP > 0 && NATIVE > 0) CAP_NATIVE = NATIVE / CAP; // rough mid
    }
  } catch (_) { /* ignore */ }
  if (!Number.isFinite(CAP_NATIVE)) CAP_NATIVE = num('CAP_NATIVE', 0.01);

  // Base rates from env (with sane fallbacks)
  const NATIVE_USD = num('NATIVE_USD', 1);      // your chain's native coin in USD
  const SOL_USD    = num('SOL_USD', 150);       // devnet approx
  // If SOL_NATIVE not given, derive from USD legs
  let SOL_NATIVE   = Number(process.env.SOL_NATIVE);
  if (!Number.isFinite(SOL_NATIVE) && NATIVE_USD > 0) {
    SOL_NATIVE = SOL_USD / NATIVE_USD;
  }

  const WCAP_SOL_NATIVE = num('WCAP_SOL_NATIVE', 0); // optional

  const fx = {
    NATIVE_USD,
    CAP_NATIVE,
    SOL_USD,
    SOL_NATIVE,
    WCAP_SOL_NATIVE,
    // optional region FX if you use them on the UI
    FX_USD_CAD: num('FX_USD_CAD', 1.35),
    FX_USD_EUR: num('FX_USD_EUR', 0.92),
    FX_USD_GBP: num('FX_USD_GBP', 0.79),
  };

  res.json({
    ok: true,
    ts: Date.now(),
    ...fx,
  });
});

module.exports = router;
