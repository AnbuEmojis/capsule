const express = require('express');
const router = express.Router();
const Reward = require('../models/Reward');

function uid(req){ return req.user?.id || req.session?.userId || req.body?.userId || req.query?.userId; }
async function ensure(userId){ return Reward.findOneAndUpdate({ userId }, {}, { upsert:true, new:true }); }

// GET balance
router.get('/balance', async (req,res)=>{
  const r = await ensure(uid(req));
  res.json({ points: r.points || 0, streak: r.streak || 0, lastCheckinAt: r.lastCheckinAt });
});

// Daily check-in
router.post('/checkin', async (req,res)=>{
  const r = await ensure(uid(req));
  const now = new Date(); const last = r.lastCheckinAt ? new Date(r.lastCheckinAt) : null;
  const newDay = !last || last.toDateString() !== now.toDateString();
  if (!newDay) return res.status(400).json({ error:'already_checked_in' });
  r.points = (r.points||0) + 10;
  r.streak = (last && (now - last) < 48*3600e3) ? (r.streak||0) + 1 : 1;
  r.lastCheckinAt = now;
  r.ledger.push({ type:'checkin', delta:+10, note:'Daily' });
  await r.save(); res.json({ ok:true, points:r.points, streak:r.streak });
});

// Claim
router.post('/claim', async (req,res)=>{
  const r = await ensure(uid(req));
  if ((r.points||0) < 100) return res.status(400).json({ error:'not_enough_points' });
  r.points -= 100;
  r.ledger.push({ type:'claim', delta:-100, note:'Claim' });
  await r.save(); res.json({ ok:true, points:r.points });
});

module.exports = router;
