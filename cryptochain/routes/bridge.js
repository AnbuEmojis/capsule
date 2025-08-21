// cryptochain/routes/bridge.js
'use strict';

const express = require('express');
const router = express.Router();

// Optional Mongo model; fallback to memory
let BridgeJob;
let USE_MEMORY = false;
try {
  BridgeJob = require('../models/BridgeJob');
} catch (e1) {
  try {
    BridgeJob = require('../../backend/models/BridgeJob');
  } catch (e2) {
    USE_MEMORY = true;
    console.warn('[bridge] Model not found, using in-memory store.');
  }
}

const memory = { jobs: [] };

router.post('/nft/lock', async (req, res) => {
  const { tokenId, ownerAddress, targetChain } = req.body || {};
  if (!tokenId || !ownerAddress || !targetChain) {
    return res.status(400).json({ ok:false, error:'tokenId, ownerAddress, targetChain required' });
  }

  if (USE_MEMORY) {
    const job = { _id: String(memory.jobs.length + 1), kind:'NFT_LOCK', status:'pending', sourceChain:'CAP', targetChain, request:{ tokenId, ownerAddress } };
    memory.jobs.push(job);
    return res.json({ ok:true, jobId: job._id });
  }

  const job = await BridgeJob.create({ kind:'NFT_LOCK', status:'pending', sourceChain:'CAP', targetChain, request:{ tokenId, ownerAddress } });
  res.json({ ok:true, jobId: job._id });
});

router.post('/nft/mint-wrapped', async (req, res) => {
  const { tokenId, originalChain, originalTokenId, ownerAddress } = req.body || {};
  if (!tokenId || !originalChain || !ownerAddress) {
    return res.status(400).json({ ok:false, error:'tokenId, originalChain, ownerAddress required' });
  }

  if (USE_MEMORY) {
    const job = { _id: String(memory.jobs.length + 1), kind:'NFT_MINT_WRAPPED', status:'pending', sourceChain: originalChain, targetChain:'CAP', request:{ tokenId, originalTokenId, ownerAddress } };
    memory.jobs.push(job);
    return res.json({ ok:true, jobId: job._id });
  }

  const job = await BridgeJob.create({ kind:'NFT_MINT_WRAPPED', status:'pending', sourceChain: originalChain, targetChain:'CAP', request:{ tokenId, originalTokenId, ownerAddress } });
  res.json({ ok:true, jobId: job._id });
});

module.exports = router;
