const mongoose = require('mongoose');

const AddressSchema = new mongoose.Schema({
  chain: { type: String, enum: ['CAP', 'SOL'], required: true },
  address: { type: String, required: true },
  label: { type: String, default: '' },
  isDefault: { type: Boolean, default: false },
}, { _id: false });

const UserSchema = new mongoose.Schema({
  email: { type: String, index: true, unique: true, sparse: true },
  oauth: {
    provider: { type: String },           // 'google' | 'github'
    sub: { type: String },                // provider user id
  },
  // wallet/address book
  addresses: { type: [AddressSchema], default: [] },
  // preferences
  currency: { type: String, default: 'USD' },  // UI currency
  createdAt: { type: Date, default: Date.now }
});

UserSchema.methods.setDefaultAddress = function (chain, address) {
  this.addresses.forEach(a => { if (a.chain === chain) a.isDefault = (a.address === address); });
};

module.exports = mongoose.model('User', UserSchema);
