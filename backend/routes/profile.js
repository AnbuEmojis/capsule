// backend/routes/profile.js
const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const User = require('../models/User');

// ---------- helpers ----------
function getToken(req) {
  const h = req.headers.authorization || '';
  const [, token] = h.split(' ');
  return token || null;
}

function verifyJWT(token) {
  if (!token) return null;
  try { return jwt.verify(token, process.env.JWT_SECRET); }
  catch { return null; }
}

function parseExternalId(s) {
  // Accept "oauth:github:65869452" or "oauth:google:123456789"
  if (typeof s !== 'string') return null;
  if (!s.startsWith('oauth:')) return null;
  const parts = s.split(':');
  if (parts.length !== 3) return null;
  const [, provider, sub] = parts;
  if (!provider || !sub) return null;
  return { provider, sub };
}

function isObjectId(x) {
  return typeof x === 'string' && mongoose.Types.ObjectId.isValid(x);
}

/**
 * Resolve user from JWT payload safely.
 * Priority:
 *   1) payload.userId if it is a valid ObjectId  -> findById
 *   2) payload.userId if it's "oauth:provider:sub" -> findOne({oauth.provider, oauth.sub})
 *   3) payload.provider + payload.sub (if present) -> findOne({oauth.provider, oauth.sub})
 *   4) payload.email -> findOne({email})
 */
async function resolveUser(payload) {
  if (!payload) return null;

  // 1) Mongo ObjectId
  if (payload.userId && isObjectId(payload.userId)) {
    const u = await User.findById(payload.userId);
    if (u) return u;
  }

  // 2) legacy "oauth:provider:sub"
  if (payload.userId && typeof payload.userId === 'string') {
    const ext = parseExternalId(payload.userId);
    if (ext) {
      const u = await User.findOne({ 'oauth.provider': ext.provider, 'oauth.sub': ext.sub });
      if (u) return u;
    }
  }

  // 3) provider+sub directly on payload
  if (payload.provider && payload.sub) {
    const u = await User.findOne({ 'oauth.provider': payload.provider, 'oauth.sub': payload.sub });
    if (u) return u;
  }

  // 4) email fallback
  if (payload.email) {
    const u = await User.findOne({ email: payload.email });
    if (u) return u;
  }

  return null;
}

async function requireAuth(req, res, next) {
  const token = getToken(req);
  const payload = verifyJWT(token);
  if (!payload) return res.status(401).json({ message: 'Invalid token' });

  const user = await resolveUser(payload);
  if (!user) return res.status(401).json({ message: 'User not found for token' });

  req.dbUser = user;
  req.jwtPayload = payload;
  next();
}

// ---------- routes ----------

// GET /api/profile/me
router.get('/me', requireAuth, async (req, res) => {
  const u = req.dbUser.toObject();
  res.json({
    _id: u._id,
    email: u.email,
    currency: u.currency,
    addresses: u.addresses || []
  });
});

// POST /api/profile/prefs/currency  { currency: "USD" | "CAD" | ... }
router.post('/prefs/currency', requireAuth, async (req, res) => {
  const { currency } = req.body || {};
  if (currency) req.dbUser.currency = String(currency).toUpperCase();
  await req.dbUser.save();
  res.json({ ok: true, currency: req.dbUser.currency });
});

// GET /api/profile/addresses
router.get('/addresses', requireAuth, async (req, res) => {
  res.json({ items: req.dbUser.addresses || [] });
});

// upsert helper
async function upsertAddress(user, { chain, address, label, makeDefault }) {
  if (!chain || !address) throw new Error('chain and address required');
  const CH = String(chain).toUpperCase();
  if (!['CAP','SOL'].includes(CH)) throw new Error('chain must be CAP or SOL');

  user.addresses = (user.addresses || []).filter(a => !(a.chain === CH && a.address === address));
  user.addresses.push({ chain: CH, address, label: label || '', isDefault: false });

  if (makeDefault) {
    user.addresses.forEach(a => { if (a.chain === CH) a.isDefault = (a.address === address); });
  }

  await user.save();
  return user.addresses;
}

// POST /api/profile/addresses
router.post('/addresses', requireAuth, async (req, res) => {
  try {
    const items = await upsertAddress(req.dbUser, req.body || {});
    res.json({ ok: true, items });
  } catch (e) {
    res.status(400).json({ message: String(e.message || e) });
  }
});

// Back-compat: POST /api/profile/address
router.post('/address', requireAuth, async (req, res) => {
  try {
    const items = await upsertAddress(req.dbUser, req.body || {});
    res.json({ ok: true, items });
  } catch (e) {
    res.status(400).json({ message: String(e.message || e) });
  }
});

// PUT /api/profile/addresses/default  { chain, address }
router.put('/addresses/default', requireAuth, async (req, res) => {
  const { chain, address } = req.body || {};
  if (!chain || !address) return res.status(400).json({ message: 'chain and address required' });
  const CH = String(chain).toUpperCase();

  (req.dbUser.addresses || []).forEach(a => {
    if (a.chain === CH) a.isDefault = (a.address === address);
  });

  await req.dbUser.save();
  res.json({ ok: true, items: req.dbUser.addresses });
});

// DELETE /api/profile/addresses  { chain, address }
router.delete('/addresses', requireAuth, async (req, res) => {
  const { chain, address } = req.body || {};
  if (!chain || !address) return res.status(400).json({ message: 'chain and address required' });
  const CH = String(chain).toUpperCase();

  req.dbUser.addresses = (req.dbUser.addresses || []).filter(a => !(a.chain === CH && a.address === address));
  await req.dbUser.save();
  res.json({ ok: true, items: req.dbUser.addresses });
});

module.exports = router;
