// backend/routes/bridge.js
const express = require('express');
const router = express.Router();

// If you later wire real Solana, you can swap this logic.
function getRates() {
  return {
    NATIVE_PER_CAP: 0.01,     // 1 CAP = 0.01 NATIVE
    NATIVE_PER_SOL: 150,      // 1 SOL = 150 NATIVE  (=> ~ $150)
  };
}

function toNum(x) {
  if (x === undefined || x === null || x === '') return NaN;
  const n = Number(x);
  return Number.isFinite(n) ? n : NaN;
}

// GET /api/bridge/quote?cap=100
router.get('/quote', async (req, res) => {
  try {
    const cap = toNum(req.query.cap);
    if (!Number.isFinite(cap) || cap <= 0) {
      return res.status(400).json({ error: 'bad_request', detail: 'positive cap required' });
    }
    const R = getRates();
    const native = cap * R.NATIVE_PER_CAP;
    const sol = native / R.NATIVE_PER_SOL;

    return res.json({
      route: 'CAP->NATIVE->SOL',
      capIn: cap,
      nativeIntermediate: native,
      solOut: sol,
    });
  } catch (e) {
    console.error('/bridge/quote error', e);
    res.status(500).json({ error: 'internal_error' });
  }
});

// POST /api/bridge/execute  { cap, fromCapAddress, toSolAddress }
router.post('/execute', async (req, res) => {
  try {
    const cap = toNum(req.body?.cap);
    const fromCapAddress = (req.body?.fromCapAddress || '').trim();
    const toSolAddress   = (req.body?.toSolAddress   || '').trim();

    if (!Number.isFinite(cap) || cap <= 0 || !fromCapAddress || !toSolAddress) {
      return res.status(400).json({ error: 'bad_request', detail: 'cap, fromCapAddress, toSolAddress required' });
    }

    // TODO: decrement CAP balance for fromCapAddress and create an outbound “bridge” record.
    // For now we return a simulated “pending” Solana signature so your UI can proceed.
    const fakeSig = 'SIMULATED_DEVNET_' + Math.random().toString(36).slice(2);

    return res.json({
      ok: true,
      route: 'CAP->NATIVE->SOL',
      capIn: cap,
      solana: {
        to: toSolAddress,
        signature: fakeSig,
        network: 'devnet',
        note: 'Replace this with a real @solana/web3.js send when ready.',
      }
    });
  } catch (e) {
    console.error('/bridge/execute error', e);
    res.status(500).json({ error: 'internal_error' });
  }
});

module.exports = router;
