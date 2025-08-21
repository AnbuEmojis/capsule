// cryptochain/routes/nfts.js
'use strict';

const express = require('express');
const { randomUUID } = require('crypto');
const router = express.Router();

// Try to load NFT model from common locations; fallback to in-memory
let NFT;
let USE_MEMORY = false;
try {
  NFT = require('../../backend/models/NFT');
} catch (e1) {
  try {
    NFT = require('../../backend/models/NFT');
  } catch (e2) {
    USE_MEMORY = true;
    console.warn('[nfts] Model not found, using in-memory store.');
  }
}

const memory = {
  nfts: [] // { tokenId, ownerAddress, metadataURI, chain }
};

router.post('/mint', async (req, res) => {
  try {
    const { ownerAddress, metadataURI } = req.body || {};
    if (!ownerAddress || !metadataURI) return res.status(400).json({ ok:false, error:'ownerAddress and metadataURI are required' });

    const tokenId = randomUUID();

    if (USE_MEMORY) {
      const item = { tokenId, ownerAddress, metadataURI, chain:'CAP' };
      memory.nfts.push(item);
      return res.json({ ok:true, nft: item });
    }

    const nft = await NFT.create({ tokenId, ownerAddress, metadataURI, chain:'CAP' });
    res.json({ ok:true, nft });
  } catch (e) {
    res.status(500).json({ ok:false, error: e.message });
  }
});

router.post('/transfer', async (req, res) => {
  try {
    const { tokenId, from, to } = req.body || {};
    if (!tokenId || !from || !to) return res.status(400).json({ ok:false, error:'tokenId, from, to required' });

    if (USE_MEMORY) {
      const nft = memory.nfts.find(n => n.tokenId === tokenId);
      if (!nft) return res.status(404).json({ ok:false, error:'Not found' });
      if (nft.ownerAddress !== from) return res.status(403).json({ ok:false, error:'Not owner' });
      nft.ownerAddress = to;
      return res.json({ ok:true, nft });
    }

    const nft = await NFT.findOne({ tokenId });
    if (!nft) return res.status(404).json({ ok:false, error:'Not found' });
    if (nft.ownerAddress !== from) return res.status(403).json({ ok:false, error:'Not owner' });
    nft.ownerAddress = to;
    await nft.save();
    res.json({ ok:true, nft });
  } catch (e) {
    res.status(500).json({ ok:false, error: e.message });
  }
});

router.post('/burn', async (req, res) => {
  try {
    const { tokenId, owner } = req.body || {};
    if (!tokenId || !owner) return res.status(400).json({ ok:false, error:'tokenId and owner required' });

    if (USE_MEMORY) {
      const idx = memory.nfts.findIndex(n => n.tokenId === tokenId);
      if (idx === -1) return res.status(404).json({ ok:false, error:'Not found' });
      if (memory.nfts[idx].ownerAddress !== owner) return res.status(403).json({ ok:false, error:'Not owner' });
      memory.nfts.splice(idx, 1);
      return res.json({ ok:true });
    }

    const nft = await NFT.findOne({ tokenId });
    if (!nft) return res.status(404).json({ ok:false, error:'Not found' });
    if (nft.ownerAddress !== owner) return res.status(403).json({ ok:false, error:'Not owner' });
    await NFT.deleteOne({ tokenId });
    res.json({ ok:true });
  } catch (e) {
    res.status(500).json({ ok:false, error: e.message });
  }
});

router.get('/my', async (req, res) => {
  try {
    const { address } = req.query || {};
    if (!address) return res.status(400).json({ ok:false, error:'address required' });

    if (USE_MEMORY) {
      const list = memory.nfts.filter(n => n.ownerAddress === address);
      return res.json({ ok:true, nfts: list });
    }

    const nfts = await NFT.find({ ownerAddress: address }).lean();
    res.json({ ok:true, nfts });
  } catch (e) {
    res.status(500).json({ ok:false, error: e.message });
  }
});

module.exports = router;
