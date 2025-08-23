/**
 * Dev-only shim: ensures req.user (demo user) and mounts public test routes
 * BEFORE any global auth guards. Safe to remove in production.
 */
module.exports = function registerDevPublic(app) {
  const express = require('express');
  if (process.env.DEV_FAKE_AUTH === '1') {
    const User = require('./models/User');
    app.use(async (req, res, next) => {
      try {
        const email = process.env.DEMO_EMAIL || 'demo@local';
        let u = await User.findOne({ email });
        if (!u) u = await User.create({ email, name: 'Demo User' });
        req.user = { id: u._id };
        req.session = req.session || {};
        req.session.userId = String(u._id);
        next();
      } catch (e) {
        console.error('dev fake auth error', e);
        res.status(500).json({ error: 'dev_auth_failed' });
      }
    });
  }
  // Mount these BEFORE any global auth middleware:
  app.use('/api/fiat',    require('./routes/fiat'));
  app.use('/api/user',    require('./routes/user'));
  app.use('/api/rewards', require('./routes/rewards'));
};
