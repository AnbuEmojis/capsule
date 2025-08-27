// backend/routes/wallets.js
const express = require('express');
const router = express.Router();

const CapBalance = require('../models/CapBalance');
let FiatWallet;
try { FiatWallet = require('../models/FiatWallet'); } catch { FiatWallet = null; }

function getUserId(req) {
  if (req.user?.id) return String(req.user.id);
  if (req.headers['x-user-id']) return String(req.headers['x-user-id']);
  if (req.query?.userId) return String(req.query.userId);
  return 'dev:local';
}

// GET /api/wallets/info?address=<capPublicKey>
router.get('/info', async (req, res) => {
  try {
    const userId = getUserId(req);
    const address = String(req.query.address || '').trim();

    const capDoc = await CapBalance.getFor({ userId, address: address || undefined });
    const capTokens = Number(capDoc.capUnits || 0);

    let nativeFromFiat = 0;
    if (FiatWallet) {
      try {
        const fw = await FiatWallet.findOne({ userId });
        if (fw) nativeFromFiat = Number(fw.balanceCents || 0) / 100;
      } catch {
        // ignore casting if FiatWallet uses ObjectId userId elsewhere
      }
    }

    res.json({
      address,
      userId,
      capTokens,
      nativeFromFiat,
      balances: { cap: capTokens, native: nativeFromFiat },
    });
  } catch (e) {
    console.error('wallets/info error', e);
    res.status(500).json({ error: 'internal_error' });
  }
});

module.exports = router;
