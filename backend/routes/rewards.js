const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');

const RewardsSchema = new mongoose.Schema({
  userId: { type: String, index: true, required: true },
  points: { type: Number, default: 0 },
  streak: { type: Number, default: 0 },
  lastCheckin: { type: Date, default: null },
  claims: { type: Number, default: 0 },
}, { timestamps: true });

const Rewards = mongoose.models.Rewards || mongoose.model('Rewards', RewardsSchema);

function getUserId(req) {
  return (req.user && (req.user.id || req.user._id)) || req.get('x-user-id') || 'dev:local';
}

async function getState(userId) {
  let doc = await Rewards.findOne({ userId });
  if (!doc) doc = await Rewards.create({ userId });
  return doc;
}

router.get('/state', async (req, res) => {
  try {
    const doc = await getState(getUserId(req));
    res.json({ points: doc.points, streak: doc.streak, lastCheckin: doc.lastCheckin, claims: doc.claims });
  } catch (e) {
    console.error('/api/rewards/state', e);
    res.status(500).json({ error: 'internal_error' });
  }
});

router.post('/checkin', async (req, res) => {
  try {
    const doc = await getState(getUserId(req));
    const today = new Date(); today.setHours(0,0,0,0);
    const last = doc.lastCheckin ? new Date(doc.lastCheckin) : null;
    if (last) last.setHours(0,0,0,0);
    if (last && +last === +today) return res.status(409).json({ error: 'already_checked_in', points: doc.points, streak: doc.streak });

    let newStreak = 1;
    if (last) {
      const yday = new Date(today); yday.setDate(yday.getDate() - 1);
      if (+last === +yday) newStreak = (doc.streak || 0) + 1;
    }
    doc.streak = newStreak;
    doc.lastCheckin = new Date();
    doc.points = (doc.points || 0) + 10;

    await doc.save();
    res.json({ ok: true, points: doc.points, streak: doc.streak });
  } catch (e) {
    console.error('/api/rewards/checkin', e);
    res.status(500).json({ error: 'internal_error' });
  }
});

router.post('/claim', async (req, res) => {
  try {
    const doc = await getState(getUserId(req));
    doc.points = (doc.points || 0) + 100;
    doc.claims = (doc.claims || 0) + 1;
    await doc.save();
    res.json({ ok: true, points: doc.points, claims: doc.claims });
  } catch (e) {
    console.error('/api/rewards/claim', e);
    res.status(500).json({ error: 'internal_error' });
  }
});

module.exports = router;
