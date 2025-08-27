// backend/services/chainBridge.js
// Minimal, zero-deps bridge to push wallet/fiat/swap events onto your chain.

const fs = require('fs');
const path = require('path');

function writeAuditLine(event) {
  try {
    const dir = path.join(process.cwd(), 'data');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, 'audit.jsonl');
    fs.appendFileSync(file, JSON.stringify(event) + '\n');
  } catch (e) {
    console.error('chainBridge.audit write failed', e);
  }
}

function tryAddBlock(app, event) {
  try {
    const bc = app?.locals?.blockchain;
    if (bc && typeof bc.addBlock === 'function') {
      // We put one event per block to keep it simple & easy to scan in dev.
      bc.addBlock({ data: [event] });
      return true;
    }
  } catch (e) {
    console.error('chainBridge.addBlock failed', e);
  }
  return false;
}

/**
 * Record a fiat deposit as a chain event.
 * NOTE: We assume 1:1 mapping USD -> NATIVE for now, which matches your “Native = Fiat” rule.
 */
async function recordFiatDeposit(req, { userId, address, amountCents, currency = 'USD', stripeSessionId }) {
  const ev = {
    kind: 'fiat_deposit',
    ts: Date.now(),
    userId: userId ?? req.user?.id ?? req.headers['x-user-id'] ?? 'unknown',
    address,
    amountCents,
    currency,
    nativeAmount: Number((amountCents / 100).toFixed(2)),
    stripeSessionId,
  };
  const ok = tryAddBlock(req.app, ev);
  if (!ok) writeAuditLine(ev);
  return ok;
}

/**
 * Record a token/NATIVE swap as a chain event.
 * fromToken/toToken ∈ {'NATIVE','CAP',...}
 */
async function recordSwap(req, { userId, address, fromToken, toToken, amountIn, amountOut, quote, txId }) {
  const ev = {
    kind: 'swap',
    ts: Date.now(),
    userId: userId ?? req.user?.id ?? req.headers['x-user-id'] ?? 'unknown',
    address,
    fromToken,
    toToken,
    amountIn: Number(amountIn),
    amountOut: Number(amountOut ?? 0),
    quote: quote ?? null,
    txId: txId ?? null,
  };
  const ok = tryAddBlock(req.app, ev);
  if (!ok) writeAuditLine(ev);
  return ok;
}

module.exports = { recordFiatDeposit, recordSwap };
