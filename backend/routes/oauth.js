// backend/routes/oauth.js
const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const passport = require('../oauth/passport'); // your strategies file
const User = require('../models/User');

// --- helpers ---
function issueToken(user) {
  return jwt.sign(
    { userId: user._id.toString(), email: user.email || undefined },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  );
}

function finishAuth(req, res, user) {
  const token = issueToken(user);
  const postOrigin = process.env.OAUTH_POST_ORIGIN || 'http://localhost:3000';
  const mode = (req.query.mode || 'json').toLowerCase();

  if (mode === 'redirect') {
    // example: send user back to your app with #token=...
    const url = `${postOrigin}/paper.html#token=${encodeURIComponent(token)}`;
    return res.redirect(url);
  }
  return res.json({ token, email: user.email, _id: user._id });
}

function primaryEmail(profile) {
  // Google/GitHub both usually provide profile.emails = [{ value }]
  const e = Array.isArray(profile?.emails) ? profile.emails.find(Boolean) : null;
  return (e && e.value) ? String(e.value).toLowerCase() : undefined;
}

async function upsertUser({ provider, profile }) {
  const sub = String(profile.id);              // provider user ID
  const email = primaryEmail(profile);         // may be undefined on GitHub if privacy
  let user = await User.findOne({ 'oauth.provider': provider, 'oauth.sub': sub });

  if (!user && email) {
    // Link to an existing email account if present
    user = await User.findOne({ email });
  }
  if (!user) {
    user = new User({ email });
  }
  user.oauth = { provider, sub };
  if (email && !user.email) user.email = email;

  await user.save();
  return user;
}

// --- Google ---
router.get('/google',
  passport.authenticate('google', { scope: ['profile', 'email'] })
);

router.get('/google/callback',
  passport.authenticate('google', { session: false, failureRedirect: '/login-failed' }),
  async (req, res) => {
    try {
      const user = await upsertUser({ provider: 'google', profile: req.user.profile });
      finishAuth(req, res, user);
    } catch (e) {
      res.status(500).json({ message: 'OAuth failed', error: String(e?.message || e) });
    }
  }
);

// --- GitHub ---
router.get('/github',
  passport.authenticate('github', { scope: [ 'user:email' ] })
);

router.get('/github/callback',
  passport.authenticate('github', { session: false, failureRedirect: '/login-failed' }),
  async (req, res) => {
    try {
      const user = await upsertUser({ provider: 'github', profile: req.user.profile });
      finishAuth(req, res, user);
    } catch (e) {
      res.status(500).json({ message: 'OAuth failed', error: String(e?.message || e) });
    }
  }
);

module.exports = router;
