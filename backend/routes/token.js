// backend/routes/token.js
const express = require('express');
const router  = express.Router();
const crypto  = require('crypto');
const EC = require('elliptic').ec;
const ec = new EC('secp256k1');

const { calculateTokenBalance } = require('../../cryptochain/token/token-balance');
const { maxTokenNonce, nextTokenNonce } = require('../services/nonce');

// --- Dev Faucet (unchanged)
router.post('/faucet', (req, res) => {
  const { transactionPool } = req.app.locals;
  const { address, amount } = req.body || {};
  if (!address) return res.status(400).json({ message: 'Missing address' });
  const amt = Number(amount) || 100;

  const tx = {
    id: `tok-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    type: 'TOKEN',
    symbol: 'CAP',
    input: { address: 'SYSTEM' },
    outputMap: { [address]: amt }
  };

  transactionPool?.setTransaction(tx);
  res.json({ ok: true, queued: tx.id, address, amount: amt });
});

// --- Nonce helper (unchanged)
router.get('/nonce', (req, res) => {
  const { address } = req.query || {};
  if (!address) return res.status(400).json({ message: 'Missing address' });

  const { blockchain, transactionPool } = req.app.locals;
  if (!blockchain) return res.status(503).json({ message: 'Chain not ready' });

  const mempoolMap = transactionPool?.transactionMap || {};
  const n = nextTokenNonce({ chain: blockchain.chain, mempoolMap, publicKey: address, symbol: 'CAP' });
  res.json({ nextNonce: n });
});

// --- NEW: Signed CAP transfer
// body: { fromAddress, toAddress, amount, tokenSig:{ publicKey, signature:{r,s}, nonce, chainId? } }
router.post('/send', (req, res) => {
  const { blockchain, transactionPool } = req.app.locals;
  if (!blockchain) return res.status(503).json({ message: 'Chain not ready' });

  const { fromAddress, toAddress, amount, tokenSig } = req.body || {};
  const amt = Number(amount);
  if (!fromAddress || !toAddress || !Number.isFinite(amt) || amt <= 0) {
    return res.status(400).json({ message: 'Missing/invalid fields' });
  }
  if (fromAddress === toAddress) {
    return res.status(400).json({ message: 'Cannot send to self' });
  }
  if (!tokenSig || !tokenSig.publicKey || !tokenSig.signature || !Number.isInteger(tokenSig.nonce)) {
    return res.status(400).json({ message: 'Signature required' });
  }
  if (tokenSig.publicKey !== fromAddress) {
    return res.status(400).json({ message: 'Signature publicKey does not match fromAddress' });
  }

  // Balance guard
  const capBal = calculateTokenBalance({ chain: blockchain.chain, address: fromAddress, symbol: 'CAP' });
  if (capBal < amt) return res.status(422).json({ message: 'Insufficient CAP' });

  // Nonce guard (strictly increasing)
  const maxN = maxTokenNonce({
    chain: blockchain.chain,
    mempoolMap: transactionPool?.transactionMap || {},
    publicKey: fromAddress,
    symbol: 'CAP'
  });
  if (tokenSig.nonce <= maxN) return res.status(400).json({ message: 'Nonce too low (replay or out-of-order)' });

  // Verify signature over "<fromAddress>:<amount>:CAP:<nonce>[:<chainId>]"
  const msg = tokenSig.chainId
    ? `${fromAddress}:${amt}:CAP:${tokenSig.nonce}:${tokenSig.chainId}`
    : `${fromAddress}:${amt}:CAP:${tokenSig.nonce}`;
  const hashHex = crypto.createHash('sha256').update(msg).digest('hex');
  try {
    const key = ec.keyFromPublic(tokenSig.publicKey, 'hex');
    const ok = key.verify(hashHex, tokenSig.signature);
    if (!ok) return res.status(400).json({ message: 'Invalid signature' });
  } catch {
    return res.status(400).json({ message: 'Bad signature' });
  }

  // Enqueue CAP transfer tx
  const tokenTx = {
    id: `tok-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    type: 'TOKEN',
    symbol: 'CAP',
    input: { address: tokenSig.publicKey, nonce: tokenSig.nonce },
    outputMap: {
      [fromAddress]: -amt,
      [toAddress]: amt
    },
    signature: tokenSig.signature
  };

  transactionPool?.setTransaction(tokenTx);
  res.json({ ok: true, queued: tokenTx.id, nextAction: 'mine' });
});

module.exports = router;
