const express = require('express');
const router = express.Router();
const User = require('../models/User');

function uid(req){ return req.user?.id || req.session?.userId || req.body?.userId || req.query?.userId; }

router.get('/prefs', async (req,res)=>{
  const u = await User.findById(uid(req)).lean().catch(()=>null);
  res.json({ currency: u?.prefs?.currency || 'USD' });
});

router.post('/prefs/currency', async (req,res)=>{
  const userId = uid(req); const { currency } = req.body || {};
  if (!userId || !currency) return res.status(400).json({ error:'bad_request' });
  await User.findByIdAndUpdate(userId, { $set: { 'prefs.currency': currency } }, { upsert:true });
  res.json({ ok:true, currency });
});

module.exports = router;
