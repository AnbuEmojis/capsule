const express = require('express');
const router  = express.Router();
const Stripe  = require('stripe');
const FiatWallet = require('../models/FiatWallet');

const {
  STRIPE_SECRET_KEY,
  PUBLIC_BASE_URL = 'http://localhost:3000',
} = process.env;

const stripe = STRIPE_SECRET_KEY ? new Stripe(STRIPE_SECRET_KEY, { apiVersion: '2024-06-20' }) : null;

function getUserKey(req) {
  const hdr = (req.headers['x-user-id'] || req.headers['x-user-key'] || '').toString().trim();
  if (hdr) return hdr;
  const email = (req.headers['x-user-email'] || '').toString().trim().toLowerCase();
  if (email) return `email:${email}`;
  return 'dev:local';
}

async function ensureWalletForUserKey(userKey) {
  let w = await FiatWallet.findOne({ userKey });
  if (!w) w = await FiatWallet.create({ userKey, balanceCents: 0, currency: 'USD', processedSessions: [] });
  return w;
}

async function findWalletByStripeCustomer(stripeCustomerId) {
  if (!stripeCustomerId) return null;
  return FiatWallet.findOne({ stripeCustomerId });
}

function sendError(res, code, message, extra = {}) {
  return res.status(code).json({ error: message, ...extra });
}

// ---- Diagnostics (make sure these return 200 before testing anything else)
router.get('/health', (_req, res) => {
  res.json({ ok: true, stripeReady: !!stripe, publicBaseUrl: PUBLIC_BASE_URL });
});

router.get('/diag', async (req, res) => {
  const userKey = getUserKey(req);
  const wallet = await FiatWallet.findOne({ userKey }).lean();
  res.json({ ok: true, userKey, wallet: wallet || null, stripeReady: !!stripe });
});

// ---- Core
router.post('/init', async (req, res) => {
  try {
    if (!stripe) return sendError(res, 503, 'stripe_disabled');
    const userKey = getUserKey(req);
    const wallet = await ensureWalletForUserKey(userKey);

    if (!wallet.stripeCustomerId) {
      const customer = await stripe.customers.create({ metadata: { userKey } });
      wallet.stripeCustomerId = customer.id;
      await wallet.save();
    }

    res.json({
      ok: true,
      userKey,
      stripeCustomerId: wallet.stripeCustomerId,
      stripeDisabled: false,
      balanceCents: wallet.balanceCents,
      currency: wallet.currency,
    });
  } catch (e) {
    console.error('/api/fiat/init', e);
    sendError(res, 500, 'internal_error', { detail: e.message });
  }
});

router.get('/balance', async (req, res) => {
  try {
    const userKey = getUserKey(req);
    const wallet = await ensureWalletForUserKey(userKey);
    res.json({ balanceCents: wallet.balanceCents, currency: wallet.currency });
  } catch (e) {
    console.error('/api/fiat/balance', e);
    sendError(res, 500, 'internal_error', { detail: e.message });
  }
});

router.post('/deposit-checkout', async (req, res) => {
  try {
    if (!stripe) return sendError(res, 503, 'stripe_disabled');
    const userKey = getUserKey(req);
    const wallet = await ensureWalletForUserKey(userKey);

    const { amountCents, currency = 'usd' } = req.body || {};
    if (!amountCents || amountCents <= 0) return sendError(res, 400, 'invalid_amount');

    const base = PUBLIC_BASE_URL.replace(/\/$/, '');
    const success_url = `${base}/paper.html?session_id={CHECKOUT_SESSION_ID}`;
    const cancel_url  = `${base}/paper.html?cancelled=1`;

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      amount_total: amountCents,
      currency,
      customer: wallet.stripeCustomerId || undefined,
      success_url,
      cancel_url,
      ui_mode: 'hosted',
    });

    res.json({ url: session.url });
  } catch (e) {
    console.error('/api/fiat/deposit-checkout', e);
    sendError(res, 500, 'internal_error', { detail: e.message });
  }
});

