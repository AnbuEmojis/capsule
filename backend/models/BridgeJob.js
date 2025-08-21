// models/BridgeJob.js
const mongoose = require('mongoose');

const BridgeJobSchema = new mongoose.Schema({
  kind: { type: String, enum: ['NFT_LOCK', 'NFT_MINT_WRAPPED'], required: true },
  status: { type: String, enum: ['pending','sent','confirmed','failed'], default: 'pending', index: true },
  sourceChain: { type: String, required: true },
  targetChain: { type: String, required: true },
  request: { type: Object, default: {} }, // opaque bundle; includes tokenId, owner, proofs, etc.
  txHash: { type: String },
  error: { type: String }
}, { timestamps: true });

module.exports = mongoose.model('BridgeJob', BridgeJobSchema);