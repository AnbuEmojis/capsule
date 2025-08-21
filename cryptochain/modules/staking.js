// cryptochain/modules/staking.js
'use strict';

const Big = require('big.js');
const { MINE_RATE } = require('../config'); // correct relative path from modules/ → ../config

const SCALE = Big(1e18);

// Estimate blocks per year from MINE_RATE (ms)
const SECONDS_PER_YEAR = Big(365 * 24 * 60 * 60);
const avgBlockSeconds  = Big(MINE_RATE).div(1000);
const BLOCKS_PER_YEAR  = SECONDS_PER_YEAR.div(avgBlockSeconds);

function bn(x){ return Big(x || 0); }

function aprBpsToRatePerBlock(aprBps){
  // APR in basis points → per-block linear rate
  // ratePerBlock = (APR/10000) / BLOCKS_PER_YEAR
  return bn(aprBps).div(10000).div(BLOCKS_PER_YEAR);
}

function updatePoolRewards(poolState, currentBlock){
  const lastUpdate = poolState.lastUpdateBlock || 0;
  const total = bn(poolState.totalStaked || '0');

  if (total.eq(0)) {
    poolState.lastUpdateBlock = currentBlock;
    return poolState;
  }

  const blocks = Big(currentBlock - lastUpdate);
  if (blocks.lte(0)) return poolState;

  const ratePerBlock = aprBpsToRatePerBlock(poolState.aprBps || 0);
  const reward       = blocks.times(ratePerBlock).times(total);
  const rptDelta     = reward.times(SCALE).div(total);

  const stored = bn(poolState.rewardsPerTokenStored || '0');
  poolState.rewardsPerTokenStored = stored.plus(rptDelta).toFixed(0);
  poolState.lastUpdateBlock       = currentBlock;
  return poolState;
}

function updatePositionRewards(poolState, pos){
  const stored = bn(poolState.rewardsPerTokenStored || '0');
  const paid   = bn(pos.rewardsPerTokenPaid || '0');
  const amt    = bn(pos.amount || '0');

  const earned = stored.minus(paid).times(amt).div(SCALE);
  pos.rewardsAccrued      = bn(pos.rewardsAccrued || '0').plus(earned).toFixed(0);
  pos.rewardsPerTokenPaid = stored.toFixed(0);
  return pos;
}

module.exports = {
  updatePoolRewards,
  updatePositionRewards,
  aprBpsToRatePerBlock,
  SCALE
};
