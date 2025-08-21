// backend/routes/blocks.js
const express    = require('express');
const Blockchain = require('../../cryptochain/blockchain');
const router     = express.Router();
const blockchain = new Blockchain();

// GET   /api/blocks
router.get('/', (req, res) => {
  res.json(blockchain.chain);
});

module.exports = router;
