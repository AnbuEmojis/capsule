const mongoose = require('mongoose');

const LedgerEntry = new mongoose.Schema({
  at: { type: Date, default: Date.now },
  type: { type: String },
  amountCents: { type: Number, default: 0 },
  note: { type: String },
  meta: { type: mongoose.Schema.Types.Mixed }
}, { _id:false });

const FiatWalletSchema = new mongoose.Schema({
  userId:   { type: String, required: true, index: true }, // <-- string, not ObjectId
  currency: { type: String, default: 'USD' },
  balanceCents: { type: Number, default: 0 },
  stripeCustomerId: { type: String },
  updatedAt: { type: Date, default: Date.now }
});

FiatWalletSchema.index({ userId: 1 });

FiatWalletSchema.statics.findByUser = function(user){
  if (!user) return null;
  const u = user;
  const candidates = [];
  ['_id','id','userId','sub','email'].forEach(k=>{
    if (u && u[k]) candidates.push(String(u[k]).trim());
  });
  if (typeof u === 'string') candidates.push(u.trim());
  return this.findOne({
    $or: [
      { userId:  { $in: candidates } },
      { userKey: { $in: candidates } }
    ]
  });
};

module.exports = mongoose.model('FiatWallet', FiatWalletSchema);
