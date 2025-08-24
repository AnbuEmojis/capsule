// backend/routes/fiat.js
const express = require('express');
const router = express.Router();

const dotenv = require('dotenv');
dotenv.config({ path: 'cryptochain/.env' });

const Stripe = require('stripe');
const FiatWallet = require('../models/FiatWallet');

const STRIPE_KEY = process.env.STRIPE_SECRET_KEY || '';
const STRIPE_DISABLED = /^true$/i.test(process.env.STRIPE_DISABLED || '');
const PUBLIC_BASE_URL = (process.env.PUBLIC_BASE_URL || 'http://localhost:3000').replace(/\/+$/, '');

const stripe = STRIPE_DISABLED ? null : new Stripe(STRIPE_KEY, { apiVersion: '2024-06-20' });

function ensureStripe(res) {
  if (STRIPE_DISABLED) {
    res.status(503).json({ error: 'stripe_disabled' });
    return false;
  }
  if (!STRIPE_KEY || !/^sk_(test|live)_/.test(STRIPE_KEY)) {
    res.status(500).json({ error: 'stripe_key_invalid' });
    return false;
  }
  return true;
}

// In dev we’ll accept a "userId" from query/body (your UI stores it locally).
// In prod, you’d read req.user.id from your auth middleware.
function resolveUserId(req) {
  return (req.query.userId || req.body?.userId || req.headers['x-user-id'] || 'dev-user').toString();
}

async function getOrCreateWalletByUserId(userId) {
  let w = await FiatWallet.findOne({ userId });
  if (!w) w = await FiatWallet.create({ userId });
  return w;
}

/* -------------------------
   POST /api/fiat/init
   - Ensures a FiatWallet + Stripe customer
--------------------------*/
router.post('/init', async (req, res) => {
  try {
    const userId = resolveUserId(req);
    let wallet = await getOrCreateWalletByUserId(userId);

    if (!STRIPE_DISABLED && !wallet.stripeCustomerId) {
      const customer = await stripe.customers.create({
        metadata: { userId },
        description: `CAP fiat wallet for ${userId}`
      });
      wallet.stripeCustomerId = customer.id;
      await wallet.save();
    }

    res.json({
      ok: true,
      userId: wallet.userId,
      stripeCustomerId: wallet.stripeCustomerId || null,
      stripeDisabled: !!STRIPE_DISABLED,
      balanceCents: wallet.balanceCents || 0,
      currency: wallet.currency || 'USD'
    });
  } catch (e) {
    console.error('/api/fiat/init', e);
    res.status(500).json({ error: 'internal_error' });
  }
});

/* -------------------------
   GET /api/fiat/balance?[userId=...]
--------------------------*/
router.get('/balance', async (req, res) => {
  try {
    const userId = req.query.userId ? String(req.query.userId) : null;

    let wallet;
    if (userId) {
      wallet = await FiatWallet.findOne({ userId });
    } else if (req.query.customerId) {
      wallet = await FiatWallet.findOne({ stripeCustomerId: req.query.customerId });
    } else {
      // Dev fallback: last-updated wallet
      wallet = await FiatWallet.findOne().sort({ updatedAt: -1 });
    }

    res.json({
      balanceCents: wallet?.balanceCents || 0,
      currency: (wallet?.currency || 'USD').toUpperCase()
    });
  } catch (e) {
    console.error('/api/fiat/balance', e);
    res.status(500).json({ error: 'internal_error' });
  }
});

