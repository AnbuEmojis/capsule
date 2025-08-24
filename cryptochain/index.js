// cryptochain/index.js  — safe + minimal mounts, correct ../backend paths, public /api/wallets/info
const path = require('path');
const express = require('express');
const mongoose = require('mongoose');
const { createProxyMiddleware } = require('http-proxy-middleware');
const jwt = require('jsonwebtoken');

require('dotenv').config({ path: path.join(__dirname, '.env') });

// ---- project singletons ----
const Wallet = require('./wallet');
const { calculateTokenBalance } = require('./token/token-balance');
const {
  blockchain, transactionPool, miner, pool, savePool, shutdown, ready
} = require('./state');

const app = express();
app.set('etag', false)
const PORT = process.env.PORT || 3000;

// ---------- helpers ----------
function safeRequire(rel) {
  try {
    return require(path.join(__dirname, '..', rel));
  } catch (e) {
    console.warn('⚠️  Route not found (skipping):', rel);
    return null;
  }
}

function tryRequireAny(candidates = []) {
  for (const rel of candidates) {
    try {
      const m = require(require('path').join(__dirname, '..', rel));
      console.log('✅ mounted route:', rel);
      return m;
    } catch (e) {
      // continue
    }
  }
  console.warn('⚠️  none of the route paths resolved:', candidates.join(', '));
  return null;
}



// auth middleware (JWT or dev bypass)
function auth(req, res, next) {
  if (process.env.DEV_FAKE_AUTH === '1') {
    // dev mode: synthesize a user id
    const devUser = req.headers['x-dev-user'] || 'dev@local';
    req.user = { id: devUser };            // keep as string to avoid ObjectId cast issues
    req.session = req.session || {};
    req.session.userId = devUser;
    return next();
  }
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : null;
  if (!token) return res.status(401).json({ message: 'Missing token' });
  try {
    const secret = process.env.JWT_SECRET || 'dev-secret';
    req.user = jwt.verify(token, secret);
    next();
  } catch {
    return res.status(401).json({ message: 'Invalid token' });
  }
}

// ---------- core middleware ----------
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// proxy all fiat calls to :3001 (only proxy here; do NOT also mount a local fiat router)
app.use(
  '/api/fiat',
  createProxyMiddleware({
    target: 'http://localhost:3001',
    changeOrigin: true,
    proxyTimeout: 10000,
    onError(err, req, res) {
      console.error('[fiat-proxy]', err.code || err.message);
      res.status(502).json({ error: 'fiat_proxy_error', detail: err.code || 'proxy_failed' });
    },
  })
);

// ---------- Mongo (optional) ----------
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/centratech';
mongoose
  .connect(MONGO_URI)
  .then(() => console.log('✅ MongoDB connected'))
  .catch(err => console.warn('⚠️ MongoDB connect failed:', err.message));

