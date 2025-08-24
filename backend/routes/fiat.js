// backend/routes/fiat.js
// Stripe-backed "fiat wallet" with dev-friendly auth (x-user-id) and confirm-dedupe.

const express = require('express');
const router = express.Router();
const Stripe = require('stripe');
const FiatWallet = require('../models/FiatWallet'); // userId is a String in this model
require('dotenv').config({ path: 'cryptochain/.env' });

const {
  STRIPE_SECRET_KEY,
  PUBLIC_BASE_URL = 'http://localhost:3000',
} = process.env;

if (!STRIPE_SECRET_KEY) {
  console.warn('[fiat] STRIPE_SECRET_KEY missing: endpoints will 500 on Stripe calls');
}
const stripe = STRIPE_SECRET_KEY ? new Stripe(STRIPE_SECRET_KEY, { apiVersion: '2024-06-20' }) : null;

// --- helpers ---------------------------------------------------------------

function getUserId(req) {
  // Prefer explicit header for dev on :3001, otherwise cookie-based auth (if present), then query, then local fallback
  return (
    req.get('x-user-id') ||
    req?.user?.id ||
    (req?.user?._id && String(req.user._id)) ||
    req.query.userId ||
    req.session?.userId ||
    null
  );
}

async function ensureWallet(req, res, next) {
  try {
    let userId = getUserId(req);
    if (!userId) {
      // Dev convenience: allow a sticky browser-local id to be passed in headers by the client shim
      // If still missing, make a one-time random id so things can work locally.
      userId = `dev:${Math.random().toString(36).slice(2)}`;
    }
    req.userId = userId;

    let wallet = await FiatWallet.findOne({ userId });
    if (!wallet) {
      wallet = await FiatWallet.create({
        userId,
        balanceCents: 0,
        currency: 'USD',
        txs: [],
      });
    }
    req.fiat = wallet;
    next();
  } catch (err) {
    console.error('/fiat ensureWallet error', err);
    res.status(500).json({ error: 'internal_error' });
  }
}

async function ensureStripeCustomer(req, res, next) {
  try {
    if (!stripe) return res.status(500).json({ error: 'stripe_not_configured' });

    const w = req.fiat;
    if (!w.stripeCustomerId) {
      const email =
        req?.user?.email ||
        (req?.headers?.['x-user-email'] || undefined);

      const customer = await stripe.customers.create({
        email,
        metadata: { userId: req.userId },
      });

      w.stripeCustomerId = customer.id;
      await w.save();
    }
    next();
  } catch (err) {
    console.error('/fiat ensureStripeCustomer error', err);
    res.status(500).json({ error: 'internal_error' });
  }
}

// --- routes ----------------------------------------------------------------

// Init (idempotent). Ensures wallet and (if stripe configured) customer exists.
router.post('/init', ensureWallet, async (req, res) => {
  try {
    if (stripe) {
      await ensureStripeCustomer(req, res, () => {});
      // NOTE: we intentionally don't early-return; ensureStripeCustomer may have responded on error.
      if (res.headersSent) return;
    }
    const { fiat } = req;
    res.json({
      ok: true,
      userId: req.userId,
      stripeCustomerId: fiat.stripeCustomerId || null,
      stripeDisabled: !Boolean(stripe),
      balanceCents: fiat.balanceCents || 0,
      currency: fiat.currency || 'USD',
    });
  } catch (err) {
    console.error('/fiat/init', err);
    res.status(500).json({ error: 'internal_error' });
  }
});

// Balance (simple)
router.get('/balance', ensureWallet, async (req, res) => {
  try {
    res.json({
      balanceCents: req.fiat.balanceCents || 0,
      currency: req.fiat.currency || 'USD',
    });
  } catch (err) {
    console.error('/fiat/balance', err);
    res.status(500).json({ error: 'internal_error' });
  }
});

