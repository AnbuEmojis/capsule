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

const FiatWallet = require('../models/FiatWallet');
const User = require('../models/User');

// helpers
function uid(req){ return req.user?.id || req.session?.userId || req.body?.userId || req.query?.userId || null; }
function looksEmail(s){ return typeof s === 'string' && /.+@.+\..+/.test(s); }

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
    if (!amountCents || amountCents <= 0) return res.status(400).json({ error:'invalid_amount' });

    const user = await ensureUser(req);
    const wallet = await ensureWallet(user._id);

    if (!STRIPE_USABLE) {
      wallet.balanceCents += amountCents;
      wallet.ledger.push({ type:'deposit', amountCents, note:'Simulated deposit (dev)' });
      await wallet.save();
      const base = process.env.PUBLIC_BASE_URL || 'http://localhost:3000';
      return res.json({ url: `${base}/paper.html?fiat=success&sim=1` });
    }

    const params = {
      mode: 'payment',
      line_items: [{
        price_data: {
          currency,
          product_data: { name: 'Fiat wallet top-up' },
          unit_amount: amountCents
        },
        quantity: 1
      }],
      success_url: `${process.env.PUBLIC_BASE_URL}/paper.html?fiat=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.PUBLIC_BASE_URL}/paper.html?fiat=cancel`,
      payment_intent_data: { metadata: { userId: String(user._id), purpose:'fiat_deposit' } }
    };

    if (user.stripeCustomerId) params.customer = user.stripeCustomerId;
    else if (looksEmail(user.email)) params.customer_email = user.email;

    const session = await stripe.checkout.sessions.create(params);
    return res.json({ url: session.url });
  } catch (e) {
    console.error('/api/fiat/deposit-checkout', e);
    return res.status(500).json({ error:'internal_error' });
  }
});

// ---------- CONFIRM (GET) ----------
// /api/fiat/confirm?session_id=cs_test_...
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
      wallet.balanceCents += amount;
      wallet.ledger.push({ type: 'deposit', amountCents: amount, stripePaymentIntent: pi?.id, note: 'Stripe Checkout confirm' });
      await wallet.save();
      return res.json({ ok: true, balanceCents: wallet.balanceCents, credited: amount });
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
        const wallet = await ensureWallet(pi.metadata.userId);
        wallet.balanceCents += pi.amount_received;
        wallet.ledger.push({ type:'deposit', amountCents: pi.amount_received, stripePaymentIntent: pi.id, note:'Stripe deposit' });
        await wallet.save();
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
