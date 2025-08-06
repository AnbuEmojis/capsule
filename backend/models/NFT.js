// models/NFT.js
const mongoose = require('mongoose');

const nftSchema = new mongoose.Schema({
  owner: String,
  name: String,
  image: String,
  metadata: Object,
  mintedAt: Date
});

module.exports = mongoose.model('NFT', nftSchema);
