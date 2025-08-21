// === backend/routes/transactions.js ===
const express = require('express');
const Blockchain = require('../../cryptochain/blockchain');
const router = express.Router();

router.get('/history', (req, res) => {
  const blockchain = req.app.locals.blockchain;
  if (!blockchain) return res.status(503).json({ message: 'Chain not ready' });

  const out = [];
  // skip genesis (i = 1)
  for (let i = 1; i < blockchain.chain.length; i++) {
    const block = blockchain.chain[i];
    const data = Array.isArray(block.data) ? block.data : [];
    for (const tx of data) {
      // input can be null for SYSTEM/REWARD
      const inputAddr = tx.input?.address || 'SYSTEM';
      const inputAmt  = Number(tx.input?.amount ?? 0);

      // explode the output map into rows (easier for UI)
      for (const [addr, amt] of Object.entries(tx.outputMap || {})) {
        out.push({
          blockHash: block.hash,
          blockIndex: i,
          txId: tx.id,
          from: inputAddr,
          fromAmount: inputAmt,
          to: addr,
          toAmount: Number(amt),
          timestamp: block.timestamp
        });
      }
    }
  }

  // newest first
  out.sort((a, b) => b.timestamp - a.timestamp);
  res.json(out);
});

module.exports = router;