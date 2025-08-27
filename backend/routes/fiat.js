const express = require('express');
const router = express.Router();
const Stripe = require('stripe');
const FiatWallet = require('../models/FiatWallet');
const chainBridge = require('../services/chainBridge');

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2024-06-20' });

// create/init wallet
router.post('/init', async (req, res) => {
  try {
    const userId = req.userId;
    if (!userId) return res.status(401).json({ error: 'unauthorized' });

    let fw = await FiatWallet.findOne({ userId });
    if (!fw) {
      const customer = await stripe.customers.create({ metadata: { userId } });
      fw = await FiatWallet.create({
        userId,
        stripeCustomerId: customer.id,
        balanceCents: 0,
        currency: 'USD'
      });
    }
    res.json({
      ok: true,
      userId: fw.userId,
      stripeCustomerId: fw.stripeCustomerId,
      stripeDisabled: false,
      balanceCents: fw.balanceCents || 0,
      currency: fw.currency || 'USD'
    });
  } catch (e) { console.error('/fiat/init', e); res.status(500).json({ error: 'internal_error' }); }
});

// get balance
router.get('/balance', async (req, res) => {
  try {
    const userId = req.userId;
    if (!userId) return res.status(401).json({ error: 'unauthorized' });
    const fw = await FiatWallet.findOne({ userId });
    res.json({ balanceCents: fw?.balanceCents || 0, currency: fw?.currency || 'USD' });
  } catch (e) { res.status(500).json({ error: 'internal_error' }); }
});

// create checkout
router.post('/deposit-checkout', async (req, res) => {
  try {
    const userId = req.userId;
    if (!userId) return res.status(401).json({ error: 'unauthorized' });
    const fw = await FiatWallet.findOne({ userId });
    if (!fw) return res.status(400).json({ error: 'wallet_missing' });

    const { amountCents, currency = 'usd' } = req.body || {};
    if (!Number.isFinite(amountCents) || amountCents <= 0) return res.status(400).json({ error: 'bad_amount' });

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      customer: fw.stripeCustomerId,
      success_url: `${process.env.PUBLIC_BASE_URL}/paper.html?fiat=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url:  `${process.env.PUBLIC_BASE_URL}/paper.html?fiat=cancel`,
      payment_method_types: ['card'],
      line_items: [
        { price_data: { unit_amount: amountCents, currency, product_data: { name: 'Fiat deposit' } }, quantity: 1 }
      ],
      metadata: { userId },
    });

    res.json({ url: session.url });
  } catch (e) { console.error('/fiat/deposit-checkout', e); res.status(500).json({ error: 'internal_error' }); }
});

// confirm (polling fallback if webhook isn’t configured)
router.get('/confirm', async (req, res) => {
  try {
    const userId = req.userId;
    if (!userId) return res.status(401).json({ error: 'unauthorized' });
    const { session_id } = req.query;
    if (!session_id) return res.status(400).json({ error: 'missing_session' });

    const sess = await stripe.checkout.sessions.retrieve(String(session_id), { expand: ['payment_intent'] });
    if (sess.payment_status !== 'paid') return res.json({ ok: false, status: sess.payment_status });

    const fw = await FiatWallet.findOne({ userId });
    if (!fw) return res.status(400).json({ error: 'wallet_missing' });

    fw.credits = fw.credits || [];
    if (!fw.credits.includes(sess.id)) {
      fw.balanceCents = (fw.balanceCents || 0) + sess.amount_total;
      fw.credits.push(sess.id);
      await fw.save();
    }

    // Minimal chain event (1:1 USD -> NATIVE)
await chainBridge.recordFiatDeposit(req, {
  userId: req.user?.id || req.headers['x-user-id'] || 'unknown',
  address: req.body?.address || req.query?.address || req.user?.address || 'unknown',
  amountCents,
  currency: (currency || 'USD').toUpperCase(),
  stripeSessionId: sessionId  // whatever var you already have
});

    res.json({ ok: true, balanceCents: fw.balanceCents, currency: fw.currency || 'USD' });
  } catch (e) { console.error('/fiat/confirm', e); res.status(500).json({ error: 'internal_error' }); }
});

// withdraw (demo)
router.post('/withdraw', async (req, res) => {
  try {
    const userId = req.userId;
    if (!userId) return res.status(401).json({ error: 'unauthorized' });
    const { amountCents } = req.body || {};
    if (!Number.isFinite(amountCents) || amountCents <= 0) return res.status(400).json({ error: 'bad_amount' });

    const fw = await FiatWallet.findOne({ userId });
    if (!fw) return res.status(400).json({ error: 'wallet_missing' });
    if ((fw.balanceCents || 0) < amountCents) return res.status(400).json({ error: 'insufficient' });

    fw.balanceCents -= amountCents;
    await fw.save();
    res.json({ ok: true, balanceCents: fw.balanceCents });
  } catch (e) { console.error('/fiat/withdraw', e); res.status(500).json({ error: 'internal_error' }); }
});

// webhook (optional)
router.post('/webhook', express.raw({ type: 'application/json' }), async (_req, res) => {
  res.json({ ok: true });
});

module.exports = router;
