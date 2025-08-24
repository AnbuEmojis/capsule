const express = require('express');
const router  = express.Router();

// On-chain pieces you already have:
const Wallet  = require('../../cryptochain/wallet');
const { calculateTokenBalance } = require('../../cryptochain/token/token-balance');

// Fiat model
const FiatWallet = require('../models/FiatWallet');

// GET /api/wallets/info?address=04...  (CAP addr, uncompressed hex)
router.get('/info', async (req, res) => {
  try {
    const address = (req.query.address || '').trim();
    res.set('Cache-Control', 'no-store');  // <-- add this
    if (!address) return res.status(400).json({ message:'missing address' });

    // — On-chain balances (existing behavior) —
    const bc = req.app.locals.blockchain;
    let native = 0, capTokens = 0;

    if (bc) {
      // native
      const account = bc.accountMap?.[address] || bc.accounts?.[address];
      native = Number(account?.balance || 0);
      // tokens
      try { capTokens = calculateTokenBalance(bc, 'CAP', address) || 0; } catch {}
    }

    // — Fiat wallet (NATIVE == $1) —
    let fiat = { balanceCents: 0, currency: 'USD' };
    try {
      if (req.user) {
        const fw = await FiatWallet.findByUser(req.user);
        if (fw) fiat = { balanceCents: fw.balanceCents, currency: fw.currency };
      }
    } catch (e) {
      // Never crash the endpoint on cast errors; just log and continue.
      console.warn('wallets/info fiat lookup warn:', e?.message || e);
    }

    return res.json({
      address,
      native,
      capTokens,
      fiat
    });
  } catch (e) {
    return res.status(500).json({ message:'info failed', error: String(e?.message || e) });
  }
});

// (you can keep any other routes below, unchanged)
module.exports = router;
