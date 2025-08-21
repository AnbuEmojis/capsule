// backend/routes/rewards.js
const express = require('express');
const router = express.Router();
const { summary, claim, accrue, constants } = require('../services/rewards');

// GET /api/rewards/summary
router.get('/summary', (req, res) => {
  try {
    const userId = req.user?.userId || null;
    const s = summary(userId);
    res.json({ ...s, config: constants });
  } catch (e) {
    res.status(500).json({ message: 'summary failed', error: String(e?.message || e) });
  }
});

// POST /api/rewards/claim  { amountCap?: number }
router.post('/claim', async (req, res) => {
  try {
    const userId = req.user?.userId || null;
    const s = summary(userId);
    const amountCap = Number(req.body?.amountCap || s.claimableCap || 0);

    const c = claim({ userId, amountCap });
    if (!c.ok) return res.status(400).json(c);

    // credit via your CAP faucet (mine to finalize)
    const host = `${req.protocol}://${req.get('host')}`;
    const capAddress = req.body?.capAddress || req.body?.address || req.user?.capAddress || null;
    if (!capAddress) {
      return res.json({ ...c, faucet: { ok: false, message: 'No CAP address provided' } });
    }

    const fac = await fetch(`${host}/api/token/faucet`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(req.headers.authorization ? { authorization: req.headers.authorization } : {}) },
      body: JSON.stringify({ address: capAddress, amount: c.cap })
    }).then(r => r.json()).catch(() => ({ ok: false }));

    res.json({ ...c, faucet: fac });
  } catch (e) {
    res.status(500).json({ message: 'claim failed', error: String(e?.message || e) });
  }
});

// (Optional) admin/dev: accrue points directly (e.g., promos)
// POST /api/rewards/accrue { points?:number, pennyNative?:number, reason?:string }
router.post('/accrue', (req, res) => {
  try {
    const userId = req.user?.userId || null;
    const { points = null, pennyNative = 0, reason = 'manual' } = req.body || {};
    const a = accrue({ userId, reason, pennyNative, points, meta: {} });
    res.json(a);
  } catch (e) {
    res.status(500).json({ message: 'accrue failed', error: String(e?.message || e) });
  }
});

module.exports = router;
