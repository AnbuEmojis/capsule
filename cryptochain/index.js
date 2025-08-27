// cryptochain/index.js
require('dotenv').config({ path: 'cryptochain/.env' });

const path = require('path');
const express = require('express');
const cors = require('cors');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const mongoose = require('mongoose');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/cryptochain';
mongoose.connect(MONGO_URI).then(() => console.log('✅ MongoDB connected'))
  .catch(err => { console.error('❌ Mongo connect error', err); process.exit(1); });

const app = express();
app.set('trust proxy', 1);
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const SESSION_SECRET = process.env.SESSION_SECRET || 'dev_insecure_change_me';
const SESSION_NAME = process.env.SESSION_NAME || 'sid';
const isProd = process.env.NODE_ENV === 'production';

app.use(session({
  name: SESSION_NAME,
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? 'lax' : 'lax',
    maxAge: 1000 * 60 * 60 * 24 * 7
  },
  store: MongoStore.create({
    mongoUrl: MONGO_URI,
    collectionName: 'sessions',
    ttl: 60 * 60 * 24 * 30
  })
}));

// expose chain plumbing (safe if none attached)
app.locals.chain   = app.locals.chain   || null;
app.locals.mempool = app.locals.mempool || null;
app.locals.miner   = app.locals.miner   || null;


// populate req.userId
app.use((req, _res, next) => {
  if (req.session && req.session.userId) req.userId = req.session.userId;
  else if (req.header('x-user-id')) req.userId = req.header('x-user-id');
  else if (process.env.DEV_FAKE_AUTH === '1') req.userId = 'dev:local';
  next();
});

// dev login/logout + whoami
app.get('/api/auth/dev-login', (req, res) => {
  const userId = String(req.query.userId || 'dev:local');
  req.session.userId = userId;
  res.json({ ok: true, userId });
});
app.post('/api/auth/logout', (req, res) => {
  req.session.destroy(() => { res.clearCookie(SESSION_NAME); res.json({ ok: true }); });
});
app.get('/api/auth/me', (req, res) => { res.json({ userId: req.userId || null }); });

// mount routers
const walletsRouter = require('../backend/routes/wallets');
const swapsRouter   = require('../backend/routes/swaps');
const rewardsRouter = safeRequire('../backend/routes/rewards');
const fiatRouter    = require('../backend/routes/fiat');
const jwtAuth       = safeRequire('../backend/routes/auth'); // (optional JWT auth)

if (jwtAuth)   app.use('/api/auth', jwtAuth);
app.use('/api/wallets', walletsRouter);
app.use('/api/swaps',   swapsRouter);
if (rewardsRouter) app.use('/api/rewards', rewardsRouter);
app.use('/api/fiat',    fiatRouter);

// prices
app.get('/api/prices/latest', (_req, res) => {
  res.json({ NATIVE_USD: 1.0, CAP_NATIVE: 0.01, SOL_USD: 150 });
});

// static UI
const PUBLIC_DIR = path.join(__dirname, 'public');
app.use(express.static(PUBLIC_DIR));
app.get('/', (_req, res) => res.sendFile(path.join(PUBLIC_DIR, 'paper.html')));

// health + alias to avoid 404s
app.get('/healthz', (_req, res) => res.json({ ok: true }));
app.get('/api/profile/me', (req, res) => { res.json({ userId: req.userId || null }); });
app.get('/api/chain/height', (req, res) => {
  const h = req.app.locals.chain && typeof req.app.locals.chain.height !== 'undefined'
    ? req.app.locals.chain.height
    : null;
  res.json({ height: h });
});

app.get('/api/chain/recent', (req, res) => {
  const chain = req.app.locals.chain;
  const blocks = (chain && typeof chain.getRecentBlocks === 'function')
    ? chain.getRecentBlocks(5)
    : null;
  res.json({ blocks });
});

// error handler
app.use((err, req, res, _next) => {
  console.error(err);
  const status = err.status || 500;
  if (req.path.startsWith('/api/')) return res.status(status).json({ error: err.message || 'internal_error' });
  res.status(status).send('Internal Server Error');
});

const PORT = Number(process.env.PORT || 3000);
app.listen(PORT, () => console.log(`🚀 server at http://localhost:${PORT}`));

function safeRequire(p) { try { return require(p); } catch { return null; } }
