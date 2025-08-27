// backend/routes/swaps.js
const express = require('express');
const router = express.Router();
const chainBridge = require('../services/chainBridge');

const CapBalance = require('../models/CapBalance');
let FiatWallet;
try { FiatWallet = require('../models/FiatWallet'); } catch { FiatWallet = null; }

// ---------- helpers ----------
function getUserId(req) {
  if (req.user?.id) return String(req.user.id);
  if (req.headers['x-user-id']) return String(req.headers['x-user-id']);
  if (req.body?.userId) return String(req.body.userId);
  if (req.query?.userId) return String(req.query.userId);
  return 'dev:local';
}

async function getRates() {
  // If you have a real rate source/pool, read it here.
  // CAP_NATIVE = how many NATIVE per 1 CAP (example: 0.01 means 1 CAP = 0.01 NATIVE)
  return { NATIVE_USD: 1.0, CAP_NATIVE: 0.01 };
}

// Emit a tx into your chain/mempool if available (no-op otherwise)
async function emitChainTx(req, tx) {
  try {
    const chain   = req.app?.locals?.chain;
    const mempool = req.app?.locals?.mempool;
    const miner   = req.app?.locals?.miner;

    if (chain && typeof chain.addTx === 'function') {
      chain.addTx(tx);
    } else if (mempool && typeof mempool.push === 'function') {
      mempool.push(tx);
    } else {
      // dev/accounting mode: nothing to emit to
      return;
    }

    // Optionally poke the miner
    if (miner && typeof miner.mineNext === 'function') {
      miner.mineNext();
    }
  } catch (e) {
    console.warn('[chain-tx] emit failed (non-fatal):', e);
  }
}

// ---------- routes ----------

// GET /api/swaps/quote?fromToken=NATIVE&toToken=CAP&amount=123
router.get('/quote', async (req, res) => {
  try {
    const fromToken = String(req.query.fromToken || '').toUpperCase();
    const toToken   = String(req.query.toToken   || '').toUpperCase();
    const amountIn  = Number(req.query.amount || 0);
    if (!(amountIn > 0)) return res.status(400).json({ error: 'bad_amount' });

    const fx = await getRates();
    let amountOut = 0;

    if (fromToken === 'NATIVE' && toToken === 'CAP') {
      amountOut = amountIn / (fx.CAP_NATIVE || 0.01);
    } else if (fromToken === 'CAP' && toToken === 'NATIVE') {
      amountOut = amountIn * (fx.CAP_NATIVE || 0.01);
    } else {
      return res.status(400).json({ error: 'unsupported_pair' });
    }

    res.json({ ok: true, amountOut, route: [fromToken, toToken] });
  } catch (e) {
    console.error('quote error', e);
    res.status(500).json({ error: 'internal_error' });
  }
});

// POST /api/swaps/execute
// body: { fromToken, toToken, amountIn, toCapAddress?, autoTax? }
router.post('/execute', async (req, res) => {
  try {
    const fromToken = String(req.body?.fromToken || '').toUpperCase();
    const toToken   = String(req.body?.toToken   || '').toUpperCase();
    const amountIn  = Number(req.body?.amountIn ?? req.body?.amount);
    const toCapAddress = String(req.body?.toCapAddress || '').trim();

    if (!(amountIn > 0)) return res.status(400).json({ error: 'bad_amount' });
    if (!['NATIVE','CAP'].includes(fromToken) || !['NATIVE','CAP'].includes(toToken)) {
      return res.status(400).json({ error: 'unsupported_pair' });
    }

    const userId = getUserId(req);
    const fx = await getRates();

    // Load docs
    const capDoc = await CapBalance.getFor({ userId, address: toCapAddress || undefined });
    let fiatDoc = null;
    if (FiatWallet) {
      fiatDoc = await FiatWallet.findOneAndUpdate(
        { userId },
        { $setOnInsert: { userId, currency: 'USD', balanceCents: 0 } },
        { new: true, upsert: true }
      );
    }

    let amountOut = 0;

    // BUY: NATIVE -> CAP
    if (fromToken === 'NATIVE' && toToken === 'CAP') {
      const centsNeeded = Math.round(amountIn * 100);
      if (fiatDoc && (fiatDoc.balanceCents || 0) < centsNeeded) {
        return res.status(409).json({ error: 'insufficient_native' });
      }

      amountOut = amountIn / (fx.CAP_NATIVE || 0.01);

      if (fiatDoc) {
        fiatDoc.balanceCents = Math.max(0, (fiatDoc.balanceCents || 0) - centsNeeded);
        await fiatDoc.save();
      }
      await capDoc.applyDelta(+amountOut);

      await chainBridge.recordSwap(req, {
        userId: req.user?.id || req.headers['x-user-id'] || 'unknown',
        address: req.body?.address || req.body?.toAddress || req.user?.address || 'unknown',
        fromToken: 'NATIVE',
        toToken: 'CAP',
        amountIn,                     // the native spent
        amountOut: result?.amountOut, // whatever you returned to the client
        quote: result?.quoteId,       // optional
        txId:   result?.txId          // optional
      });
      

      // emit chain tx (non-fatal if no chain)
      await emitChainTx(req, {
        type: 'SWAP',
        side: 'BUY',
        fromToken, toToken,
        amountIn, amountOut,
        address: toCapAddress || req.body?.address || '',
        userId, ts: Date.now()
      });

      return res.json({
        ok: true,
        fromToken, toToken, amountIn, amountOut,
        balances: {
          cap: capDoc.capUnits,
          native: fiatDoc ? (fiatDoc.balanceCents/100) : undefined
        }
      });
    }

    // SELL: CAP -> NATIVE
    if (fromToken === 'CAP' && toToken === 'NATIVE') {
      if ((capDoc.capUnits || 0) < amountIn) {
        return res.status(409).json({ error: 'insufficient_cap' });
      }
      amountOut = amountIn * (fx.CAP_NATIVE || 0.01);

      await capDoc.applyDelta(-amountIn);
      if (fiatDoc) {
        fiatDoc.balanceCents = Math.max(0, (fiatDoc.balanceCents || 0) + Math.round(amountOut * 100));
        await fiatDoc.save();
      }

      // emit chain tx (non-fatal if no chain)
      await emitChainTx(req, {
        type: 'SWAP',
        side: 'SELL',
        fromToken, toToken,
        amountIn, amountOut,
        address: req.body?.address || '',
        userId, ts: Date.now()
      });

      await chainBridge.recordSwap(req, {
        userId: req.user?.id || req.headers['x-user-id'] || 'unknown',
        address: req.body?.address || req.body?.fromAddress || req.user?.address || 'unknown',
        fromToken: 'CAP',
        toToken: 'NATIVE',
        amountIn,                     // CAP burned
        amountOut: result?.amountOut, // native back
        quote: result?.quoteId,       // optional
        txId:   result?.txId          // optional
      });
      

      return res.json({
        ok: true,
        fromToken, toToken, amountIn, amountOut,
        balances: {
          cap: capDoc.capUnits,
          native: fiatDoc ? (fiatDoc.balanceCents/100) : undefined
        }
      });
    }

    res.status(400).json({ error: 'unsupported_pair' });
  } catch (e) {
    console.error('execute error', e);
    res.status(500).json({ error: 'internal_error' });
  }
});

module.exports = router;
