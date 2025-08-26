// backend/models/CapBalance.js
const mongoose = require('mongoose');

const CapBalanceSchema = new mongoose.Schema(
  {
    // Use STRING userId so oauth:github:... works (no ObjectId cast errors)
    userId: { type: String, index: true, required: true },
    // Public wallet address for this user/session
    address: { type: String, index: true, required: true },
    // Units of CAP token (not cents)
    capUnits: { type: Number, default: 0 },
  },
  { timestamps: true }
);

// Create-or-get by userId or address
CapBalanceSchema.statics.getFor = async function ({ userId, address }) {
  if (!userId && !address) throw new Error('getFor requires userId or address');
  const query = userId ? { userId } : { address };
  let doc = await this.findOne(query);
  if (!doc) {
    doc = await this.create({
      userId: userId || `addr:${address}`,
      address: address || '',
      capUnits: 0,
    });
  }
  return doc;
};

// Safe delta apply
CapBalanceSchema.methods.applyDelta = async function (unitsDelta) {
  const next = Math.max(0, Number(this.capUnits || 0) + Number(unitsDelta || 0));
  this.capUnits = next;
  await this.save();
  return this;
};

module.exports = mongoose.model('CapBalance', CapBalanceSchema);
