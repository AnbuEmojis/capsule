// cryptochain/index.js
require('dotenv').config({ path: 'cryptochain/.env' });

const path = require('path');
const express = require('express');
const cors = require('cors');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const mongoose = require('mongoose');

// ---------- Mongo ----------
const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/cryptochain';
mongoose.connect(MONGO_URI).then(() => console.log('✅ MongoDB connected'))
  .catch(err => { console.error('❌ Mongo connect error', err); process.exit(1); });

// ---------- App ----------
const app = express();

// If you ever run behind a proxy (ngrok/Heroku), keep this true so secure cookies work in prod.
app.set('trust proxy', 1);

// CORS: since we serve the UI from the SAME origin (localhost:3000), this is permissive but safe.
app.use(cors({ origin: true, credentials: true }));

// Body parsers (Stripe webhook uses raw body inside its router; see fiat.js)
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ---------- Cookie Session ----------
const SESSION_SECRET = process.env.SESSION_SECRET || 'dev_insecure_change_me';
const SESSION_NAME = process.env.SESSION_NAME || 'sid';
const isProd = process.env.NODE_ENV === 'production';

app.use(session({
  name: SESSION_NAME,
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,       // not accessible from JS
    secure: isProd,       // true only over HTTPS; false on localhost
    sameSite: isProd ? 'lax' : 'lax', // lax works well for normal redirects
    maxAge: 1000 * 60 * 60 * 24 * 7   // 7 days
  },
  store: MongoStore.create({
    mongoUrl: MONGO_URI,
    collectionName: 'sessions',
    ttl: 60 * 60 * 24 * 30 // 30 days
  })
}));

// ---------- Dev helper: set req.userId from session ----------
app.use((req, _res, next) => {
  // Priority: session userId (cookie) -> x-user-id header (manual) -> DEV_FAKE_AUTH
  if (req.session && req.session.userId) {
    req.userId = req.session.userId;
  } else if (req.header('x-user-id')) {
    req.userId = req.header('x-user-id');
  } else if (process.env.DEV_FAKE_AUTH === '1') {
    req.userId = 'dev:local';
  }
  next();
});

// ---------- Auth routes (cookie based) ----------
app.get('/api/auth/dev-login', (req, res) => {
  // For local testing without OAuth:
  // GET /api/auth/dev-login?userId=oauth:github:65869452
  const userId = String(req.query.userId || 'dev:local');
  req.session.userId = userId;
  res.json({ ok: true, userId });
});

app.post('/api/auth/logout', (req, res) => {
  req.session.destroy(() => {
    res.clearCookie(SESSION_NAME);
    res.json({ ok: true });
  });
});

app.get('/api/auth/me', (req, res) => {
  res.json({ userId: req.userId || null });
});

// ---------- Mount API routers ----------
const walletsRouter = require('../backend/routes/wallets');  // /api/wallets/*
const swapsRouter   = require('../backend/routes/swaps');    // /api/swaps/*
const rewardsRouter = safeRequire('../backend/routes/rewards'); // /api/rewards/*
const fiatRouter    = require('../backend/routes/fiat');     // /api/fiat/*

app.use('/api/wallets', walletsRouter);
app.use('/api/swaps',   swapsRouter);
if (rewardsRouter) app.use('/api/rewards', rewardsRouter);
app.use('/api/fiat',    fiatRouter); // fiat.js handles raw() itself for /webhook

// ---------- (Optional) prices used by quotes ----------
app.get('/api/prices/latest', (_req, res) => {
  res.json({ NATIVE_USD: 1.0, CAP_NATIVE: 0.01, SOL_USD: 150 });
});

// ---------- Static UI ----------
const PUBLIC_DIR = path.join(__dirname, 'public');
app.use(express.static(PUBLIC_DIR));
app.get('/', (_req, res) => res.sendFile(path.join(PUBLIC_DIR, 'paper.html')));

// ---------- Health ----------
app.get('/healthz', (_req, res) => res.json({ ok: true }));
// If you already have /api/auth/me, provide a simple alias to silence 404s
app.get('/api/profile/me', (req, res) => {
  res.json({ userId: req.userId || null });
});

// ---------- Error handler ----------
app.use((err, req, res, _next) => {
  console.error(err);
  const status = err.status || 500;
  if (req.path.startsWith('/api/')) {
    return res.status(status).json({ error: err.message || 'internal_error' });
  }
  res.status(status).send('Internal Server Error');
});

// ---------- Listen ----------
const PORT = Number(process.env.PORT || 3000);
app.listen(PORT, () => console.log(`🚀 server at http://localhost:${PORT}`));

// helper
function safeRequire(p) { try { return require(p); } catch { return null; } }
