// backend/models/ChainState.js
const mongoose = require('mongoose');

const ChainStateSchema = new mongoose.Schema({
  // singleton doc that tracks tip
  key: { type: String, unique: true, required: true, default: 'singleton' },
  height: { type: Number, required: true, default: 0 },
  lastBlockId: { type: mongoose.Schema.Types.ObjectId, default: null },
  network: { type: String, default: 'cap-local' },
}, { timestamps: true });

module.exports = mongoose.model('ChainState', ChainStateSchema);
