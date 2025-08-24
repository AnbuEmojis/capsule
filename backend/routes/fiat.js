const express = require('express');
const router = express.Router();

const Stripe = require('stripe');

// --- Stripe gating: usable only if key looks real AND not explicitly disabled ---
const rawKey = (process.env.STRIPE_SECRET_KEY || '').trim();
const STRIPE_ENABLED_FLAG = process.env.STRIPE_DISABLED !== '1';
const STRIPE_USABLE =
  /^sk_(test|live)_/.test(rawKey) &&
  rawKey.length > 25 &&
  !rawKey.includes('...') &&
  STRIPE_ENABLED_FLAG;

const stripe = STRIPE_USABLE ? new Stripe(rawKey, { apiVersion: '2024-06-20' }) : null;

// --- Models ---
const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
  email: { type:String, index:true },
  name: String,
  stripeCustomerId: String,
}, { timestamps:true });
const User = mongoose.models.User || mongoose.model('User', UserSchema);

const FiatWalletSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, index: true, required: true },
  currency: { type: String, default: 'USD' },
  balanceCents: { type: Number, default: 0 },
  ledger: [{
    type: { type: String, enum: ['deposit','withdraw'] },
    amountCents: Number,
    stripePaymentIntent: String,
    note: String,
    at: { type: Date, default: Date.now }
  }]
}, { timestamps:true });
FiatWalletSchema.index({ userId:1, 'ledger.stripePaymentIntent':1 });
const FiatWallet = mongoose.models.FiatWallet || mongoose.model('FiatWallet', FiatWalletSchema);

// ----------------- helpers -----------------
function looksEmail(s){ return typeof s === 'string' && /.+@.+/.test(s); }
function uid(req){
  const h = (req.headers['x-user-id'] || req.headers['x-dev-user'] || '').trim();
  return h || null;
}
async function ensureUser(req){
  let user = null;
  const id = uid(req);
  if (id) { try { user = await User.findById(id); } catch {} }
  if (!user) {
    const demo = process.env.DEMO_EMAIL || 'demo@local.dev';
    user = await User.findOne({ email: demo }) || await User.create({ email: demo, name: 'Demo User' });
  }
  return user;
}
async function ensureWallet(userId, currency='USD'){
  let w = await FiatWallet.findOne({ userId });
  if (!w) w = await FiatWallet.create({ userId, currency, balanceCents:0, ledger:[] });
  return w;
}
function alreadyCredited(wallet, piId) {
  if (!piId) return false;
  return !!(wallet.ledger || []).some(e => e.type === 'deposit' && e.stripePaymentIntent === piId);
}

// ---------- INIT (POST) ----------
router.post('/init', async (req,res)=>{
  try{
    const user = await ensureUser(req);
    const wallet = await ensureWallet(user._id);

    let stripeCustomerId = user.stripeCustomerId || null;

    if (STRIPE_USABLE && !stripeCustomerId) {
      try {
        const params = {};
        if (looksEmail(user.email)) params.email = user.email;
        if (user.name) params.name = user.name;
        const customer = await stripe.customers.create(params);
        stripeCustomerId = customer.id;
        user.stripeCustomerId = stripeCustomerId;
        try { await user.save(); } catch (_) {}
      } catch (e) {
        console.warn('[fiat:init] could not create stripe customer (continuing):', e?.type || e?.message || e);
        stripeCustomerId = null;
      }
    }

    return res.json({
      ok: true,
      userId: String(user._id),
      stripeCustomerId,
      stripeDisabled: !STRIPE_USABLE,
      balanceCents: wallet.balanceCents,
      currency: wallet.currency || 'USD'
    });
  } catch (e) {
    console.error('/api/fiat/init fatal', e);
    return res.status(200).json({ ok:true, stripeDisabled: !STRIPE_USABLE, balanceCents:0, currency:'USD' });
  }
});

