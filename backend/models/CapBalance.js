// backend/models/CapBalance.js
const mongoose = require('mongoose');

const CapBalanceSchema = new mongoose.Schema(
  {
    address: { type: String, index: true, unique: true }, // CAP public address (04..)
    amount: { type: Number, default: 0 },                  // CAP tokens (plain number)
  },
  { timestamps: true }
);

module.exports = mongoose.model('CapBalance', CapBalanceSchema);
