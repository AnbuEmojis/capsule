// cryptochain/routes/staking.js
'use strict';

const express = require('express');
const Big = require('big.js');
const router = express.Router();

// Try to load Mongo models; fallback to in-memory if not found
let StakePool, StakePosition;
let USE_MEMORY = false;
try {
  StakePool = require('../models/StakePool');
  StakePosition = require('../models/StakePosition');
} catch (e1) {
  try {
    StakePool = require('../../backend/models/StakePool');
    StakePosition = require('../../backend/models/StakePosition');
  } catch (e2) {
    USE_MEMORY = true;
    console.warn('[staking] Models not found, using in-memory store.');
  }
}

const memory = {
  pools: {
    CAP: {
      symbol: 'CAP',
      displayName: 'CAP Staking',
      aprBps: 800,
      lockupDays: 0,
      earlyUnstakePenaltyBps: 0,
      totalStaked: '0',
      rewardsPerTokenStored: '0',
      lastUpdateBlock: 0,
      isActive: true
    }
  },
  positions: [] // {poolSymbol,address,amount,rewardsAccrued,rewardsPerTokenPaid}
};

router.get('/pools', async (_req, res) => {
  if (USE_MEMORY) return res.json({ ok:true, pools: Object.values(memory.pools) });
  const pools = await StakePool.find({}).lean();
  res.json({ ok:true, pools });
});

router.post('/pools', async (req, res) => {
  const { symbol, displayName, aprBps, lockupDays, earlyUnstakePenaltyBps, isActive } = req.body || {};
  if (!symbol) return res.status(400).json({ ok:false, error:'symbol required' });

  if (USE_MEMORY) {
    const p = memory.pools[symbol] || { symbol, totalStaked: '0', rewardsPerTokenStored:'0', lastUpdateBlock:0 };
    Object.assign(p, {
      displayName: displayName || p.displayName || `${symbol} Staking`,
      aprBps: Number(aprBps ?? p.aprBps ?? 800),
      lockupDays: Number(lockupDays ?? p.lockupDays ?? 0),
      earlyUnstakePenaltyBps: Number(earlyUnstakePenaltyBps ?? p.earlyUnstakePenaltyBps ?? 0),
      isActive: isActive ?? p.isActive ?? true
    });
    memory.pools[symbol] = p;
    return res.json({ ok:true, pool: p });
  }

  const pool = await StakePool.findOneAndUpdate(
    { symbol },
    { $set: { displayName, aprBps, lockupDays, earlyUnstakePenaltyBps, isActive } },
    { upsert: true, new: true }
  );
  res.json({ ok:true, pool });
});

router.post('/stake', async (req, res) => {
  const { poolSymbol, address, amount } = req.body || {};
  if (!poolSymbol || !address || !amount) {
    return res.status(400).json({ ok:false, error:'poolSymbol, address, amount required' });
  }

  if (USE_MEMORY) {
    const pool = memory.pools[poolSymbol];
    if (!pool || !pool.isActive) return res.status(400).json({ ok:false, error:'Pool inactive' });
    let pos = memory.positions.find(p => p.poolSymbol === poolSymbol && p.address === address);
    if (!pos) { pos = { poolSymbol, address, amount:'0', rewardsAccrued:'0', rewardsPerTokenPaid:'0' }; memory.positions.push(pos); }
    pos.amount = Big(pos.amount).plus(amount).toFixed(0);
    pool.totalStaked = Big(pool.totalStaked).plus(amount).toFixed(0);
    return res.json({ ok:true, position: pos });
  }

  const pool = await StakePool.findOne({ symbol: poolSymbol });
  if (!pool || !pool.isActive) return res.status(400).json({ ok:false, error:'Pool inactive' });

  let pos = await StakePosition.findOne({ poolSymbol, address });
  if (!pos) pos = new StakePosition({ poolSymbol, address, amount: '0' });

  pos.amount = Big(pos.amount).plus(amount).toFixed(0);
  await pos.save();

  pool.totalStaked = Big(pool.totalStaked).plus(amount).toFixed(0);
  await pool.save();

  res.json({ ok:true, position: pos });
});

router.post('/claim', async (_req, res) => {
  res.json({ ok:true, submitted: true });
});

router.post('/unstake', async (_req, res) => {
  res.json({ ok:true, submitted: true });
});

router.get('/positions', async (req, res) => {
  const { address } = req.query || {};
  if (!address) return res.status(400).json({ ok:false, error:'address required' });

  if (USE_MEMORY) {
    const list = memory.positions.filter(p => p.address === address);
    return res.json({ ok:true, positions: list });
  }

  const positions = await StakePosition.find({ address }).lean();
  res.json({ ok:true, positions });
});

module.exports = router;