router.get('/confirm', async (req, res) => {
  try {
    if (!stripe) return sendError(res, 503, 'stripe_disabled');
    const { session_id: sessionId } = req.query;
    if (!sessionId || typeof sessionId !== 'string') return sendError(res, 400, 'missing_session_id');

    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ['payment_intent', 'payment_intent.latest_charge'],
    });
    if (!session) return sendError(res, 404, 'session_not_found');
    if (session.mode !== 'payment') return sendError(res, 400, 'unsupported_mode', { mode: session.mode });
    if (session.payment_status !== 'paid' && session.status !== 'complete') {
      return sendError(res, 409, 'session_not_paid', {
        status: session.status,
        payment_status: session.payment_status,
      });
    }

    const amountCents = session.amount_total ?? session.payment_intent?.amount;
    const currency = (session.currency || session.payment_intent?.currency || 'usd').toUpperCase();
    if (!amountCents || amountCents <= 0) return sendError(res, 400, 'invalid_amount_from_session');

    const headerUserKey = (req.headers['x-user-id'] || req.headers['x-user-key'] || '').toString().trim();
    let wallet = null;

    if (headerUserKey) {
      wallet = await ensureWalletForUserKey(headerUserKey);
      if (!wallet.stripeCustomerId && session.customer) {
        wallet.stripeCustomerId = typeof session.customer === 'string' ? session.customer : session.customer.id;
      }
    } else if (session.customer) {
      const scid = typeof session.customer === 'string' ? session.customer : session.customer.id;
      wallet = await findWalletByStripeCustomer(scid);
      if (!wallet) {
        wallet = await FiatWallet.create({
          userKey: `stripe:${scid}`,
          stripeCustomerId: scid,
          balanceCents: 0,
          currency: currency.toUpperCase(),
          processedSessions: [],
        });
      }
    } else {
      return sendError(res, 400, 'cannot_resolve_wallet');
    }

    if (wallet.processedSessions?.includes(sessionId)) {
      return res.json({ ok: true, duplicated: true, balanceCents: wallet.balanceCents, currency: wallet.currency });
    }

    wallet.balanceCents = (wallet.balanceCents || 0) + amountCents;
    wallet.currency = currency.toUpperCase();
    wallet.processedSessions = Array.from(new Set([...(wallet.processedSessions || []), sessionId]));
    await wallet.save();

    res.json({
      ok: true,
      creditedCents: amountCents,
      currency: wallet.currency,
      balanceCents: wallet.balanceCents,
      userKey: wallet.userKey,
      stripeCustomerId: wallet.stripeCustomerId,
    });
  } catch (e) {
    console.error('/api/fiat/confirm', e);
    const payload = { error: 'internal_error' };
    if (e && typeof e === 'object') {
      payload.detail = e.message;
      if (e.type) payload.type = e.type;
      if (e.code) payload.code = e.code;
    }
    res.status(500).json(payload);
  }
});

router.post('/withdraw', async (req, res) => {
  try {
    const userKey = getUserKey(req);
    const wallet = await ensureWalletForUserKey(userKey);

    const { amountCents } = req.body || {};
    if (!amountCents || amountCents <= 0) return sendError(res, 400, 'invalid_amount');
    if ((wallet.balanceCents || 0) < amountCents) {
      return sendError(res, 400, 'insufficient_funds', { balanceCents: wallet.balanceCents || 0 });
    }

    wallet.balanceCents -= amountCents; // simulate payout in dev
    await wallet.save();

    res.json({ ok: true, debitedCents: amountCents, balanceCents: wallet.balanceCents, currency: wallet.currency });
  } catch (e) {
    console.error('/api/fiat/withdraw', e);
    sendError(res, 500, 'internal_error', { detail: e.message });
  }
});

module.exports = router;
