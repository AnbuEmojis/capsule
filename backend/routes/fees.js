// backend/routes/fees.js
const express = require('express');
const router = express.Router();
const { record, getTotals, getLedger } = require('../services/penny');
const { toCsv } = require('../services/csv');

// POST /api/fees/penny/record
router.post('/penny/record', (req, res) => {
  try {
    const { type = 'misc', asset = 'NATIVE', amount = 0, txRef = null, address = null, meta = {} } = req.body || {};
    // best-effort user id (if your auth middleware sets req.user)
    const userId = req.user?.userId || null;
    const e = record({ type, asset, amount, userId, address, txRef, meta });
    res.json({ ok: true, entry: e });
  } catch (e) {
    res.status(500).json({ message: 'record failed', error: String(e?.message || e) });
  }
});

// GET /api/fees/penny/ledger.csv?limit=1000&offset=0
router.get('/penny/ledger.csv', (req, res) => {
  try {
    const offset = Number(req.query.offset || 0);
    const limit = Math.min(5000, Number(req.query.limit || 1000));
    const rows = getLedger({ offset, limit });
    const csv = toCsv({
      columns: [
        { header: 'ts', accessor: r => new Date(r.ts).toISOString() },
        { header: 'userId', accessor: r => r.userId || '' },
        { header: 'type', accessor: r => r.type },
        { header: 'asset', accessor: r => r.asset },
        { header: 'amount', accessor: r => r.amount },
        { header: 'address', accessor: r => r.address || '' },
        { header: 'txRef', accessor: r => r.txRef || '' },
        { header: 'meta', accessor: r => JSON.stringify(r.meta || {}) }
      ],
      rows
    });
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="penny_ledger.csv"');
    res.send(csv);
  } catch (e) {
    res.status(500).send('ledger.csv failed: ' + (e?.message || e));
  }
});


// GET /api/fees/penny/totals
router.get('/penny/totals', (_req, res) => {
  res.json({ totals: getTotals() });
});

// GET /api/fees/penny/ledger?offset=0&limit=50
router.get('/penny/ledger', (req, res) => {
  const offset = Number(req.query.offset || 0);
  const limit = Math.min(200, Number(req.query.limit || 50));
  res.json({ entries: getLedger({ offset, limit }) });
});

module.exports = router;
