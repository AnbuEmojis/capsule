// cryptochain/index.js
const path = require('path');
const express = require('express');
const mongoose = require('mongoose');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const {
  blockchain, transactionPool, miner, pool, savePool, shutdown, ready
} = require('./state');


// Routers (backend)
const proposalsRoutes    = require('../backend/routes/proposals');
const storeitemsRoutes   = require('../backend/routes/storeitems');
const stakesRoutes       = require('../backend/routes/stakes');
const walletsRoutes      = require('../backend/routes/wallets');
const swapsRoutes        = require('../backend/routes/swaps');
const transactionsRoutes = require('../backend/routes/transactions');
const liquidityRoutes    = require('../backend/routes/liquidity');
const authRoutes         = require('../backend/routes/auth');
const ratesRoutes        = require('../backend/routes/rates');
const tokenRoutes        = require('../backend/routes/token');
const miningRoutes       = require('../backend/routes/mining');
const explorerRoutes     = require('../backend/routes/explorer');
const bridgeRoutes       = require('../backend/routes/bridge');
const fiatRoutes         = require('../backend/routes/fiat');
const quotesRoutes       = require('../backend/routes/quotes');
const transfersRoutes    = require('../backend/routes/transfers');
const taxRoutes          = require('../backend/routes/tax');
const geoRoutes          = require('../backend/routes/geo');
const feesRoutes         = require('../backend/routes/fees');
const rewardsRoutes      = require('../backend/routes/rewards');
const profileRoutes      = require('../backend/routes/profile');
const passport           = require('../backend/oauth/passport'); 
const oauthRoutes        = require('../backend/routes/oauth');
const solanaRoutes       = require('../backend/routes/solana');
const pricesRoutes = require('../backend/routes/prices');
const { createProxyMiddleware } = require('http-proxy-middleware');


// Routers (cryptochain local)
const stakingRoutes      = require('./routes/staking');
const nftsRoutes         = require('./routes/nfts');       
const nftBridgeRoutes    = require('./routes/bridge');     

const app  = express();
const PORT = process.env.PORT || 3000;

// AFTER you create `app = express()` and BEFORE any catch-all static handlers,
// add this:
  app.use('/api/fiat',
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


// Core middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use(passport.initialize());

// DEV fake auth (for local testing only)
if (process.env.DEV_FAKE_AUTH === '1') {
const User = require('../backend/models/User');
app.use(async (req, res, next) => {
  try {
    if (!req.user) {
      const email = process.env.DEMO_EMAIL || 'demo@local';
      let u = await User.findOne({ email });
      if (!u) u = await User.create({ email, name: 'Demo User' });
      req.user = { id: u._id };
      req.session = req.session || {};
      req.session.userId = String(u._id);
    }
    next();
  } catch (e) {
    console.error('dev fake auth error', e);
    res.status(500).json({ error: 'dev_auth_failed' });
  }
});
}
// Inline JWT guard (shared secret)
const jwt = require('jsonwebtoken');
function getJwtSecret() {
  const s = process.env.JWT_SECRET;
  if (!s) throw new Error('JWT_SECRET not set');
  return s;
}
function auth(req, res, next) {
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : null;
  if (!token) return res.status(401).json({ message: 'Missing token' });
  try {
    req.user = jwt.verify(token, getJwtSecret());
    next();
  } catch {
    return res.status(401).json({ message: 'Invalid token' });
  }
}

// Optional Mongo
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/centratech';
mongoose.connect(MONGO_URI)
  .then(() => console.log('✅ MongoDB connected'))
  .catch(err => console.warn('⚠️ MongoDB connect failed:', err.message));

(async () => {
  await ready;



  // Share singletons for routes
  app.locals.blockchain      = blockchain;
  app.locals.transactionPool = transactionPool;
  app.locals.miner           = miner;
  app.locals.pool            = pool;
  app.locals.savePool        = savePool;

  // Public OAuth endpoints (popup flow)
  app.use('/api/oauth', oauthRoutes);

  // Public/auth mix
  app.use('/api/auth',            authRoutes);             // login/signup (router handles)
  app.use('/api/quotes',          quotesRoutes);           // read-only quotes (public)
  app.use('/api/fiat',            auth, fiatRoutes);       // fiat conversions (auth)
  app.use('/api/tax',             auth, taxRoutes);        // tax estimates (auth)

  // Auth-protected core
  app.use('/api/wallets',         auth, walletsRoutes);
  app.use('/api/swaps',           auth, swapsRoutes);
  app.use('/api/transfers',       auth, transfersRoutes);
  app.use('/api/liquidity',       auth, liquidityRoutes);
  app.use('/api/transactions',    auth, transactionsRoutes);
  app.use('/api/rates',           auth, ratesRoutes);
  app.use('/api/token',           auth, tokenRoutes);
  app.use('/api/mining',          auth, miningRoutes);
  app.use('/api/explorer',        auth, explorerRoutes);
  app.use('/api/bridge',          auth, bridgeRoutes);
  app.use('/api/bridge-nft',      auth, nftBridgeRoutes);
  app.use('/api/geo',             geoRoutes);
  app.use('/api/fees',            feesRoutes);
  app.use('/api/rewards',         rewardsRoutes);
  app.use('/api/profile',         profileRoutes); // router enforces its own auth
  app.use('/api/prices', pricesRoutes);
  app.use('/api/solana', require('../backend/routes/solana'));
  app.use('/api/wallets', require('../backend/routes/wallets'));
  app.use('/api/fiat',    require('../backend/routes/fiat'));
  app.use('/api/user',    require('../backend/routes/user'));
  app.use('/api/rewards', require('../backend/routes/rewards'));


  // Project local
  app.use('/api/staking',         stakingRoutes);
  app.use('/api/nfts',            auth, nftsRoutes);

  // Favicon
  app.get('/favicon.ico', (req, res) => res.status(204).end());

  // Chain endpoints
  app.get('/api/chain', (req, res) => res.json(blockchain.chain));
  app.post('/api/mine', auth, (req, res) => {
    miner.mineTransactions();
    res.json({ ok: true, height: blockchain.chain.length, time: Date.now() });
  });
  

  // Optional: expose blocks for history
  app.get('/api/blocks', (req, res) => res.json(blockchain.chain));

  // Landing page
  app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'capsule.html'));
  });

  // Health & debug
  app.get('/api/health', (req, res) => res.json({ ok: true, time: Date.now() }));
  app.get('/api/debug/routes', (req, res) => {
    const stack = app._router?.stack || [];
    const routes = stack
      .filter(s => s.route?.path)
      .map(s => ({ path: s.route.path, methods: s.route.methods }));
    res.json(routes);
  });

  app.listen(PORT, () => console.log(`🚀 Server listening on ${PORT}`));
})();

process.on('SIGINT',  async () => { await shutdown(); process.exit(0); });
process.on('SIGTERM', async () => { await shutdown(); process.exit(0); });
