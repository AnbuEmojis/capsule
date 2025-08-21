// backend/routes/fiat.js
const express = require('express');
const router = express.Router();

/**
 * Dev FX + asset price helpers.
 * Override with env if you have a live price feed:
 *   NATIVE_USD, SOL_USD, CAP_NATIVE
 *   FX_USD_CAD, FX_USD_EUR, FX_USD_GBP, FX_USD_AUD, FX_USD_JPY
 */

const num = (v, d) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
};

// USD -> CCY
function fxUsdTo(ccy) {
  const up = (ccy || '').toUpperCase();
  const envName = `FX_USD_${up}`;
  const env = num(process.env[envName], NaN);
  if (Number.isFinite(env)) return env;

  // sane-ish dev defaults
  const DEF = { CAD: 1.35, USD: 1.0, EUR: 0.92, GBP: 0.78, AUD: 1.50, JPY: 155.0 };
  return DEF[up] ?? 1.0;
}

// CCY -> USD
function fxToUsd(ccy) {
  const r = fxUsdTo(ccy);
  return r ? 1 / r : 1.0;
}

async function midCapPerNative(req) {
  // Try AMM reserves via internal call (works in dev)
  try {
    const base = `${req.protocol}://${req.get('host')}`;
    const r = await fetch(`${base}/api/liquidity/reserves`).then(r => r.json());
    const cap = Number(r?.CAP || r?.cap || 0);
    const nat = Number(r?.NATIVE || r?.native || 0);
    if (cap > 0 && nat > 0) {
      // price (CAP → NATIVE) ≈ natReserve / capReserve
      return nat / cap;
    }
  } catch (_) {}

  // fallback to env (e.g., 0.01 NATIVE per CAP)
  return num(process.env.CAP_NATIVE, 0.01);
}

function nativeUsd() {
  return num(process.env.NATIVE_USD, 1.0); // dev: peg NATIVE≈$1
}

function solUsd() {
  return num(process.env.SOL_USD, 150.0); // dev default
}

router.get('/convert', async (req, res) => {
  try {
    const asset = String(req.query.asset || 'NATIVE').toUpperCase();
    const amount = num(req.query.amount, 0);
    const to = String(req.query.to || 'USD').toUpperCase();
    if (!(amount > 0)) return res.status(400).json({ message: 'amount > 0 required' });

    let usd = 0;

    if (asset === 'NATIVE') {
      usd = amount * nativeUsd();
    } else if (asset === 'SOL') {
      usd = amount * solUsd();
    } else if (asset === 'CAP') {
      const capNative = await midCapPerNative(req); // CAP→NATIVE
      usd = amount * capNative * nativeUsd();
    } else {
      // Unknown asset → treat like NATIVE
      usd = amount * nativeUsd();
    }

    const value = usd * fxUsdTo(to);

    res.json({
      asset,
      amount,
      to,
      value,
      usd,
      meta: {
        NATIVE_USD: nativeUsd(),
        SOL_USD: solUsd(),
        CAP_NATIVE: await midCapPerNative(req),
        FX_USD_TO: fxUsdTo(to)
      }
    });
  } catch (e) {
    res.status(500).json({ message: 'convert failed', error: String(e?.message || e) });
  }
});

module.exports = router;
