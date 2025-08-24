const mongoose = require('mongoose');

// backend/models/FiatWallet.js
const FiatWalletSchema = new mongoose.Schema({
  userId: { type: String, index: true, required: true },
  balanceCents: { type: Number, default: 0 },
  currency: { type: String, default: 'USD' },
  stripeCustomerId: String,
  lastDepositSessionId: String,
}, { timestamps:true });


FiatWalletSchema.index({ userKey: 1 }, { unique: true });

module.exports = mongoose.model('FiatWallet', FiatWalletSchema);
