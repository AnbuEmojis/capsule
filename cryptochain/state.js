// cryptochain/state.js
'use strict';

/**
 * This file exposes app singletons AND a safe extension reducer for staking/NFT txs.
 * The crash you saw (`ReferenceError: tx is not defined`) happened because a `switch(tx.type)`
 * block was executed at top-level. It's now wrapped in `applyExtendedTx(state, tx, currentBlock)`.
 */

const fs = require('fs');
const path = require('path');
const Big = require('big.js');

const { STAKE, UNSTAKE, CLAIM_REWARD, NFT_MINT, NFT_TRANSFER, NFT_BURN } = require('./tx-types');
const { updatePoolRewards, updatePositionRewards } = require('./modules/staking');
const { mintNFT, transferNFT, burnNFT } = require('./modules/nft');

const Blockchain           = require('./blockchain');
const TransactionPool      = require('./wallet/transaction-pool');
const Wallet               = require('./wallet');
const PubSub               = require('./app/pubsub');
const TransactionMiner     = require('./mining/transaction-miner');
const { pool }             = require('./liquidity-pool');

const DATA_DIR  = path.join(process.cwd(), 'data');
const POOL_PATH = path.join(DATA_DIR, 'pool.json');

// Ensure data dir exists
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

// ---- Load/Save Liquidity Pool ----
function loadPool() {
  try {
    if (fs.existsSync(POOL_PATH)) {
      const json = JSON.parse(fs.readFileSync(POOL_PATH, 'utf8'));
      if (json && json.reserves && typeof json.reserves === 'object') {
        const reserves = pool.getReserves();
        for (const k of Object.keys(reserves)) {
          if (json.reserves[k] != null) reserves[k] = Number(json.reserves[k]);
        }
        pool.reserves = reserves;
        console.log('Loaded pool from disk:', pool.reserves);
        return;
      }
    }
  } catch (e) {
    console.warn('⚠️ Failed to load pool.json, seeding fresh.', e.message);
  }

  // First boot: seed with sane defaults only if empty
  const r = pool.getReserves();
  const empty = Object.values(r).every(v => Number(v) === 0);
  if (empty) {
    pool.seed({ amountToken: 1_000_000, amountBase: 10_000 });
    console.log('Seeded pool:', pool.getReserves());
  }
}

function savePool() {
  try {
    fs.writeFileSync(POOL_PATH, JSON.stringify({ reserves: pool.getReserves() }, null, 2));
  } catch (e) {
    console.warn('⚠️ Failed to save pool.json:', e.message);
  }
}

// ---- Core singletons ----
const blockchain      = new Blockchain();
const transactionPool = new TransactionPool();
const wallet          = new Wallet();
const pubsub          = new PubSub({ blockchain, transactionPool });
const miner           = new TransactionMiner({ blockchain, transactionPool, wallet, pubsub });

// Expose a single "ready" Promise that resolves when chain is loaded & pool is prepared
const ready = (async () => {
  if (blockchain.ready && typeof blockchain.ready.then === 'function') {
    await blockchain.ready;
  }
  loadPool();
})();

async function shutdown() {
  savePool();
}

// ---- Extended transaction reducer (staking & NFTs) ----

function ensureStateInitialized(state) {
  state.balances       = state.balances || {};
  state.stakePools     = state.stakePools || { CAP: { symbol:'CAP', aprBps:800, totalStaked:'0', rewardsPerTokenStored:'0', lastUpdateBlock:0, isActive:true } };
  state.stakePositions = state.stakePositions || {};
  state.nfts           = state.nfts || {};
}

/**
 * Apply staking/NFT side effects to the canonical `state` object.
 * Call this from wherever your chain applies transactions (e.g., inside Blockchain reducer).
 * @param {object} state - chain state (canonical)
 * @param {object} tx    - transaction object with `type` and `data`
 * @param {number} currentBlock - current block height (optional but recommended)
 */
function applyExtendedTx(state, tx, currentBlock = 0) {
  if (!tx || !tx.type) return state;
  ensureStateInitialized(state);

  switch (tx.type) {
    case STAKE: {
      const { poolSymbol, address, amount, currentBlock: cbFromTx } = tx.data;
      const cb = Number.isFinite(currentBlock) && currentBlock > 0 ? currentBlock : (cbFromTx || 0);
      const poolState = state.stakePools[poolSymbol];
      if (!poolState || !poolState.isActive) throw new Error('Pool inactive');

      updatePoolRewards(poolState, cb);
      const posKey = `${poolSymbol}:${address}`;
      const pos = state.stakePositions[posKey] || { amount:'0', rewardsAccrued:'0', rewardsPerTokenPaid: poolState.rewardsPerTokenStored || '0' };
      updatePositionRewards(poolState, pos);

      if (Big(state.balances[address] || '0').lt(amount)) throw new Error('Insufficient balance');
      state.balances[address] = Big(state.balances[address] || 0).minus(amount).toFixed(0);
      pos.amount = Big(pos.amount).plus(amount).toFixed(0);
      poolState.totalStaked = Big(poolState.totalStaked).plus(amount).toFixed(0);
      state.stakePositions[posKey] = pos;
      return state;
    }

    case CLAIM_REWARD: {
      const { poolSymbol, address, currentBlock: cbFromTx } = tx.data;
      const cb = Number.isFinite(currentBlock) && currentBlock > 0 ? currentBlock : (cbFromTx || 0);
      const poolState = state.stakePools[poolSymbol];
      updatePoolRewards(poolState, cb);
      const posKey = `${poolSymbol}:${address}`;
      const pos = state.stakePositions[posKey];
      if (!pos) throw new Error('No position');
      updatePositionRewards(poolState, pos);
      const reward = Big(pos.rewardsAccrued);
      if (reward.gt(0)) {
        pos.rewardsAccrued = '0';
        state.balances[address] = Big(state.balances[address] || 0).plus(reward).toFixed(0);
      }
      return state;
    }

    case UNSTAKE: {
      const { poolSymbol, address, amount, currentBlock: cbFromTx } = tx.data;
      const cb = Number.isFinite(currentBlock) && currentBlock > 0 ? currentBlock : (cbFromTx || 0);
      const poolState = state.stakePools[poolSymbol];
      updatePoolRewards(poolState, cb);
      const posKey = `${poolSymbol}:${address}`;
      const pos = state.stakePositions[posKey];
      if (!pos) throw new Error('No position');
      updatePositionRewards(poolState, pos);
      if (Big(pos.amount).lt(amount)) throw new Error('Amount exceeds staked');
      pos.amount = Big(pos.amount).minus(amount).toFixed(0);
      poolState.totalStaked = Big(poolState.totalStaked).minus(amount).toFixed(0);
      state.balances[address] = Big(state.balances[address] || 0).plus(amount).toFixed(0);
      return state;
    }

    case NFT_MINT: {
      const { tokenId, ownerAddress, metadataURI } = tx.data;
      mintNFT(state, { tokenId, ownerAddress, metadataURI });
      return state;
    }

    case NFT_TRANSFER: {
      const { tokenId, from, to } = tx.data;
      transferNFT(state, { tokenId, from, to });
      return state;
    }

    case NFT_BURN: {
      const { tokenId, owner } = tx.data;
      burnNFT(state, { tokenId, owner });
      return state;
    }

    default:
      return state;
  }
}

// Export app singletons + helpers
module.exports = {
  blockchain,
  transactionPool,
  wallet,
  pubsub,
  miner,
  pool,
  savePool,
  shutdown,
  ready,
  applyExtendedTx // <— call this from your Blockchain reducer
};
