// backend/routes/auth.js
const express = require('express');
const jwt     = require('jsonwebtoken');
const User    = require('../models/User');

const router  = express.Router();

function getJwtSecret() {
  const s = process.env.JWT_SECRET;
  if (!s) throw new Error('JWT_SECRET not set');
  return s;
}

const signToken = (user) =>
jwt.sign({ userId: user._id.toString(), email: user.email }, getJwtSecret(), { expiresIn: '7d' });

// POST /api/auth/signup
router.post('/signup', async (req, res, next) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) return res.status(400).json({ message: 'Email and password required' });

    const existing = await User.findOne({ email });
    if (existing) return res.status(400).json({ message: 'Email already in use' });

    const user = new User({ email, password });
    await user.save();

    const token = signToken(user);
    res.json({ token });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/login
router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) return res.status(400).json({ message: 'Email and password required' });

    const user = await User.findOne({ email });
    if (!user || !(await user.comparePassword(password))) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const token = signToken(user);
    res.json({ token });
  } catch (err) {
    next(err);
  }
});

// (Optional) GET /api/auth/me — quick sanity check
router.get('/me', (req, res) => {
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : null;
  if (!token) return res.status(401).json({ message: 'Missing token' });
  try {
    const payload = jwt.verify(token, getJwtSecret());
    res.json({ ok: true, user: payload });
  } catch {
    res.status(401).json({ message: 'Invalid token' });
  }
});

module.exports = router;
