const express = require('express');
const router =  express.Router();
const Stripe = require('stripe');
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2024-06-20' });
const FiatWallet = require('../models/FiatWallet');
const User = require('../models/User');

async function ensureWallet(userId, currency='USD'){
  let w = await FiatWallet.findOne({ userId });
  if (!w) w = await FiatWallet.create({ userId, currency, balanceCents:0 });
  return w;
}

// Ensure Stripe customer + wallet
router.post('/init', async (req,res)=>{
  const userId = req.user?.id || req.body.userId;
  const user = await User.findById(userId);
  if (!user) return res.status(401).json({ error:'auth' });
  if (!user.stripeCustomerId){
    const customer = await stripe.customers.create({ email: user.email, name: user.name || undefined });
    user.stripeCustomerId = customer.id; await user.save();
  }
  const wallet = await ensureWallet(user._id);
  res.json({ ok:true, balanceCents: wallet.balanceCents, currency: wallet.currency, stripeCustomerId: user.stripeCustomerId });
});

// Create a deposit Checkout session
router.post('/deposit-checkout', async (req,res)=>{
  const userId = req.user?.id || req.body.userId;
  const { amountCents, currency='usd' } = req.body;
  const user = await User.findById(userId);
  if (!user?.stripeCustomerId) return res.status(400).json({ error:'init_required' });
  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    customer: user.stripeCustomerId,
    line_items: [{ price_data: { currency, product_data: { name: 'Fiat wallet top-up' }, unit_amount: amountCents }, quantity:1 }],
    success_url: `${process.env.PUBLIC_BASE_URL}/paper.html?fiat=success&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${process.env.PUBLIC_BASE_URL}/paper.html?fiat=cancel`,
    payment_intent_data: { metadata:{ userId: String(user._id), purpose:'fiat_deposit' } }
  });
  res.json({ url: session.url });
});

// Webhook to credit wallet
// Webhook (dev-friendly: use JSON body so mount order doesn’t matter)
router.post('/webhook', express.json({ type: 'application/json' }), async (req,res)=>{
  const event = req.body;
  if (event.type === 'payment_intent.succeeded'){
    const pi = event.data.object;
    if (pi.metadata?.purpose === 'fiat_deposit'){
      const userId = pi.metadata.userId;
      const amountCents = pi.amount_received;
      const w = await ensureWallet(userId);
      w.balanceCents += amountCents;
      w.ledger.push({ type:'deposit', amountCents, stripePaymentIntent: pi.id, note:'Stripe deposit' });
      await w.save();
    }
  }
  res.json({ received:true });
});

// Read balance
router.get('/balance', async (req,res)=>{
  const userId = req.user?.id || req.query.userId;
  const w = await FiatWallet.findOne({ userId });
  res.json({ balanceCents: w?.balanceCents || 0, currency: w?.currency || 'USD' });
});

// Simulated withdraw (deducts and records)
// For real bank payouts you’d need Stripe Connect + payouts to external account.
router.post('/withdraw', async (req,res)=>{
  const userId = req.user?.id || req.body.userId;
  const { amountCents } = req.body;
  const w = await ensureWallet(userId);
  if (amountCents > w.balanceCents) return res.status(400).json({ error:'insufficient_funds' });
  w.balanceCents -= amountCents;
  w.ledger.push({ type:'withdraw', amountCents, note:'Simulated withdraw (test)' });
  await w.save();
  res.json({ ok:true, balanceCents: w.balanceCents });
});

module.exports = router;
