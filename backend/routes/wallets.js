const express = require('express');
const router = express.Router();
const FiatWallet = require('../models/FiatWallet');

const chainOf = (app) => app?.locals?.chain || app?.locals?.ledger || null;
const poolOf  = (app) => app?.locals?.pool  || app?.locals?.liquidityPool || null;
const userKeyOf = (req) => {
  const u = req.user;
  return u ? String(u._id || u.id || u.sub || u.email) : null;
};

// GET /api/wallets/info?address=<capPubkeyHex>
router.get('/info', async (req, res) => {
  try {
    const { address } = req.query;
    if (!address) return res.status(400).json({ error: 'missing_address' });

    const chain = chainOf(req.app);
    const pool  = poolOf(req.app);

    let capTokens = 0;
    let nativeOnChain = 0;

    if (chain?.getBalance) capTokens = Number(chain.getBalance(address) || 0);
    if (chain?.getNativeBalance) {
      nativeOnChain = Number(chain.getNativeBalance(address) || 0);
    } else if (pool?.getAccountNative) {
      nativeOnChain = Number(pool.getAccountNative(address) || 0);
    }

    // Optional fiat (mapped to NATIVE) if logged in
    let nativeFromFiat = null;
    let currency = 'USD';
    try {
      const userKey = userKeyOf(req);
      if (userKey) {
        const fw = await FiatWallet.findOne({ userKey }).lean();
        if (fw) {
          nativeFromFiat = (Number(fw.balanceCents || 0) / 100);
          currency = fw.currency || 'USD';
        }
      }
    } catch {}

    res.json({ address, capTokens, nativeOnChain, nativeFromFiat, currency });
  } catch (e) {
    console.error('wallets/info error', e);
    res.status(500).json({ error: 'internal_error' });
  }
});

module.exports = router;
