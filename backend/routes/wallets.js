// backend/routes/wallets.js
const express = require('express');
const router = express.Router();
const FiatWallet = require('../models/FiatWallet');

// helper
const pickNum = (...vals) => {
  for (const v of vals) {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return 0;
};

router.get('/info', async (req, res) => {
  try {
    const address = String(req.query.address || '').trim();
    if (!address) return res.status(400).json({ error: 'missing_address' });

    // unify user id detection
    const userId =
      req.userId ||
      req.get('x-user-id') ||
      req.query.userId ||
      (req.user && (req.user.id || req.user._id)) ||
      (req.session && req.session.userId) ||
      null;

    // CAP from swaps ledger (populated by /api/swaps/execute)
    const capFromLedger = pickNum(req.app.locals?.ledger?.cap?.[address]);

    // if you ever populate on-chain balances into globals, we’ll take the first finite
    const capFromChain = pickNum(
      global?.chain?.balances?.CAP?.[address],
      global?.state?.capBalances?.[address],
      global?.wallets?.cap?.[address]
    );

    const capTokens = pickNum(capFromLedger, capFromChain);

    // fiat mirror → "NATIVE"
    let nativeFromFiat = undefined;
    if (userId) {
      const fw = await FiatWallet.findOne({ userId }).lean();
      nativeFromFiat = pickNum((fw?.balanceCents || 0) / 100);
    }

    const nativeOnChain = pickNum(
      global?.chain?.balances?.NATIVE?.[address],
      global?.state?.nativeBalances?.[address]
    );

    res.json({ address, capTokens, nativeFromFiat, nativeOnChain });
  } catch (e) {
    console.error('wallets/info error', e);
    res.status(500).json({ error: 'internal_error' });
  }
});

module.exports = router;
