// backend/routes/walletgen.js
const express = require('express');
const bip39 = require('bip39');
const router = express.Router();

// Dev helper: return a fresh 24-word mnemonic
router.get('/mnemonic', (_req, res) => {
  const mnemonic = bip39.generateMnemonic(256); // 24 words
  res.json({ mnemonic });
});

module.exports = router;
