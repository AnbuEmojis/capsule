// cryptochain/index.js
// Single-server entry: mounts all routers under /api/* and serves /public.

require('dotenv').config({ path: 'cryptochain/.env' });

const path = require('path');
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');

// --- DB boot (yours) -------------------------------------------------
const mongoose = require('mongoose');
const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/cryptochain';
mongoose.connect(MONGO_URI).then(() => console.log('✅ MongoDB connected'))
  .catch(err => { console.error('❌ Mongo connect error', err); process.exit(1); });

// --- Chain boot (yours) ----------------------------------------------
// If you have code that loads the chain/pool from disk, keep it:
try {
  const { loadChainFromDisk, loadPoolFromDisk } = require('../backend/chain/bootstrap.js');
  if (loadChainFromDisk) {
    const chain = loadChainFromDisk();
    const pool  = loadPoolFromDisk();
    console.log(`Loaded chain from disk: ${chain?.length ?? 0} blocks`);
    console.log(`Loaded pool from disk:`, pool || {});
  }
} catch (_) {
  // Not fatal if your project doesn’t use this module name.
}

const app = express();

// CORS (if you open dashboard from other ports disable this)
app.use(cors({ origin: true, credentials: true }));
app.use(cookieParser());

// NOTE: Stripe webhook needs raw body; we’ll attach JSON after mounting that router.
const jsonParser = express.json();
const urlParser  = express.urlencoded({ extended: true });

// --- Simple dev auth shim (header or env toggle) ---------------------
/**
 * Resolves req.userId for routes that need a user.
 * Priority:
 *  1) x-user-id header (explicit)
 *  2) DEV_FAKE_AUTH=1 -> 'dev:local'
 *  3) fall back to req.user?.id if you have a session/JWT middleware upstream
 */
app.use((req, _res, next) => {
  const hdr = req.header('x-user-id');
  if (hdr) req.userId = hdr;
  else if (process.env.DEV_FAKE_AUTH === '1') req.userId = 'dev:local';
  else if (req.user && req.user.id) req.userId = String(req.user.id);
  next();
});

// --- Routers ---------------------------------------------------------
const walletsRouter = require('../backend/routes/wallets'); // /api/wallets/*
const swapsRouter   = require('../backend/routes/swaps');   // /api/swaps/*
const rewardsRouter = safeRequire('../backend/routes/rewards'); // optional
const fiatRouter    = require('../backend/routes/fiat');    // /api/fiat/*

// Attach JSON parsers for all *except* the webhook (fiat router handles its own raw)
app.use(jsonParser);
app.use(urlParser);

// Mount API
app.use('/api/wallets', walletsRouter);
app.use('/api/swaps',   swapsRouter);
if (rewardsRouter) app.use('/api/rewards', rewardsRouter);

// Mount fiat *after* global json parser, but fiat.js internally sets raw() for /webhook
app.use('/api/fiat', fiatRouter);

// --- Optional: prices endpoint used by the UI for quotes -------------
app.get('/api/prices/latest', (_req, res) => {
  // If you already have a real prices service, replace this.
  res.json({
    NATIVE_USD: 1.00,    // 1 native == $1
    CAP_NATIVE: 0.01,    // 1 CAP == 0.01 native (=> $0.01)
    SOL_USD:    150      // dev default
  });
});

// --- Static front-end ------------------------------------------------
const PUBLIC_DIR = path.join(__dirname, 'public');
app.use(express.static(PUBLIC_DIR));

// Single-page fallback (Paper wallet)
app.get('/', (_req, res) => res.sendFile(path.join(PUBLIC_DIR, 'paper.html')));

// Health
app.get('/healthz', (_req, res) => res.json({ ok: true }));

// Error handler: JSON for /api/* by default
app.use((err, _req, res, _next) => {
  console.error(err);
  const status = err.status || 500;
  const isApi = _req.path.startsWith('/api/');
  if (isApi) return res.status(status).json({ error: err.message || 'internal_error' });
  res.status(status).send('Internal Server Error');
});

// Listen
const PORT = Number(process.env.PORT || 3000);
app.listen(PORT, () => console.log(`🚀 server at http://localhost:${PORT}`));

// --- helper ----------------------------------------------------------
function safeRequire(p) {
  try { return require(p); } catch { return null; }
}
