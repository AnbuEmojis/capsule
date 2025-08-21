// backend/routes/liquidity.js
const express = require('express');
const router = express.Router();

/* ---------- helpers ---------- */
function tp(app){ return app?.locals?.transactionPool; }
function enqueue(app, tx){ if (tp(app)?.setTransaction) tp(app).setTransaction(tx); return tx; }
function nowId(){ return Date.now().toString(16) + Math.random().toString(16).slice(2); }
function pennyTreasury(){ return process.env.PENNY_TREASURY_ADDRESS || null; }
function chargePenny(app, pennyAmount, noteCtx){
  const amt = Number(pennyAmount || 0);
  const tre = pennyTreasury();
  if (!tre || !amt || !(amt > 0)) return null;
  const tx = {
    id: `penny-${nowId()}`,
    type: 'FEE',
    asset: 'NATIVE',
    outputMap: { [tre]: amt },
    note: `PENNY_FEE:${noteCtx || 'LIQUIDITY'}`
  };
  return enqueue(app, tx);
}
function getPool(app){ return app?.locals?.pool || null; }

// in-memory LP ledger (dev)
function getLedger(app){
  app.locals.__lp = app.locals.__lp || { totalShares: 0, byAddr: {} };
  return app.locals.__lp;
}
function mintShares(capIn, nativeIn){
  const a = Number(capIn||0), b = Number(nativeIn||0);
  if (a <= 0 || b <= 0) return 0;
  // simple dev mint rule (predictable & monotonic). Replace w/ real AMM math later.
  return Math.sqrt(a * b);
}

/* ---------- GET /api/liquidity/reserves ---------- */
router.get('/reserves', (req, res) => {
  const pool = getPool(req.app);
  if (pool?.getReserves) {
    return res.json(pool.getReserves());
  }
  // fallback (should not be needed if pool exists)
  const R = req.app.locals.__reserves || { CAP: 1_000_000, NATIVE: 10_000 };
  return res.json(R);
});

/* ---------- GET /api/liquidity/position?address=HEX ---------- */
router.get('/position', (req, res) => {
  const addr = String(req.query.address || '').trim();
  const L = getLedger(req.app);
  const my = L.byAddr[addr] || 0;
  const total = L.totalShares || 0;
  const pct = total > 0 ? (my / total) : 0;
  res.json({ address: addr, shares: my, totalShares: total, sharePct: pct });
});

/* ---------- POST /api/liquidity/add ----------
Body: { fromAddress, capAmount, nativeAmount, minerFee? }
*/
router.post('/add', (req, res) => {
  try{
    const { fromAddress, capAmount, nativeAmount, minerFee } = req.body || {};
    const capIn = Number(capAmount), natIn = Number(nativeAmount);
    if (!fromAddress || !Number.isFinite(capIn) || !Number.isFinite(natIn) || capIn<=0 || natIn<=0) {
      return res.status(400).json({ message: 'Bad body' });
    }
    const pool = getPool(req.app);
    let reserves;

    if (typeof pool?.addLiquidity === 'function') {
      reserves = pool.addLiquidity({ cap: capIn, native: natIn });
    } else if (typeof pool?.getReserves === 'function' && typeof pool?.setReserves === 'function') {
      const R = pool.getReserves();
      reserves = { CAP: Number(R.CAP)+capIn, NATIVE: Number(R.NATIVE)+natIn };
      pool.setReserves(reserves);
    } else {
      return res.status(500).json({ message: 'Pool unavailable' });
    }

    // LP shares (dev ledger)
    const L = getLedger(req.app);
    const minted = mintShares(capIn, natIn);
    L.byAddr[fromAddress] = (L.byAddr[fromAddress] || 0) + minted;
    L.totalShares += minted;

    // record to chain (optional visibility)
    enqueue(req.app, {
      id: `lp-add-${nowId()}`,
      type: 'LP_ADD',
      outputMap: { [fromAddress]: minted },
      note: `LP_ADD cap=${capIn} native=${natIn}`
    });

    // Penny to treasury
    chargePenny(req.app, minerFee, 'LP_ADD');

    return res.json({ ok:true, mintedShares: minted, reserves, totalShares: L.totalShares });
  }catch(e){
    return res.status(500).json({ message: e.message });
  }
});

/* ---------- POST /api/liquidity/remove ----------
Body: { fromAddress, shareAmount, minerFee? }
*/
router.post('/remove', (req, res) => {
  try{
    const { fromAddress, shareAmount, minerFee } = req.body || {};
    const burn = Number(shareAmount);
    if (!fromAddress || !Number.isFinite(burn) || burn<=0) {
      return res.status(400).json({ message: 'Bad body' });
    }
    const pool = getPool(req.app);
    if (!pool?.getReserves) return res.status(500).json({ message: 'Pool unavailable' });

    const L = getLedger(req.app);
    const my = L.byAddr[fromAddress] || 0;
    if (burn > my) return res.status(400).json({ message: 'Insufficient LP shares' });

    const R0 = pool.getReserves();
    const total = L.totalShares || 0;
    const pct = burn / total;

    const capOut = Number(R0.CAP) * pct;
    const natOut = Number(R0.NATIVE) * pct;

    // update pool
    if (typeof pool.removeLiquidity === 'function') {
      pool.removeLiquidity({ cap: capOut, native: natOut });
    } else if (typeof pool.setReserves === 'function') {
      pool.setReserves({ CAP: Number(R0.CAP)-capOut, NATIVE: Number(R0.NATIVE)-natOut });
    } else {
      return res.status(500).json({ message: 'Pool setter unavailable' });
    }

    // burn shares
    L.byAddr[fromAddress] = my - burn;
    L.totalShares = total - burn;

    enqueue(req.app, {
      id: `lp-rem-${nowId()}`,
      type: 'LP_REMOVE',
      outputMap: { [fromAddress]: -burn },
      note: `LP_REMOVE cap=${capOut} native=${natOut}`
    });

    chargePenny(req.app, minerFee, 'LP_REMOVE');

    return res.json({
      ok:true,
      removedShares: burn,
      amountsOut: { CAP: capOut, NATIVE: natOut },
      reservesAfter: pool.getReserves(),
      totalShares: L.totalShares
    });
  }catch(e){
    return res.status(500).json({ message: e.message });
  }
});

module.exports = router;
