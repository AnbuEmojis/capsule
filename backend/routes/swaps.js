// backend/routes/swaps.js
const express = require('express');
const router = express.Router();
const FiatWallet = require('../models/FiatWallet');

/* ------------------------------------------------------------------ */
/* Simple price oracle (replace with your real pricing later)         */
/* ------------------------------------------------------------------ */
function getRates() {
  return {
    CAP_NATIVE: 0.01,  // 1 CAP costs 0.01 NATIVE  -> 100 CAP per 1 NATIVE
    NATIVE_USD: 1,
    SOL_USD: 150,
    SOL_NATIVE: null,
  };
}

function mkQuote({ fromToken, toToken, amount }) {
  const a = Number(amount) || 0;
  if (a <= 0) return { ok: false, message: 'amount must be > 0' };

  const fx = getRates();

  if (fromToken === 'NATIVE' && toToken === 'CAP') {
    const out = a / (fx.CAP_NATIVE || 0.01);
    return { ok: true, route: ['NATIVE', 'CAP'], amountOut: +out.toFixed(6) };
  }

  if (fromToken === 'CAP' && toToken === 'NATIVE') {
    const out = a * (fx.CAP_NATIVE || 0.01);
    return { ok: true, route: ['CAP', 'NATIVE'], amountOut: +out.toFixed(6) };
  }

  if (fromToken === 'CAP' && toToken === 'SOL') {
    const native = a * (fx.CAP_NATIVE || 0.01);
    const sol = fx.SOL_NATIVE
      ? native / fx.SOL_NATIVE
      : (native * (fx.NATIVE_USD || 1)) / (fx.SOL_USD || 150);
    return { ok: true, route: ['CAP', 'NATIVE', 'SOL'], amountOut: +sol.toFixed(6) };
  }

  return { ok: false, message: 'unsupported pair' };
}

/* ------------------------------------------------------------------ */
/* Helpers: auth + CAP ledger                                         */
/* ------------------------------------------------------------------ */
function requireAuth(req, res, next) {
  // Prefer session-populated req.userId (index.js), else dev header, else 401
  if (req.userId) return next();
  const x = req.headers['x-user-id'];
  if (x) { req.userId = String(x); return next(); }
  return res.status(401).json({ error: 'unauthorized' });
}

function getLedger(app) {
  app.locals.ledger ||= {};
  app.locals.ledger.cap ||= Object.create(null);
  return app.locals.ledger;
}

function addCap(app, address, delta) {
  if (!address) return;
  const L = getLedger(app).cap;
  const curr = Number(L[address]) || 0;
  const next = curr + Number(delta || 0);
  L[address] = Math.max(0, next); // no negatives
  return L[address];
}

function getCap(app, address) {
  return Number(getLedger(app).cap[address]) || 0;
}

/* ------------------------------------------------------------------ */
/* Routes                                                             */
/* ------------------------------------------------------------------ */

// GET /api/swaps/quote?fromToken=NATIVE&toToken=CAP&amount=10
router.get('/quote', (req, res) => {
  const { fromToken, toToken, amount } = req.query;
  const q = mkQuote({ fromToken, toToken, amount });
  if (!q.ok) return res.status(400).json({ error: q.message || 'bad_request' });
  res.json({ amountOut: q.amountOut, route: q.route });
});

// POST /api/swaps/execute
// Body: { fromToken,toToken,amountIn|amount,toCapAddress,fromCapAddress }
router.post('/execute', requireAuth, async (req, res) => {
  try {
    const { fromToken, toToken } = req.body || {};
    const amount = req.body?.amountIn ?? req.body?.amount;
    const q = mkQuote({ fromToken, toToken, amount });
    if (!q.ok) return res.status(400).json({ error: q.message || 'bad_request' });

    const userId = req.userId;
    const cents = Math.round(Number(amount) * 100);

    if (fromToken === 'NATIVE' && toToken === 'CAP') {
      // 1) debit fiat (NATIVE)
      const fw = await FiatWallet.findOne({ userId });
      if (!fw) return res.status(400).json({ error: 'wallet_missing' });
      if ((fw.balanceCents || 0) < cents) return res.status(400).json({ error: 'insufficient_fiat' });
      fw.balanceCents -= cents;
      await fw.save();

      // 2) credit CAP to the provided address
      const toAddr = String(req.body?.toCapAddress || '').trim();
      if (!toAddr) return res.status(400).json({ error: 'missing_toCapAddress' });
      const capNow = addCap(req.app, toAddr, q.amountOut);

      return res.json({
        ok: true,
        amountOut: q.amountOut,
        pennyApplied: 1.3, // keep your legacy field
        capAddress: toAddr,
        capTokens: capNow,
        fiatBalanceCents: fw.balanceCents
      });
    }

    if (fromToken === 'CAP' && toToken === 'NATIVE') {
      // 1) debit CAP from fromCapAddress
      const fromAddr = String(req.body?.fromCapAddress || '').trim();
      if (!fromAddr) return res.status(400).json({ error: 'missing_fromCapAddress' });
      const have = getCap(req.app, fromAddr);
      if (have < Number(amount)) return res.status(400).json({ error: 'insufficient_cap' });
      addCap(req.app, fromAddr, -Number(amount));

      // 2) credit fiat (NATIVE)
      const fw = await FiatWallet.findOne({ userId });
      if (!fw) return res.status(400).json({ error: 'wallet_missing' });
      fw.balanceCents = (fw.balanceCents || 0) + Math.round(q.amountOut * 100);
      await fw.save();

      return res.json({
        ok: true,
        amountOut: q.amountOut,
        pennyApplied: 1.3,
        capAddress: fromAddr,
        capTokens: getCap(req.app, fromAddr),
        fiatBalanceCents: fw.balanceCents
      });
    }

    return res.status(400).json({ error: 'unsupported_pair' });
  } catch (e) {
    console.error('/swaps/execute error', e);
    res.status(500).json({ error: 'internal_error' });
  }
});

module.exports = router;
