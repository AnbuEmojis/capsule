// backend/routes/transfers.js
const express = require('express');
const router = express.Router();
const { toFiat, fiatToNative } = require('../services/oracle');
const { computeCaTaxCAD } = require('../services/tax_ca');

/* ---------- helpers ---------- */
function tp(app){ return app?.locals?.transactionPool; }
function enqueue(app, tx){ if (tp(app)?.setTransaction) tp(app).setTransaction(tx); return tx; }
function nowId(){ return Date.now().toString(16) + Math.random().toString(16).slice(2); }
function pennyTreasury(){ return process.env.PENNY_TREASURY_ADDRESS || null; }
function chargePenny(app, pennyAmount, noteCtx){
  const amt = Number(pennyAmount || 0);
  const tre = pennyTreasury();
  if (!tre || !amt || !(amt > 0)) return null;
  const tx = {
    id: `penny-${nowId()}`,
    type: 'FEE',
    asset: 'NATIVE',
    outputMap: { [tre]: amt },
    note: `PENNY_FEE:${noteCtx || 'TRANSFER'}`
  };
  return enqueue(app, tx);
}
function cleanHex(s){ return String(s||'').trim(); }
function assert(ok, msg){ if(!ok) throw new Error(msg); }
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

/* ---------- POST /api/transfers/send ----------
Body:
{
  "asset": "NATIVE" | "CAP",
  "fromAddress": "<cap-chain-hex>",
  "toAddress": "<cap-chain-hex>",
  "amount": 12.34,
  "minerFee": 0.02,         // optional if autoTax is false
  "autoTax": true,          // when true, server computes Penny from CAD tax
  "country": "CA",
  "province": "ON",
  "currency": "CAD"
}
*/
router.post('/send', (req, res) => {
  try {
    const { asset, fromAddress, toAddress, amount, minerFee, autoTax } = req.body || {};
    const assetUp = String(asset || '').toUpperCase();
    const amt = Number(amount);

    assert(assetUp === 'NATIVE' || assetUp === 'CAP', 'asset must be NATIVE or CAP');
    assert(typeof fromAddress === 'string' && fromAddress.length > 0, 'fromAddress required');
    assert(typeof toAddress === 'string' && toAddress.length > 0, 'toAddress required');
    assert(Number.isFinite(amt) && amt > 0, 'amount must be > 0');

    const from = cleanHex(fromAddress);
    const to   = cleanHex(toAddress);

    let tx;
    if (assetUp === 'CAP') {
      tx = {
        id: `cap-send-${nowId()}`,
        type: 'TOKEN',
        symbol: 'CAP',
        outputMap: { [from]: -amt, [to]: amt },
        note: 'CAP_TRANSFER'
      };
    } else {
      tx = {
        id: `nat-send-${nowId()}`,
        type: 'TRANSFER',
        asset: 'NATIVE',
        outputMap: { [from]: -amt, [to]: amt },
        note: 'NATIVE_TRANSFER'
      };
    }

    enqueue(req.app, tx);

    // Penny fee (autoTax preferred)
    let pennyApplied = 0;
    let taxDetail = null;

    if (autoTax) {
      const a = autoTaxPenny(req, { asset: assetUp, amount: amt, op: 'TRANSFER' });
      pennyApplied = a.penny;
      taxDetail = a.detail;
      chargePenny(req.app, pennyApplied, `${assetUp}_TRANSFER_AUTO_TAX`);
    } else if (minerFee) {
      pennyApplied = Number(minerFee || 0);
      chargePenny(req.app, pennyApplied, `${assetUp}_TRANSFER`);
    }

    return res.json({ ok: true, queued: tx.id, asset: assetUp, amount: amt, pennyApplied, taxDetail });
  } catch (e) {
    return res.status(400).json({ message: e?.message || 'Bad request' });
  }
});

/* ---------- GET /api/transfers/estimate?asset=CAP&amount=10 ----------
   Keep simple (legacy); suggest Penny 0.01 unless you prefer tax estimate route. */
router.get('/estimate', (req, res) => {
  const assetUp = String(req.query.asset || 'NATIVE').toUpperCase();
  const amount = Number(req.query.amount || 0);
  if (!Number.isFinite(amount) || amount <= 0) {
    return res.status(400).json({ message: 'amount must be > 0' });
  }
  const suggestedPenny = 0.01;
  res.json({ asset: assetUp, amount, suggestedPenny });
});

module.exports = router;