// ---------- DEPOSIT CHECKOUT (POST) ----------
router.post('/deposit-checkout', async (req,res)=>{
  try{
    const { amountCents, currency='usd' } = req.body || {};
    if (!amountCents || amountCents <= 0) return res.status(400).json({ error:'bad_amount' });

    const user = await ensureUser(req);
    if (!STRIPE_USABLE) return res.status(400).json({ error:'stripe_disabled' });

    const session = await stripe.checkout.sessions.create({
      customer: user.stripeCustomerId || undefined,
      mode: 'payment',
      allow_promotion_codes: true,
      currency,
      line_items: [{
        quantity: 1,
        price_data: {
          currency,
          unit_amount: amountCents,
          product_data: { name: 'Fiat wallet deposit' }
        }
      }],
      payment_intent_data: {
        metadata: {
          purpose: 'fiat_deposit',
          userId: String(user._id)
        }
      },
      success_url: `${process.env.PUBLIC_BASE_URL || 'http://localhost:3000'}/paper.html?fiat=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url:  `${process.env.PUBLIC_BASE_URL || 'http://localhost:3000'}/paper.html?fiat=cancel`
    });

    return res.json({ url: session.url });
  } catch (e) {
    console.error('/api/fiat/deposit-checkout', e);
    return res.status(500).json({ error:'internal_error' });
  }
});

// ---------- CONFIRM (GET) ----------
router.get('/confirm', async (req, res) => {
  try {
    if (!STRIPE_USABLE) return res.status(400).json({ error: 'stripe_disabled' });
    const { session_id } = req.query || {};
    if (!session_id) return res.status(400).json({ error: 'missing_session_id' });

    const session = await stripe.checkout.sessions.retrieve(String(session_id), { expand: ['payment_intent'] });
    const pi = session.payment_intent;
    const amount = session.amount_total ?? pi?.amount_received ?? 0;

    if ((session.status === 'complete' || session.payment_status === 'paid') && amount > 0) {
      const userId = pi?.metadata?.userId;
      const user = userId ? { _id: userId } : await ensureUser(req);
      const wallet = await ensureWallet(user._id);

      const dup = alreadyCredited(wallet, pi?.id);
      if (!dup) {
        wallet.balanceCents += amount;
        wallet.ledger.push({ type: 'deposit', amountCents: amount, stripePaymentIntent: pi?.id, note: 'Stripe Checkout confirm' });
        await wallet.save();
      }

      return res.json({ ok: true, balanceCents: wallet.balanceCents, credited: dup ? 0 : amount, alreadyCredited: dup });
    }
    return res.status(202).json({ pending: true, status: session.status, payment_status: session.payment_status });
  } catch (e) {
    console.error('/api/fiat/confirm', e);
    return res.status(500).json({ error: 'internal_error' });
  }
});

// ---------- WEBHOOK (POST) ----------
router.post('/webhook', express.json({ type:'application/json' }), async (req,res)=>{
  try{
    if (!STRIPE_USABLE) return res.json({ received:true, disabled:true });
    const event = req.body;

    if (event.type === 'payment_intent.succeeded'){
      const pi = event.data.object;
      if (pi.metadata?.purpose === 'fiat_deposit'){
        const userId = pi.metadata.userId;
        const wallet = await ensureWallet(userId);
        const dup = alreadyCredited(wallet, pi.id);
        if (!dup) {
          wallet.balanceCents += pi.amount_received;
          wallet.ledger.push({ type:'deposit', amountCents: pi.amount_received, stripePaymentIntent: pi.id, note:'Stripe deposit' });
          await wallet.save();
        }
        return res.json({ received:true, alreadyCredited: dup });
      }
    }
    return res.json({ received:true });
  } catch (e) {
    console.error('/api/fiat/webhook', e);
    return res.status(500).json({ error:'internal_error' });
  }
});

// ---------- BALANCE (GET) ----------
router.get('/balance', async (req,res)=>{
  try{
    const user = await ensureUser(req);
    const wallet = await FiatWallet.findOne({ userId: user._id });
    return res.json({ balanceCents: wallet?.balanceCents || 0, currency: (wallet?.currency || 'USD') });
  } catch (e) {
    console.error('/api/fiat/balance', e);
    return res.status(500).json({ error:'internal_error' });
  }
});

// ---------- WITHDRAW (POST) ----------
router.post('/withdraw', async (req,res)=>{
  try{
    const user = await ensureUser(req);
    const { amountCents } = req.body || {};
    const wallet = await ensureWallet(user._id);
    if (!amountCents || amountCents > wallet.balanceCents) return res.status(400).json({ error:'insufficient_funds' });
    wallet.balanceCents -= amountCents;
    wallet.ledger.push({ type:'withdraw', amountCents, note:'Simulated withdraw' });
    await wallet.save();
    return res.json({ ok:true, balanceCents: wallet.balanceCents });
  } catch (e) {
    console.error('/api/fiat/withdraw', e);
    return res.status(500).json({ error:'internal_error' });
  }
});

module.exports = router;
