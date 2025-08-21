// backend/routes/bridge.js
const express = require('express');
const router = express.Router();
const { PublicKey, Connection, LAMPORTS_PER_SOL, clusterApiUrl } = require('@solana/web3.js');

// One source of truth for Solana-side helpers
const sol = require('../integrations/solana_token'); // must export sendSol() and getCustodyPubkey()

// ---- helpers ---------------------------------------------------
const num = (x, d = 6) => {
  const v = Number(x);
  return Number.isFinite(v) ? Number(v.toFixed(d)) : 0;
};
const envf = (key, def) => {
  const v = parseFloat(process.env[key]);
  return Number.isFinite(v) ? v : def;
};

// CAP -> SOL pricing (env driven; devnet-friendly defaults)
function quoteCap2Sol(amountCap) {
  const capNative = envf('CAP_NATIVE', 0.01);   // native per 1 CAP
  const nativeUsd = envf('NATIVE_USD', 1.00);   // USD per 1 NATIVE
  const solUsd    = envf('SOL_USD', 150.0);     // USD per 1 SOL
  const feeBps    = 25;                         // 0.25%
  const pennyNative = 0.02;                     // flat “Penny” fee (native)

  const nativeOut = amountCap * capNative;
  const solGross  = (nativeOut * nativeUsd) / solUsd;
  const fee       = solGross * (feeBps / 10000);
  const solOut    = Math.max(solGross - fee, 0);

  return {
    amountCap: num(amountCap),
    nativeOut: num(nativeOut),
    outSol:    num(solOut, 9),
    feeBps,
    pennyNative: num(pennyNative)
  };
}

// ---- routes ----------------------------------------------------

// GET /api/bridge/cap2sol/quote?amountCap=10
router.get('/cap2sol/quote', (req, res) => {
  const amt = Number(req.query.amountCap || 0);
  if (!(amt > 0)) return res.status(400).json({ message: 'amountCap > 0 required' });
  return res.json(quoteCap2Sol(amt));
});

// POST /api/bridge/cap2sol/execute
// body: { amountCap, toPubkey, fromCapAddress, autoTax?, country?, province?, currency? }
router.post('/cap2sol/execute', async (req, res) => {
  try {
    const { amountCap, toPubkey, fromCapAddress } = req.body || {};
    const amt = Number(amountCap);
    if (!toPubkey) return res.status(400).json({ message: 'toPubkey required' });
    if (!(amt > 0)) return res.status(400).json({ message: 'amountCap > 0 required' });

    // validate destination is a proper base58 pubkey
    new PublicKey(toPubkey);

    // price/fee calc
    const q = quoteCap2Sol(amt);

    // send SOL from custody (devnet)
    const lamports = Math.max(1, Math.floor(q.outSol * LAMPORTS_PER_SOL));
    const solSig = await sol.sendSol(toPubkey, lamports);

    return res.json({
      ok: true,
      outSol: q.outSol,
      feeBps: q.feeBps,
      pennyNative: q.pennyNative,
      solSig,
      explorer: `https://explorer.solana.com/tx/${solSig}?cluster=devnet`,
      toPubkey,
      custody: sol.getCustodyPubkey(),
      fromCapAddress
    });
  } catch (e) {
    return res.status(500).json({ message: 'cap2sol execute failed', error: String(e?.message || e) });
  }
});

// (Optional) identify custody address
router.get('/cap2sol/custody', (_req, res) => {
  res.json({ pubkey: sol.getCustodyPubkey() });
});

// (Optional) check tx status on devnet
router.get('/cap2sol/status', async (req, res) => {
  try {
    const { sig } = req.query;
    if (!sig) return res.status(400).json({ message: 'sig required' });
    const rpc = process.env.SOLANA_RPC || clusterApiUrl('devnet');
    const connection = new Connection(rpc, 'confirmed');
    const st = await connection.getSignatureStatuses([String(sig)], { searchTransactionHistory: true });
    return res.json({ value: st.value?.[0] || null });
  } catch (e) {
    return res.status(500).json({ message: 'cap2sol status failed', error: String(e?.message || e) });
  }
});

module.exports = router;
