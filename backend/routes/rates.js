// backend/routes/rates.js
const express = require('express');
const router  = express.Router();
const { nativeToFiat } = require('../services/oracle');

// GET /api/rates/cap?vs=CAD
router.get('/cap', async (req, res) => {
  try {
    const { pool } = req.app.locals;
    if (!pool) return res.status(503).json({ message: 'Pool not ready' });

    const vs = (req.query.vs || 'CAD').toUpperCase();
    const { CAP, NATIVE } = pool.getReserves();
    if (!Number.isFinite(CAP) || !Number.isFinite(NATIVE) || CAP <= 0) {
      return res.status(500).json({ message: 'Bad reserves' });
    }

    // CAP per NATIVE (price of 1 CAP in NATIVE) is NATIVE / CAP for a constant product with equal weights.
    const capInNative = NATIVE / CAP;

    const nativeInFiat = await nativeToFiat(vs);
    const capInFiat = nativeInFiat ? capInNative * nativeInFiat : null;

    res.json({
      vs,
      cap_native: capInNative,
      native_fiat: nativeInFiat,  // NATIVE per 1 fiat? (this is 1 NATIVE in fiat)
      cap_fiat: capInFiat
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: e.message });
  }
});

module.exports = router;
