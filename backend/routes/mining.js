const express = require('express');
const router = express.Router();

// GET /api/mining/stats
router.get('/stats', (req, res) => {
  const { blockchain, transactionPool } = req.app.locals;
  const height = blockchain?.chain?.length ?? 0;
  const last = height ? blockchain.chain[height - 1] : null;
  res.json({
    height,
    lastTimestamp: last?.timestamp ?? null,
    mempoolSize: transactionPool ? Object.keys(transactionPool.transactionMap || {}).length : 0
  });
});

// GET /api/mining/mempool
router.get('/mempool', (req, res) => {
  const { transactionPool } = req.app.locals;
  const map = transactionPool?.transactionMap || {};
  const items = Object.values(map).map(tx => ({
    id: tx.id, type: tx.type, symbol: tx.symbol,
    fee: Number(tx.fee) || 0,
    to: tx.outputMap ? Object.keys(tx.outputMap) : [],
    amountToWallet: tx.outputMap ? Object.values(tx.outputMap).reduce((a,b)=>a+(Number(b)||0),0) : 0
  }));
  res.json({ count: items.length, items });
});

// POST /api/mining/mempool/clear   (dev only)
router.post('/mempool/clear', (req, res) => {
  const { transactionPool } = req.app.locals;
  if (process.env.NODE_ENV !== 'development') {
    return res.status(403).json({ message: 'dev only' });
  }
  if (transactionPool?.clear) transactionPool.clear();
  res.json({ ok: true });
});

// GET /api/mining/fee/recommendation
router.get('/fee/recommendation', (req, res) => {
  const { transactionPool } = req.app.locals;
  const txs = Object.values(transactionPool?.transactionMap || {});
  const fees = txs.map(t => Number(t.fee) || 0).filter(n => n > 0).sort((a,b)=>a-b);
  const pick = (p) => fees.length ? fees[Math.min(fees.length-1, Math.floor(p*(fees.length-1)))] : 0;
  res.json({
    low: pick(0.25), medium: pick(0.5), high: pick(0.9),
    note: 'fee is in NATIVE; recommendations are based on current mempool (0 if none)'
  });
});

module.exports = router;
