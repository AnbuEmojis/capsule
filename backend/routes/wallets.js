// backend/routes/wallets.js
const express = require('express');
const router = express.Router();
const FiatWallet = require('../models/FiatWallet');

// GET /api/wallets/info?address=04abcd...  (your existing on-chain view can stay)
// We ALSO return a NATIVE fiat mirror so Hub can show "NATIVE (fiat)" without hacks.
router.get('/info', async (req, res) => {
  try {
    const address = String(req.query.address || '');
    if (!address) return res.status(400).json({ error: 'missing_address' });

    // infer userId the same way front-end does (dev/local or session)
    const userId =
      req.get('x-user-id') ||
      req.query.userId ||
      (req.user && (req.user.id || req.user._id)) ||
      (req.session && req.session.user && (req.session.user.id || req.session.user._id)) ||
      null;

    // If a userId is present (same origin request), include fiat mirror
    let nativeFromFiat = undefined;
    if (req.userId) {
      const fw = await FiatWallet.findOne({ userId: req.userId });
      if (fw) nativeFromFiat = (fw.balanceCents || 0) / 100;
    }

    res.json({
      address,
      // ... keep/merge your on-chain fields here if you have them ...
      nativeFromFiat
    });
  } catch (e) {
    console.error('wallets/info error', e);
    res.status(500).json({ error: 'internal_error' });
  }
});

module.exports = router;
