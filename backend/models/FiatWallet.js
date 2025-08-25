// backend/models/FiatWallet.js
const mongoose = require('mongoose');

const FiatWalletSchema = new mongoose.Schema({
  userId:           { type: String, index: true, required: true }, // String, not ObjectId
  stripeCustomerId: { type: String },
  balanceCents:     { type: Number, default: 0 },
  currency:         { type: String, default: 'USD' },
  credits:          { type: [String], default: [] } // store processed session ids (idempotency)
}, { timestamps: true });

module.exports = mongoose.model('FiatWallet', FiatWalletSchema);
