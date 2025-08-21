// models/NFT.js
const mongoose = require('mongoose');

const NFTSchema = new mongoose.Schema({
  tokenId: { type: String, required: true, unique: true },
  ownerAddress: { type: String, required: true, index: true },
  metadataURI: { type: String, required: true }, // ipfs://… or https://…
  chain: { type: String, default: 'CAP' }, // 'CAP' for CryptoChain, 'EVM', 'SOL', etc.
  wrappedOriginal: {
    present: { type: Boolean, default: false },
    chain: String,
    tokenId: String
  }
}, { timestamps: true });

module.exports = mongoose.model('NFT', NFTSchema);