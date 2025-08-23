// backend/routes/user.js
const express = require('express');
const router = express.Router();
const User = require('../models/User'); // see step 3 if you don't have this model yet

// Get current user prefs
router.get('/prefs', async (req, res) => {
  try {
    const userId = req.user?.id || req.query.userId; // adapt to your auth
    if (!userId) return res.status(401).json({ error: 'auth_required' });
    const u = await User.findById(userId).lean();
    res.json({ currency: u?.prefs?.currency || 'USD' });
  } catch (e) {
    console.error('GET /api/user/prefs', e);
    res.status(500).json({ error: 'internal_error' });
  }
});

// Update currency
router.post('/prefs/currency', async (req, res) => {
  try {
    const userId = req.user?.id || req.body.userId;
    const { currency } = req.body;
    if (!userId || !currency) return res.status(400).json({ error: 'bad_request' });
    await User.findByIdAndUpdate(
      userId,
      { $set: { 'prefs.currency': currency } },
      { upsert: true }
    );
    res.json({ ok: true, currency });
  } catch (e) {
    console.error('POST /api/user/prefs/currency', e);
    res.status(500).json({ error: 'internal_error' });
  }
});

module.exports = router;
