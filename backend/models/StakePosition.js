// models/StakePosition.js
const mongoose = require('mongoose');

const StakePositionSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
  address: { type: String, required: true, index: true }, // CryptoChain wallet pubkey
  poolSymbol: { type: String, required: true, index: true },
  amount: { type: String, default: '0' }, // currently staked principal
  rewardsAccrued: { type: String, default: '0' }, // unclaimed
  rewardsPerTokenPaid: { type: String, default: '0' }, // 1e18 scaled snapshot
  unlockBlock: { type: Number, default: 0 }
}, { timestamps: true });

module.exports = mongoose.model('StakePosition', StakePositionSchema);