// backend/routes/tax.js
const express = require('express');
const router = express.Router();

// CA tax table (inclusive rates)
const CA_RATES = {
  // HST
  ON: 0.13, NB: 0.15, NL: 0.15, NS: 0.15, PE: 0.15,
  // GST only
  AB: 0.05, NT: 0.05, NU: 0.05, YT: 0.05,
  // GST + PST combos
  BC: 0.12, SK: 0.11, MB: 0.12,
  // QC GST (5%) + QST (9.975%)
  QC: 0.14975
};

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

function fxUsdTo(ccy) {
  const up = (ccy || '').toUpperCase();
  const envName = `FX_USD_${up}`;
  const env = num(process.env[envName], NaN);
  if (Number.isFinite(env)) return env;
  const DEF = { CAD: 1.35, USD: 1.0, EUR: 0.92, GBP: 0.78, AUD: 1.50, JPY: 155.0 };
  return DEF[up] ?? 1.0;
}

async function midCapPerNative(req) {
  try {
    const base = `${req.protocol}://${req.get('host')}`;
    const r = await fetch(`${base}/api/liquidity/reserves`).then(r => r.json());
    const cap = Number(r?.CAP || r?.cap || 0);
    const nat = Number(r?.NATIVE || r?.native || 0);
    if (cap > 0 && nat > 0) return nat / cap;
  } catch (_) {}
  return num(process.env.CAP_NATIVE, 0.01);
}

// GET /api/tax/estimate?country=CA&province=ON&asset=CAP&amount=10&currency=CAD
router.get('/estimate', async (req, res) => {
  try {
    const country = String(req.query.country || 'CA').toUpperCase();
    const province = String(req.query.province || 'ON').toUpperCase();
    const asset = String(req.query.asset || 'CAP').toUpperCase();
    const amount = num(req.query.amount, 0);
    const currency = String(req.query.currency || 'USD').toUpperCase();

    if (!(amount > 0)) return res.status(400).json({ message: 'amount > 0 required' });

    let rate = 0;
    if (country === 'CA') rate = CA_RATES[province] ?? 0.13; // default to ON if unknown

    // Convert "amount of asset" → NATIVE units (for Penny)
    let nativeAmount = 0;
    if (asset === 'NATIVE') {
      nativeAmount = amount;
    } else if (asset === 'SOL') {
      // SOL → USD → NATIVE
      const usd = amount * solUsd();
      nativeAmount = usd / nativeUsd();
    } else if (asset === 'CAP') {
      const capNat = await midCapPerNative(req); // CAP→NATIVE
      nativeAmount = amount * capNat;
    } else {
      nativeAmount = amount; // treat unknown as native
    }

    const pennyNative = nativeAmount * rate;

    // Also give fiat view in requested currency
    const usd = pennyNative * nativeUsd();
    const fiat = usd * fxUsdTo(currency);

    res.json({
      country,
      region: { country, province },
      asset,
      amount,
      ratePercent: rate * 100,
      pennyNative,
      estimatedFiat: { currency, value: fiat },
      notes: 'Estimate only. Applied as "Penny" on execution if autoTax=true.'
    });
  } catch (e) {
    res.status(500).json({ message: 'tax estimate failed', error: String(e?.message || e) });
  }
});

module.exports = router;
