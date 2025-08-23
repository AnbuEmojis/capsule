const mongoose = require('mongoose');

const RewardSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, index: true },
  points: { type: Number, default: 0 },
  streak: { type: Number, default: 0 },
  lastCheckinAt: Date,
  ledger: [{
    type: { type: String, enum:['checkin','trade','liquidity','claim','adjust'], required: true },
    delta: Number,
    note: String,
    createdAt: { type: Date, default: Date.now }
  }]
}, { timestamps: true });

module.exports = mongoose.model('Reward', RewardSchema);
