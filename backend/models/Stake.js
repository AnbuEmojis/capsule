// models/Stake.js
const mongoose = require('mongoose');

const stakeSchema = new mongoose.Schema({
  address: String,
  amount: Number,
  startTime: Date
});

module.exports = mongoose.model('Stake', stakeSchema);
