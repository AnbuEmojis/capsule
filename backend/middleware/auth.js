// backend/middleware/auth.js
const jwt = require('jsonwebtoken');

function requireAuth(req, res, next) {
  try {
    const h = req.headers.authorization || '';
    const token = h.startsWith('Bearer ') ? h.slice(7) : null;
    if (!token) return res.status(401).json({ message: 'Unauthorized' });

    const payload = jwt.verify(token, process.env.JWT_SECRET || 'change_this_secret');
    // Attach user info for downstream routes
    req.user = payload; // { userId, email, iat, exp }
    next();
  } catch (e) {
    return res.status(401).json({ message: 'Invalid token' });
  }
}

module.exports = { requireAuth };
