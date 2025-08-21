
// backend/routes/storeitems.js
const express = require('express');
const StoreItem = require('../models/StoreItem');
const router = express.Router();

router.get('/', async (req, res, next) => {
  try {
    const items = await StoreItem.find();
    res.json(items);
  } catch (err) {
    next(err);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const item = await StoreItem.findById(req.params.id);
    if (!item) return res.status(404).json({ message: 'StoreItem not found' });
    res.json(item);
  } catch (err) {
    next(err);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const newItem = new StoreItem(req.body);
    const saved = await newItem.save();
    res.status(201).json(saved);
  } catch (err) {
    next(err);
  }
});

router.put('/:id', async (req, res, next) => {
  try {
    const updated = await StoreItem.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!updated) return res.status(404).json({ message: 'StoreItem not found' });
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const deleted = await StoreItem.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ message: 'StoreItem not found' });
    res.json({ message: 'Deleted successfully' });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