// Create Checkout Session for deposit
router.post('/deposit-checkout', ensureWallet, ensureStripeCustomer, async (req, res) => {
  try {
    if (!stripe) return res.status(500).json({ error: 'stripe_not_configured' });

    const { amountCents, currency = 'usd' } = req.body || {};
    const cents = Number(amountCents);
    if (!Number.isFinite(cents) || cents <= 0) {
      return res.status(400).json({ error: 'bad_amount' });
    }

    const successUrl = `${PUBLIC_BASE_URL}/paper.html?fiat=succ&session_id={CHECKOUT_SESSION_ID}`;
    const cancelUrl = `${PUBLIC_BASE_URL}/paper.html?fiat=cancel`;

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      customer: req.fiat.stripeCustomerId,
      currency: currency.toLowerCase(),
      success_url: successUrl,
      cancel_url: cancelUrl,
      line_items: [
        {
          price_data: {
            currency: currency.toLowerCase(),
            product_data: { name: 'Fiat wallet deposit' },
            unit_amount: cents,
          },
          quantity: 1,
        },
      ],
      metadata: {
        userId: req.userId,
        walletId: String(req.fiat._id),
      },
    });

    res.json({ url: session.url });
  } catch (err) {
    console.error('/fiat/deposit-checkout', err);
    res.status(500).json({ error: 'internal_error' });
  }
});

// Confirm a completed Stripe Checkout Session and credit the wallet (deduped)
router.get('/confirm', ensureWallet, async (req, res) => {
  try {
    if (!stripe) return res.status(500).json({ error: 'stripe_not_configured' });

    const sessionId = req.query.session_id;
    if (!sessionId) return res.status(400).json({ error: 'missing_session_id' });

    // Dedup if we already processed this id
    if (req.fiat.lastProcessedSessionId === sessionId) {
      return res.json({
        ok: true,
        dedupe: true,
        balanceCents: req.fiat.balanceCents,
        currency: req.fiat.currency || 'USD',
      });
    }

    const sess = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ['payment_intent'],
    });

    const paid =
      sess?.payment_status === 'paid' ||
      sess?.status === 'complete';

    if (!paid) {
      return res.status(409).json({ ok: false, status: sess?.payment_status || 'unpaid' });
    }

    // Prefer amount_total; fall back to PI amount_received if needed
    const credited = Number.isFinite(sess.amount_total)
      ? Number(sess.amount_total)
      : Number(sess?.payment_intent?.amount_received ?? 0);

    if (!Number.isFinite(credited) || credited <= 0) {
      return res.status(422).json({ error: 'no_amount' });
    }

    // Attach customer id if we didn't have one yet
    if (sess.customer && !req.fiat.stripeCustomerId) {
      req.fiat.stripeCustomerId = String(sess.customer);
    }

    req.fiat.balanceCents = (req.fiat.balanceCents || 0) + credited;
    req.fiat.lastProcessedSessionId = sessionId;
    req.fiat.txs = req.fiat.txs || [];
    req.fiat.txs.push({
      type: 'deposit',
      amountCents: credited,
      currency: (sess.currency || 'usd').toUpperCase(),
      sessionId,
      at: new Date(),
    });
    await req.fiat.save();

    res.json({
      ok: true,
      balanceCents: req.fiat.balanceCents,
      currency: req.fiat.currency || 'USD',
    });
  } catch (err) {
    console.error('/fiat/confirm', err);
    res.status(500).json({ error: 'internal_error' });
  }
});

// Withdraw (simulate)
router.post('/withdraw', ensureWallet, async (req, res) => {
  try {
    const cents = Number(req.body?.amountCents);
    if (!Number.isFinite(cents) || cents <= 0) {
      return res.status(400).json({ error: 'bad_amount' });
    }
    if ((req.fiat.balanceCents || 0) < cents) {
      return res.status(400).json({ error: 'insufficient_funds' });
    }
    req.fiat.balanceCents -= cents;
    req.fiat.txs = req.fiat.txs || [];
    req.fiat.txs.push({
      type: 'withdraw',
      amountCents: cents,
      at: new Date(),
    });
    await req.fiat.save();
    res.json({
      ok: true,
      balanceCents: req.fiat.balanceCents,
      currency: req.fiat.currency || 'USD',
    });
  } catch (err) {
    console.error('/fiat/withdraw', err);
    res.status(500).json({ error: 'internal_error' });
  }
});

module.exports = router;
