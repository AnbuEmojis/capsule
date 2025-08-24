// backend/routes/swaps.js — mounts /api/swaps/{quote,execute}
const express = require('express');
const router = express.Router();

const FiatWallet = require('../models/FiatWallet');
const User       = require('../models/User');

// ---- config / helpers ----
const PEG = Number(process.env.NATIVE_USD || 1); // 1 NATIVE == $1
const toCents = n => Math.round(Number(n || 0) * 100 * PEG);

function uidFromHeaders(req) {
  const h = req.get('x-dev-user');              // dev shim header
  if (h) return { email: String(h).trim() };
  const u = req.user || {};                     // JWT claims
  if (u.email) return { email: String(u.email) };
  if (u.id)    return { id: String(u.id) };
  if (req.body?.userId)  return { id: String(req.body.userId) };
  if (req.query?.userId) return { id: String(req.query.userId) };
  return null;
}

async function ensureUserDoc(req) {
  const sel = uidFromHeaders(req);
  const demoEmail = process.env.DEMO_EMAIL || 'demo@local.dev';
  if (!sel) {
    let u = await User.findOne({ email: demoEmail });
    if (!u) u = await User.create({ email: demoEmail, name: 'Demo User' });
    return u;
  }
  if (sel.email) {
    let u = await User.findOne({ email: sel.email });
    if (!u) u = await User.create({ email: sel.email, name: sel.email.split('@')[0] || 'User' });
    return u;
  }
  try { const u = await User.findById(sel.id); if (u) return u; } catch {}
  let u = await User.findOne({ email: demoEmail });
  if (!u) u = await User.create({ email: demoEmail, name: 'Demo User' });
  return u;
}

async function ensureFiatWallet(userId) {
  let w = await FiatWallet.findOne({ userId });
  if (!w) w = await FiatWallet.create({ userId, currency: 'USD', balanceCents: 0, ledger: [] });
  return w;
}

// ---- pool glue (supports your Pool or simple XY fallback) ----
function getReserves(app){
  const p = app.locals.pool;
  if (p?.getReserves) return { r: p.getReserves(), pool: p, type: 'pool' };
  app.locals.pool = app.locals.pool || { _r: { NATIVE: 10_000, CAP: 1_000_000 } };
  return { r: app.locals.pool._r, pool: null, type: 'xy' };
}
function setReserves(app, r){
  const p = app.locals.pool;
  if (p?.setReserves) return p.setReserves(r);
  app.locals.pool._r = r;
}
function xyQuote(r, from, amount){
  const amt = Number(amount);
  const xKey = from, yKey = (from === 'NATIVE' ? 'CAP' : 'NATIVE');
  const x = Number(r[xKey] || 0), y = Number(r[yKey] || 0);
  if (!(amt > 0) || x <= 0 || y <= 0) return { amountOut: 0, price: 0, fee: 0, slippage: 0 };
  const k = x * y;
  const newX = x + amt;
  const newY = k / newX;
  const out = Math.max(0, y - newY);
  return { amountOut: out, price: out / amt, fee: 0, slippage: 0.0 };
}
function xyExecute(app, from, amount){
  const { r } = getReserves(app);
  const q = xyQuote(r, from, amount);
  r[from] += amount;
  const to = (from === 'NATIVE' ? 'CAP' : 'NATIVE');
  r[to] -= q.amountOut;
  setReserves(app, r);
  return q;
}

const enqueue = (app, tx) => (app.locals.txQueue?.enqueue || app.locals.enqueue || (()=>{}))(tx);
const mkid = () => Date.now().toString(36) + Math.random().toString(36).slice(2,8);

// ---------- QUOTE ----------
router.get('/quote', (req, res) => {
  const { fromToken, toToken, amount } = req.query;
  const amt = Number(amount);
  if (!fromToken || !toToken || fromToken === toToken || !(amt > 0)) {
    return res.status(400).json({ message: 'bad_query' });
  }
  try {
    const pool = req.app.locals.pool;
    if (typeof pool?.getQuote === 'function') {
      const q = pool.getQuote({ inputSymbol: fromToken, inputAmount: amt });
      return res.json({
        price: q.price ?? (q.outputAmount/amt),
        amountOut: q.outputAmount,
        fee: q.fee ?? 0,
        slippage: q.slippage ?? 0,
        pool: pool.getReserves ? pool.getReserves() : undefined
      });
    }
    const { r } = getReserves(req.app);
    const q = xyQuote(r, fromToken, amt);
    return res.json({ ...q, pool: r });
  } catch (e) {
    return res.status(500).json({ message: 'quote_failed', error: String(e?.message || e) });
  }
});

