// backend/routes/swaps.js
const express = require('express');
const router = express.Router();

// Models you already have
const FiatWallet = require('../models/FiatWallet');
let CapBalance;
try {
  CapBalance = require('../models/CapBalance');
} catch (_) {
  // If your CapBalance helper lives elsewhere, no hard crash
  CapBalance = null;
}

/* -------------------------- tiny price oracle -------------------------- */
/* Keep this aligned with your existing assumptions: 1 NATIVE == 1 USD.   */
function getRates() {
  return {
    // 1 CAP costs 0.01 NATIVE  -> 100 CAP per 1 NATIVE
    CAP_PER_NATIVE: 100,          // convenience form
    NATIVE_PER_CAP: 0.01,
  };
}

function toNum(x) {
  if (x === undefined || x === null || x === '') return NaN;
  const n = Number(x);
  return Number.isFinite(n) ? n : NaN;
}

// Extract user id in the same way the rest of your app does.
// Falls back to dev header to avoid 401 while you test locally.
function getUserId(req) {
  if (req.user && (req.user.id || req.user._id)) return String(req.user.id || req.user._id);
  if (req.headers['x-user-id']) return String(req.headers['x-user-id']);
  return null;
}

/* ------------------------------ /quote --------------------------------- */
// GET /api/swaps/quote?fromToken=NATIVE&toToken=CAP&amount=10
router.get('/quote', async (req, res) => {
  try {
    const from = String(req.query.fromToken || '').toUpperCase();
    const to   = String(req.query.toToken   || '').toUpperCase();
    const amountIn = toNum(req.query.amount);

    if (!from || !to || !Number.isFinite(amountIn) || amountIn <= 0) {
      return res.status(400).json({ error: 'bad_request', detail: 'fromToken, toToken, positive amount required' });
    }

    const R = getRates();

    // NATIVE -> CAP
    if (from === 'NATIVE' && to === 'CAP') {
      const cap = amountIn * R.CAP_PER_NATIVE;
      return res.json({
        fromToken: from, toToken: to,
        amountIn,
        amountOut: cap,
        route: 'NATIVE->CAP',
      });
    }

    // CAP -> NATIVE
    if (from === 'CAP' && to === 'NATIVE') {
      const native = amountIn * R.NATIVE_PER_CAP;
      return res.json({
        fromToken: from, toToken: to,
        amountIn,
        amountOut: native,
        route: 'CAP->NATIVE',
      });
    }

    return res.status(400).json({ error: 'unsupported_pair' });
  } catch (e) {
    console.error('/swaps/quote error', e);
    res.status(500).json({ error: 'internal_error' });
  }
});

/* ----------------------------- /execute -------------------------------- */
// POST /api/swaps/execute
// body can be JSON or form-encoded; we normalize it below.
router.post('/execute', async (req, res) => {
  try {
    // accept either JSON body or form data
    const body = {
      fromToken:   req.body?.fromToken   ?? req.body?.from,
      toToken:     req.body?.toToken     ?? req.body?.to,
      amountIn:    req.body?.amountIn    ?? req.body?.amount,
      capAddress:  req.body?.capAddress  ?? req.body?.address, // source/dest CAP addr
    };

    const from = String(body.fromToken || '').toUpperCase();
    const to   = String(body.toToken   || '').toUpperCase();
    const amountIn = toNum(body.amountIn);
    const capAddress = (body.capAddress || '').trim();

    if (!from || !to || !Number.isFinite(amountIn) || amountIn <= 0) {
      return res.status(400).json({ error: 'bad_request', detail: 'fromToken, toToken, positive amount required' });
    }

    const userId = getUserId(req);
    if (!userId) {
      // Keep identical to how your API enforces auth elsewhere
      return res.status(401).json({ error: 'unauthorized' });
    }

    // Load or create fiat wallet
    let fw = await FiatWallet.findOne({ userId });
    if (!fw) {
      fw = await FiatWallet.create({ userId, currency: 'USD', balanceCents: 0 });
    }

    // CAP balance helpers (keep your existing model semantics)
    async function getCapBalance(addr) {
      if (!CapBalance) return 0;
      const r = await CapBalance.findOne({ capAddress: addr });
      return r ? Number(r.tokens || 0) : 0;
    }
    async function setCapBalance(addr, tokens) {
      if (!CapBalance) return;
      const existing = await CapBalance.findOne({ capAddress: addr });
      if (existing) {
        existing.tokens = tokens;
        await existing.save();
      } else {
        await CapBalance.create({ capAddress: addr, tokens });
      }
    }

    const R = getRates();

    // NATIVE -> CAP (buy CAP)
    if (from === 'NATIVE' && to === 'CAP') {
      if (!capAddress) {
        return res.status(400).json({ error: 'bad_request', detail: 'capAddress required' });
      }
      const centsNeeded = Math.round(amountIn * 100); // 1 NATIVE == 1 USD
      if (fw.balanceCents < centsNeeded) {
        return res.status(409).json({ error: 'insufficient_native', haveCents: fw.balanceCents, needCents: centsNeeded });
      }

      const capOut = amountIn * R.CAP_PER_NATIVE;

      // apply
      fw.balanceCents -= centsNeeded;
      await fw.save();

      const prevCap = await getCapBalance(capAddress);
      await setCapBalance(capAddress, prevCap + capOut);

      return res.json({
        ok: true,
        txType: 'BUY_CAP',
        fromToken: from, toToken: to, amountIn, amountOut: capOut,
        capAddress,
        balances: {
          capTokens: prevCap + capOut,
          fiatBalanceCents: fw.balanceCents
        }
      });
    }

    // CAP -> NATIVE (sell CAP)
    if (from === 'CAP' && to === 'NATIVE') {
      if (!capAddress) {
        return res.status(400).json({ error: 'bad_request', detail: 'capAddress required' });
      }
      const prevCap = await getCapBalance(capAddress);
      if (prevCap < amountIn) {
        return res.status(409).json({ error: 'insufficient_cap', haveCAP: prevCap, needCAP: amountIn });
      }

      const nativeOut = amountIn * R.NATIVE_PER_CAP;
      const centsDelta = Math.round(nativeOut * 100);

      // apply
      await setCapBalance(capAddress, prevCap - amountIn);
      fw.balanceCents += centsDelta;
      await fw.save();

      return res.json({
        ok: true,
        txType: 'SELL_CAP',
        fromToken: from, toToken: to, amountIn, amountOut: nativeOut,
        capAddress,
        balances: {
          capTokens: prevCap - amountIn,
          fiatBalanceCents: fw.balanceCents
        }
      });
    }

    return res.status(400).json({ error: 'unsupported_pair' });
  } catch (e) {
    console.error('/swaps/execute error', e);
    res.status(500).json({ error: 'internal_error' });
  }
});

module.exports = router;
