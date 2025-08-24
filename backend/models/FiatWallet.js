// backend/models/FiatWallet.js
const mongoose = require('mongoose');

const FiatLedgerSchema = new mongoose.Schema({
  kind: { type: String, enum: ['deposit', 'withdraw', 'adjust'], required: true },
  amountCents: { type: Number, required: true },
  currency: { type: String, default: 'USD' },
  sessionId: { type: String }, // Stripe Checkout session id for dedupe
  note: { type: String },
  createdAt: { type: Date, default: Date.now }
}, { _id: false });

const FiatWalletSchema = new mongoose.Schema({
  // IMPORTANT: keep userId as STRING so values like "oauth:github:65869452" work
  userId: { type: String, index: true, required: true },

  // Stripe customer we map to on confirm() so no auth is needed for the callback
  stripeCustomerId: { type: String, index: true },

  balanceCents: { type: Number, default: 0 },
  currency: { type: String, default: 'USD' },

  ledger: { type: [FiatLedgerSchema], default: [] }
}, { timestamps: true });

// quick helper
FiatWalletSchema.methods.applyDeposit = function({ amountCents, currency, sessionId }) {
  // dedupe by sessionId
  if (sessionId && this.ledger.some(e => e.sessionId === sessionId && e.kind === 'deposit')) {
    return false; // already applied
  }
  this.balanceCents = (this.balanceCents || 0) + amountCents;
  this.currency = (currency || this.currency || 'USD').toUpperCase();
  this.ledger.push({ kind: 'deposit', amountCents, currency: this.currency, sessionId });
  return true;
};

FiatWalletSchema.methods.applyWithdraw = function({ amountCents, currency }) {
  if (amountCents > this.balanceCents) throw new Error('insufficient_funds');
  this.balanceCents = (this.balanceCents || 0) - amountCents;
  this.currency = (currency || this.currency || 'USD').toUpperCase();
  this.ledger.push({ kind: 'withdraw', amountCents, currency: this.currency });
  return true;
};

module.exports = mongoose.model('FiatWallet', FiatWalletSchema);
