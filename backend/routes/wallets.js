// backend/routes/wallets.js
const express = require('express');
const router  = express.Router();
const Wallet  = require('../../cryptochain/wallet');
const { calculateTokenBalance } = require('../../cryptochain/token/token-balance');

// In-memory wallet lists per userId
// NOTE: dev-only persistence; restart will reset this (which is fine for dev)
const walletsByUser = new Map();

// Helper to read & init a user's list
function getUserList(userId) {
  if (!walletsByUser.has(userId)) walletsByUser.set(userId, []);
  return walletsByUser.get(userId);
}

/** GET /api/wallets
 * Returns the current user's wallet addresses only.
 */
router.get('/', (req, res) => {
  const userId = req.user?.userId || 'anon';
  const list = getUserList(userId);
  return res.json(list);
});

/** POST /api/wallets/generate
 * Creates a new wallet for the current user. Returns { publicKey, privateKey }.
 * (Client stores privateKey in localStorage. Server does NOT store keys.)
 */
router.post('/generate', (req, res) => {
  const userId = req.user?.userId || 'anon';
  const wallet = new Wallet();
  const publicKey  = wallet.publicKey;
  const privateKey = wallet.keyPair.getPrivate().toString(16);
  const list = getUserList(userId);
  list.push(publicKey);
  return res.json({ publicKey, privateKey });
});

/** GET /api/wallets/info?address=<pubkey>
 * Returns { address, balance (NATIVE), capTokenBalance } for any address.
 * (We don’t restrict info to owner so explorers/tools can query)
 */
router.get('/info', (req, res) => {
  const address = String(req.query.address || '');
  if (!address) return res.status(400).json({ message: 'Missing address' });

  const blockchain = req.app.locals.blockchain;
  if (!blockchain) return res.status(503).json({ message: 'Chain not ready' });

  try {
    const nativeBalance = Wallet.calculateBalance({ chain: blockchain.chain, address });
    const capTokenBalance = calculateTokenBalance({ chain: blockchain.chain, address, symbol: 'CAP' });
    return res.json({ address, balance: nativeBalance, capTokenBalance });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ message: 'Error calculating balances' });
  }
});

module.exports = router;
