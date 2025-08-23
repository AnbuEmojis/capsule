const express = require('express');
const router = express.Router();

const Stripe = require('stripe');
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2024-06-20' });

const FiatWallet = require('../models/FiatWallet');
const User = require('../models/User');

function uid(req){
  return req.user?.id || req.session?.userId || req.body?.userId || req.query?.userId || null;
}

// Ensure a user for dev/testing; in prod, require real auth
async function ensureUser(req){
  let user = null;
  const id = uid(req);
  if (id) { try { user = await User.findById(id); } catch {} }
  if (!user) {
    const demoEmail = process.env.DEMO_EMAIL || 'demo@local';
    user = await User.findOne({ email: demoEmail }) || await User.create({ email: demoEmail, name: 'Demo User' });
  }
  return user;
}

async function ensureWallet(userId, currency='USD'){
  let w = await FiatWallet.findOne({ userId });
  if (!w) w = await FiatWallet.create({ userId, currency, balanceCents:0, ledger:[] });
  return w;
}

// POST /api/fiat/init
router.post('/init', async (req,res)=>{
  try{
    const user = await ensureUser(req);
    if (!user) return res.status(401).json({ error:'auth_required' });
    if (!user.stripeCustomerId){
      const customer = await stripe.customers.create({ email: user.email, name: user.name || undefined });
      user.stripeCustomerId = customer.id; await user.save();
    }
    const w = await ensureWallet(user._id);
    res.json({ ok:true, userId:String(user._id), stripeCustomerId:user.stripeCustomerId, balanceCents:w.balanceCents, currency:w.currency || 'USD' });
  } catch (e) {
    console.error('/api/fiat/init', e); res.status(500).json({ error:'internal_error' });
  }
});

// POST /api/fiat/deposit-checkout
router.post('/deposit-checkout', async (req,res)=>{
  try{
    const user = await ensureUser(req);
    if (!user?.stripeCustomerId) return res.status(400).json({ error:'init_required' });
    const { amountCents, currency='usd' } = req.body || {};
    if (!amountCents || amountCents<=0) return res.status(400).json({ error:'invalid_amount' });
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      customer: user.stripeCustomerId,
      line_items: [{ price_data: { currency, product_data: { name: 'Fiat wallet top-up' }, unit_amount: amountCents }, quantity: 1 }],
      success_url: `${process.env.PUBLIC_BASE_URL}/paper.html?fiat=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.PUBLIC_BASE_URL}/paper.html?fiat=cancel`,
      payment_intent_data: { metadata: { userId: String(user._id), purpose:'fiat_deposit' } }
    });
    res.json({ url: session.url });
  } catch (e) {
    console.error('/api/fiat/deposit-checkout', e); res.status(500).json({ error:'internal_error' });
  }
});

// POST /api/fiat/webhook (dev-friendly: JSON body)
router.post('/webhook', express.json({ type: 'application/json' }), async (req,res)=>{
  try{
    const event = req.body;
    if (event.type === 'payment_intent.succeeded'){
      const pi = event.data.object;
      if (pi.metadata?.purpose === 'fiat_deposit'){
        const w = await ensureWallet(pi.metadata.userId);
        w.balanceCents += pi.amount_received;
        w.ledger.push({ type:'deposit', amountCents: pi.amount_received, stripePaymentIntent: pi.id, note:'Stripe deposit' });
        await w.save();
      }
    }
    res.json({ received:true });
  } catch (e) {
    console.error('/api/fiat/webhook', e); res.status(500).json({ error:'internal_error' });
  }
});

// GET /api/fiat/balance
router.get('/balance', async (req,res)=>{
  try{
    const user = await ensureUser(req);
    if (!user) return res.status(401).json({ error:'auth_required' });
    const w = await FiatWallet.findOne({ userId: user._id });
    res.json({ balanceCents: w?.balanceCents || 0, currency: (w?.currency || 'USD') });
  } catch (e) {
    console.error('/api/fiat/balance', e); res.status(500).json({ error:'internal_error' });
  }
});

// POST /api/fiat/withdraw (simulated)
router.post('/withdraw', async (req,res)=>{
  try{
    const user = await ensureUser(req);
    const { amountCents } = req.body || {};
    const w = await ensureWallet(user._id);
    if (!amountCents || amountCents>w.balanceCents) return res.status(400).json({ error:'insufficient_funds' });
    w.balanceCents -= amountCents;
    w.ledger.push({ type:'withdraw', amountCents, note:'Simulated withdraw' });
    await w.save();
    res.json({ ok:true, balanceCents:w.balanceCents });
  } catch (e) {
    console.error('/api/fiat/withdraw', e); res.status(500).json({ error:'internal_error' });
  }
});

module.exports = router;