// ---------- EXECUTE ----------
/** body: { fromToken, toToken, amountIn, minAmountOut?, walletAddress, tokenSig? } */
router.post('/execute', async (req, res) => {
  try {
    const { fromToken, toToken } = req.body || {};
    let { amountIn, minAmountOut = 0, walletAddress, tokenSig } = req.body || {};
    const amt = Number(amountIn);
    if (!fromToken || !toToken || fromToken === toToken) return res.status(400).json({ message:'bad_pair' });
    if (!(amt > 0)) return res.status(400).json({ message:'amountIn>0 required' });
    walletAddress = String(walletAddress || '').trim();
    if (!walletAddress) return res.status(400).json({ message:'walletAddress required' });

    const user = await ensureUserDoc(req);

    // Debit fiat when buying CAP with NATIVE
    if (fromToken === 'NATIVE' && toToken === 'CAP') {
      const w = await ensureFiatWallet(user._id);
      const need = toCents(amt);
      if (process.env.ALLOW_OVERDRAFT_NATIVE !== '1' && w.balanceCents < need) {
        return res.status(409).json({
          ok:false, message:'insufficient_fiat',
          userId: String(user._id), balanceCents: w.balanceCents, neededCents: need
        });
      }
      w.balanceCents -= need;
      w.ledger.push({ type:'swap_debit', amountCents: -need, at:new Date(), note:`NATIVE->CAP ${amt}` });
      await w.save();
    }

    // Execute against pool (or XY fallback)
    const pool = req.app.locals.pool;
    let amountOut = 0, fee = 0, price = 0;
    if (typeof pool?.getQuote === 'function' && typeof pool?.executeSwap === 'function') {
      const q = pool.getQuote({ inputSymbol: fromToken, inputAmount: amt });
      amountOut = Number(q.outputAmount || 0);
      fee       = Number(q.fee || 0);
      price     = Number(q.price || (amountOut/amt));
      pool.executeSwap({ inputSymbol: fromToken, inputAmount: amt, minOutputAmount: Number(minAmountOut) || 0 });
    } else {
      const q = xyExecute(req.app, fromToken, amt);
      amountOut = Number(q.amountOut || 0);
      fee       = Number(q.fee || 0);
      price     = amountOut / amt;
    }

    if (!(amountOut > 0) || amountOut < Number(minAmountOut)) {
      return res.status(400).json({ message:'slippage/minAmountOut' });
    }

    // Enqueue chain effects so balances reflect the trade
    if (toToken === 'CAP') {
      enqueue(req.app, { id:`cap-mint-${mkid()}`, type:'TOKEN_MINT', symbol:'CAP',
        outputMap:{ [walletAddress]: amountOut }, note:'SWAP NATIVE->CAP' });
      enqueue(req.app, { id:`native-spend-${mkid()}`, type:'SPEND', asset:'NATIVE',
        from: walletAddress, amount: amt, note:'SWAP NATIVE->CAP' });
    } else if (toToken === 'NATIVE') {
      enqueue(req.app, { id:`cap-spend-${mkid()}`, type:'TOKEN_SPEND', symbol:'CAP',
        from: walletAddress, amount: amt, sig: tokenSig || 'dev', note:'SWAP CAP->NATIVE' });
      enqueue(req.app, { id:`native-credit-${mkid()}`, type:'TRANSFER', asset:'NATIVE',
        outputMap:{ [walletAddress]: amountOut }, note:'SWAP CAP->NATIVE' });
    }

    try { req.app.locals.miner?.mineTransactions && req.app.locals.miner.mineTransactions(); } catch {}

    // Credit fiat when selling CAP to NATIVE
    if (fromToken === 'CAP' && toToken === 'NATIVE') {
      const w = await ensureFiatWallet(user._id);
      const cred = toCents(amountOut);
      w.balanceCents += cred;
      w.ledger.push({ type:'swap_credit', amountCents: cred, at:new Date(), note:`CAP->NATIVE ${amountOut}` });
      await w.save();
    }

    return res.json({ ok:true, fromToken, toToken, amountIn: amt, amountOut, price, fee });
  } catch (e) {
    console.error('/api/swaps/execute', e);
    return res.status(500).json({ message:'execute_failed', error: String(e?.message || e) });
  }
});

module.exports = router;
