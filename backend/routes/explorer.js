// backend/routes/explorer.js
const express = require('express');
const router = express.Router();

/* ---------- helpers ---------- */
function chainOf(app){ return app?.locals?.blockchain?.chain || []; }
function lpLedger(app){ return app?.locals?.__lp || { totalShares:0, byAddr:{} }; }
function txList(app){
  const list = [];
  const chain = chainOf(app);
  for (let h = 0; h < chain.length; h++){
    const block = chain[h] || {};
    const txs = Array.isArray(block.data) ? block.data : (block.transactions || []);
    for (const tx of (txs || [])){
      list.push({ tx, height: h, timestamp: block.timestamp || null });
    }
  }
  return list;
}
function fromOut(map, addr){
  const v = Number((map||{})[addr] || 0);
  return Number.isFinite(v) ? v : 0;
}

/** Compute NATIVE balance by scanning outputMap deltas of NATIVE/FEE/TRANSFER txs */
function getNativeBalance(app, address){
  let sum = 0;
  for (const { tx } of txList(app)){
    const t = (tx?.type || '').toUpperCase();
    const asset = (tx?.asset || '').toUpperCase();
    if (asset === 'NATIVE' || t === 'TRANSFER' || t === 'FEE'){
      sum += fromOut(tx.outputMap, address);
    }
  }
  return sum;
}

/** Compute CAP token balance from TOKEN txs with symbol 'CAP' */
function getCapBalance(app, address){
  let sum = 0;
  for (const { tx } of txList(app)){
    const t = (tx?.type || '').toUpperCase();
    const sym = (tx?.symbol || '').toUpperCase();
    if (t === 'TOKEN' && sym === 'CAP'){
      sum += fromOut(tx.outputMap, address);
    }
  }
  return sum;
}

/** Return last N txs touching address */
function recentForAddress(app, address, limit = 25){
  const out = [];
  const list = txList(app);
  for (let i = list.length - 1; i >= 0 && out.length < limit; i--){
    const { tx, height, timestamp } = list[i];
    if (!tx?.outputMap) continue;
    if (Object.prototype.hasOwnProperty.call(tx.outputMap, address)){
      out.push({
        id: tx.id || null,
        type: tx.type || null,
        asset: tx.asset || tx.symbol || null,
        delta: fromOut(tx.outputMap, address),
        height,
        timestamp,
        note: tx.note || null
      });
    }
  }
  return out;
}

/** Penny metrics */
function pennyMetrics(app){
  const chain = chainOf(app);
  let totalLifetime = 0;
  const perBlock = [];
  const now = Date.now();
  let last24h = 0;

  for (let h = 0; h < chain.length; h++){
    const block = chain[h] || {};
    const ts = block.timestamp || 0;
    const txs = Array.isArray(block.data) ? block.data : (block.transactions || []);
    let penny = 0;
    for (const tx of (txs || [])){
      const t = (tx?.type || '').toUpperCase();
      const asset = (tx?.asset || '').toUpperCase();
      const note = String(tx?.note || '');
      const isPenny = t === 'FEE' && asset === 'NATIVE' && note.startsWith('PENNY_FEE');
      if (isPenny){
        // sum of all positive outputs for this fee tx
        const outMap = tx.outputMap || {};
        for (const k of Object.keys(outMap)){
          const v = Number(outMap[k] || 0);
          if (v > 0) penny += v;
        }
      }
    }
    if (penny){
      totalLifetime += penny;
      perBlock.push({ height: h, timestamp: ts, penny });
      if (now - ts <= 24*60*60*1000) last24h += penny;
    }
  }
  return { totalLifetime, last24h, perBlock };
}

/* ---------- ROUTES ---------- */

// GET /api/explorer/address/:addr
router.get('/address/:addr', (req, res) => {
  try {
    const address = String(req.params.addr || '').trim();
    if (!address) return res.status(400).json({ message: 'address required' });

    const native = getNativeBalance(req.app, address);
    const cap    = getCapBalance(req.app, address);

    const ledger = lpLedger(req.app);
    const shares = Number(ledger.byAddr?.[address] || 0);
    const totalShares = Number(ledger.totalShares || 0);
    const sharePct = totalShares > 0 ? (shares / totalShares) : 0;

    const recent = recentForAddress(req.app, address, 25);

    res.json({
      address,
      balances: {
        NATIVE: native,
        CAP: cap
      },
      lp: {
        shares,
        totalShares,
        sharePct
      },
      recent
    });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

// GET /api/explorer/tx/:id
router.get('/tx/:id', (req, res) => {
  try {
    const id = String(req.params.id || '').trim();
    if (!id) return res.status(400).json({ message: 'id required' });
    for (const { tx, height, timestamp } of txList(req.app)){
      if ((tx?.id || '') === id){
        return res.json({ height, timestamp, tx });
      }
    }
    res.status(404).json({ message: 'tx not found' });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

// GET /api/explorer/pennies
router.get('/pennies', (_req, res) => {
  try {
    res.json(pennyMetrics(_req.app));
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

module.exports = router;
