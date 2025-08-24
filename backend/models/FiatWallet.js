const mongoose = require('mongoose');

const FiatWalletSchema = new mongoose.Schema({
  userKey: { type: String, required: true, unique: true, index: true }, // e.g. "oauth:github:65869452"
  balanceCents: { type: Number, default: 0 },
  currency: { type: String, default: 'USD' },
  processedSessions: { type: [String], default: [] }, // Stripe session ids we've applied
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

FiatWalletSchema.pre('save', function (next) { this.updatedAt = new Date(); next(); });

module.exports = mongoose.model('FiatWallet', FiatWalletSchema);
