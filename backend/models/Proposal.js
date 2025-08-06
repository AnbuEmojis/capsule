// models/Proposal.js
const mongoose = require('mongoose');

const proposalSchema = new mongoose.Schema({
  title: String,
  description: String,
  votes: {
    yes: Number,
    no: Number,
    abstain: Number
  },
  createdAt: Date
});

module.exports = mongoose.model('Proposal', proposalSchema);
