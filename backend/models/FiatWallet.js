const mongoose = require('mongoose');

const FiatWalletSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, index: true },
  currency: { type: String, default: 'USD' },
  balanceCents: { type: Number, default: 0 },
  ledger: [{
    type: { type: String, enum:['deposit','withdraw','adjust'], required: true },
    amountCents: { type: Number, required: true },
    stripePaymentIntent: String,
    note: String,
    createdAt: { type: Date, default: Date.now }
  }]
}, { timestamps: true });

module.exports = mongoose.model('FiatWallet', FiatWalletSchema);
