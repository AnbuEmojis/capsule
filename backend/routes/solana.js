// backend/routes/solana.js
const express = require('express');
const router = express.Router();

const {
  getSolBalance,
  getSplBalances,
  LAMPORTS_PER_SOL,
  wcapEnabled
} = require('../integrations/solana_token'); // uses your existing helpers

// GET /api/solana/balances?address=<base58>
router.get('/balances', async (req, res) => {
  try {
    const address = (req.query.address || '').trim();
    if (!address) return res.status(400).json({ message: 'address required' });

    const sol = await getSolBalance(address);
    const spl = await getSplBalances(address);

    res.json({
      address,
      lamports: sol.lamports,
      sol: sol.sol,
      tokens: spl.items,     // [{ mint, amount, decimals, uiAmount }]
      wcap: wcapEnabled()    // { enabled: boolean, mint: string|null }
    });
  } catch (err) {
    res.status(500).json({ message: 'solana balances failed', error: String(err.message || err) });
  }
});

// GET /api/solana/price
router.get('/price', (req, res) => {
  const SOL_USD = Number(process.env.SOL_USD || '0');
  res.json({ SOL_USD });
});

module.exports = router;
