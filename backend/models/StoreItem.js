// models/StoreItem.js
const mongoose = require('mongoose');

const storeItemSchema = new mongoose.Schema({
  name: String,
  price: Number,
  image: String,
  description: String
});

module.exports = mongoose.model('StoreItem', storeItemSchema);
