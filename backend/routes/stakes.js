
// backend/routes/stakes.js
const express = require('express');
const Stake = require('../models/Stake');
const router = express.Router();

router.get('/', async (req, res, next) => {
  try {
    const stakes = await Stake.find();
    res.json(stakes);
  } catch (err) {
    next(err);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const stake = await Stake.findById(req.params.id);
    if (!stake) return res.status(404).json({ message: 'Stake not found' });
    res.json(stake);
  } catch (err) {
    next(err);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const newStake = new Stake(req.body);
    const saved = await newStake.save();
    res.status(201).json(saved);
  } catch (err) {
    next(err);
  }
});

router.put('/:id', async (req, res, next) => {
  try {
    const updated = await Stake.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!updated) return res.status(404).json({ message: 'Stake not found' });
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const deleted = await Stake.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ message: 'Stake not found' });
    res.json({ message: 'Deleted successfully' });
  } catch (err) {
    next(err);
  }
});

module.exports = router;

