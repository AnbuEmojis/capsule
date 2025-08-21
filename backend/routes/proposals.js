const express = require('express');
const Proposal = require('../models/Proposal');
const router = express.Router();

router.get('/', async (req, res, next) => {
  try {
    const proposals = await Proposal.find();
    res.json(proposals);
  } catch (err) {
    next(err);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const proposal = await Proposal.findById(req.params.id);
    if (!proposal) return res.status(404).json({ message: 'Proposal not found' });
    res.json(proposal);
  } catch (err) {
    next(err);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const newProposal = new Proposal(req.body);
    const saved = await newProposal.save();
    res.status(201).json(saved);
  } catch (err) {
    next(err);
  }
});

router.put('/:id', async (req, res, next) => {
  try {
    const updated = await Proposal.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!updated) return res.status(404).json({ message: 'Proposal not found' });
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const deleted = await Proposal.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ message: 'Proposal not found' });
    res.json({ message: 'Deleted successfully' });
  } catch (err) {
    next(err);
  }
});

module.exports = router;