// ---------- start after chain ready ----------
(async () => {
  await ready;

  // share singletons
  app.locals.blockchain      = blockchain;
  app.locals.transactionPool = transactionPool;
  app.locals.miner           = miner;
  app.locals.pool            = pool;
  app.locals.savePool        = savePool;

  // ---------- PUBLIC endpoints (NO AUTH) ----------
  // Wallet read-only info must stay public; the router under /api/wallets may also define /info,
  // so register this *before* mounting /api/wallets to avoid 401s / ObjectId casts.
  app.get('/api/wallets/info', (req, res) => {
    const address = String(req.query.address || '');
    if (!address) return res.status(400).json({ message: 'Missing address' });
    const bc = req.app.locals.blockchain;
    if (!bc) return res.status(503).json({ message: 'Chain not ready' });
    try {
      const nativeBalance = Wallet.calculateBalance({ chain: bc.chain, address });
      const capTokenBalance = calculateTokenBalance({ chain: bc.chain, address, symbol: 'CAP' });
      res.json({ address, balance: nativeBalance, capTokenBalance });
    } catch (e) {
      res.status(500).json({ message: 'Error calculating balances' });
    }
  });

  // ---------- AUTH-PROTECTED routes (optional mounts; skipped if file missing) ----------
  const useIf = (mountPath, router) => router && app.use(mountPath, auth, router);

  const walletsRoutes   = safeRequire('backend/routes/wallets');
  const swapsRoutes = tryRequireAny([
    'backend/routes/swaps',
    'routes/swaps',          // fallback if you moved it
  ]);
  
  if (swapsRoutes) {
    // if you use auth middleware, keep it; otherwise mount public while dev’ing
    if (process.env.DEV_OPEN_ROUTES === '1') app.use('/api/swaps', swapsRoutes);
    else app.use('/api/swaps', auth, swapsRoutes);
  }
    const transfersRoutes = safeRequire('backend/routes/transfers');
  const liquidityRoutes = safeRequire('backend/routes/liquidity');
  const txRoutes        = safeRequire('backend/routes/transactions');
  const ratesRoutes     = safeRequire('backend/routes/rates');
  const tokenRoutes     = safeRequire('backend/routes/token');
  const miningRoutes    = safeRequire('backend/routes/mining');
  const explorerRoutes  = safeRequire('backend/routes/explorer');
  const bridgeRoutes    = safeRequire('backend/routes/bridge');
  const feesRoutes      = safeRequire('backend/routes/fees');
  const rewardsRoutes   = safeRequire('backend/routes/rewards');
  const profileRoutes   = safeRequire('backend/routes/profile'); // this one may do its own auth
  const solanaRoutes    = safeRequire('backend/routes/solana');
  const quotesRoutes    = safeRequire('backend/routes/quotes');
  const pricesRoutes    = safeRequire('backend/routes/prices');
  const taxRoutes       = safeRequire('backend/routes/tax');
  const stakingRoutes   = safeRequire('routes/staking'); // project-local examples
  const nftsRoutes      = safeRequire('routes/nfts');

  // Some public (no auth) info routes
  if (quotesRoutes) app.use('/api/quotes', quotesRoutes);
  if (pricesRoutes) app.use('/api/prices', pricesRoutes);

  useIf('/api/wallets',      walletsRoutes);
  useIf('/api/transfers',    transfersRoutes);
  useIf('/api/liquidity',    liquidityRoutes);
  useIf('/api/transactions', txRoutes);
  useIf('/api/rates',        ratesRoutes);
  useIf('/api/token',        tokenRoutes);
  useIf('/api/mining',       miningRoutes);
  useIf('/api/explorer',     explorerRoutes);
  useIf('/api/bridge',       bridgeRoutes);
  useIf('/api/fees',         feesRoutes);
  useIf('/api/rewards',      rewardsRoutes);
  if (profileRoutes) app.use('/api/profile', profileRoutes); // router enforces its own auth
  useIf('/api/solana',       solanaRoutes);
  useIf('/api/tax',          taxRoutes);
  if (stakingRoutes) app.use('/api/staking', stakingRoutes);
  if (nftsRoutes)    app.use('/api/nfts',    nftsRoutes);

  // ----- misc -----
  app.get('/api/chain', (req, res) => res.json(blockchain.chain));
  app.post('/api/mine', auth, (req, res) => {
    try { miner.mineTransactions(); } catch {}
    res.json({ ok: true, height: blockchain.chain.length, time: Date.now() });
  });
  app.get('/api/blocks', (req, res) => res.json(blockchain.chain));
  app.get('/api/health', (req, res) => res.json({ ok: true, time: Date.now() }));
  app.get('/api/debug/routes', (req, res) => {
    const stack = app._router?.stack || [];
    const routes = stack
      .filter(s => s.route?.path)
      .map(s => ({ path: s.route.path, methods: s.route.methods }));
    res.json(routes);
  });

  // SPA roots
  app.get('/',        (req, res) => res.sendFile(path.join(__dirname, 'public', 'capsule.html')));
  app.get('/paper.html', (req, res) => res.sendFile(path.join(__dirname, 'public', 'paper.html')));

  app.listen(PORT, () => console.log(`🚀 Server listening on ${PORT}`));
})();

// graceful shutdown
process.on('SIGINT',  async () => { try { await shutdown(); } catch {} process.exit(0); });
process.on('SIGTERM', async () => { try { await shutdown(); } catch {} process.exit(0); });
