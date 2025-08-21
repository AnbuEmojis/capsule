// models/StakePool.js
const mongoose = require('mongoose');

const StakePoolSchema = new mongoose.Schema({
  symbol: { type: String, required: true, unique: true }, // e.g., "CAP"
  displayName: { type: String, default: 'CAP Staking' },
  aprBps: { type: Number, default: 800 }, // 8.00% APR → 800 bps
  lockupDays: { type: Number, default: 0 },
  earlyUnstakePenaltyBps: { type: Number, default: 0 },
  totalStaked: { type: String, default: '0' }, // store as string to avoid JS float issues
  rewardsPerTokenStored: { type: String, default: '0' }, // scaled by 1e18
  lastUpdateBlock: { type: Number, default: 0 },
  isActive: { type: Boolean, default: true }
}, { timestamps: true });

module.exports = mongoose.model('StakePool', StakePoolSchema);