/* -------------------------
   POST /api/fiat/deposit-checkout
   body: { amountCents, currency?, userId? }
--------------------------*/
router.post('/deposit-checkout', async (req, res) => {
  try {
    if (!ensureStripe(res)) return;
    const userId = resolveUserId(req);
    const { amountCents, currency = 'usd' } = req.body || {};
    if (!Number.isFinite(amountCents) || amountCents <= 0) {
      return res.status(400).json({ error: 'bad_amount' });
    }

    const wallet = await getOrCreateWalletByUserId(userId);
    if (!wallet.stripeCustomerId) {
      const customer = await stripe.customers.create({ metadata: { userId } });
      wallet.stripeCustomerId = customer.id;
      await wallet.save();
    }

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      customer: wallet.stripeCustomerId,
      payment_method_types: ['card'],
      success_url: `${PUBLIC_BASE_URL}/paper.html?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${PUBLIC_BASE_URL}/paper.html?canceled=1`,
      line_items: [{
        quantity: 1,
        price_data: {
          currency: currency.toLowerCase(),
          unit_amount: Math.round(amountCents),
          product_data: { name: 'Deposit to CAP NATIVE' }
        }
      }],
      metadata: { walletUserId: wallet.userId }
    });

    res.json({ url: session.url });
  } catch (e) {
    console.error('/api/fiat/deposit-checkout', e);
    res.status(500).json({ error: 'internal_error' });
  }
});

/* -------------------------
   GET /api/fiat/confirm?session_id=cs_test_...
   - Looks up the Stripe session
   - Credits wallet matched by session.customer
   - Idempotent via session_id check in ledger
--------------------------*/
router.get('/confirm', async (req, res) => {
  try {
    if (!ensureStripe(res)) return;
    const sid = String(req.query.session_id || '');
    if (!sid || !/^cs_(test|live)_/.test(sid)) {
      return res.status(400).json({ error: 'bad_session_id' });
    }

    const session = await stripe.checkout.sessions.retrieve(sid, { expand: ['payment_intent', 'customer'] });
    if (!session) return res.status(404).json({ error: 'not_found' });

    if (session.payment_status !== 'paid') {
      return res.status(409).json({ error: 'not_paid', payment_status: session.payment_status });
    }

    const amountCents = session.amount_total;
    const currency = (session.currency || 'usd').toUpperCase();
    const customerId = typeof session.customer === 'string' ? session.customer : session.customer?.id;

    if (!customerId) return res.status(422).json({ error: 'missing_customer' });

    let wallet = await FiatWallet.findOne({ stripeCustomerId: customerId });
    if (!wallet) {
      // last resort: try metadata from customer
      const cust = await stripe.customers.retrieve(customerId);
      const userId = (cust?.metadata?.userId) || 'unknown';
      wallet = await getOrCreateWalletByUserId(userId);
      if (!wallet.stripeCustomerId) {
        wallet.stripeCustomerId = customerId;
      }
    }

    // Apply deposit once
    const applied = wallet.applyDeposit({ amountCents, currency, sessionId: sid });
    if (applied) await wallet.save();

    return res.json({
      ok: true,
      applied,
      balanceCents: wallet.balanceCents,
      currency: wallet.currency
    });
  } catch (e) {
    console.error('/api/fiat/confirm', e);
    // surface useful info in dev
    res.status(500).json({ error: 'internal_error', detail: e?.type || e?.message || 'stripe_error' });
  }
});

/* -------------------------
   POST /api/fiat/withdraw
   body: { amountCents, currency?, userId? }
--------------------------*/
router.post('/withdraw', async (req, res) => {
  try {
    const userId = resolveUserId(req);
    const { amountCents, currency = 'USD' } = req.body || {};
    if (!Number.isFinite(amountCents) || amountCents <= 0) {
      return res.status(400).json({ error: 'bad_amount' });
    }
    const wallet = await getOrCreateWalletByUserId(userId);
    wallet.applyWithdraw({ amountCents: Math.round(amountCents), currency });
    await wallet.save();
    res.json({ ok: true, balanceCents: wallet.balanceCents, currency: wallet.currency });
  } catch (e) {
    console.error('/api/fiat/withdraw', e);
    const code = e.message === 'insufficient_funds' ? 400 : 500;
    res.status(code).json({ error: e.message || 'internal_error' });
  }
});

/* -------------------------
   (optional) GET /api/fiat/diag
--------------------------*/
router.get('/diag', async (req, res) => {
  res.json({
    stripeDisabled: !!STRIPE_DISABLED,
    stripeKeyLooksValid: !!/^sk_(test|live)_/.test(STRIPE_KEY),
    publicBaseUrl: PUBLIC_BASE_URL
  });
});

module.exports = router;
