// cryptochain/config.js
// Keep this file pure: no imports from other project files.

const MINE_RATE = Number(process.env.MINE_RATE_MS || 1000);          // ms per block
const INITIAL_DIFFICULTY = Number(process.env.INITIAL_DIFFICULTY || 3);
const STARTING_BALANCE = Number(process.env.STARTING_BALANCE || 1000);

// Genesis block data
const GENESIS_DATA = {
  timestamp: 1,
  lastHash: '----',
  hash: 'hash-one',
  data: [],
  nonce: 0,
  difficulty: INITIAL_DIFFICULTY
};

// Mining reward config (used by reward transactions)
const MINING_REWARD = Number(process.env.MINING_REWARD || 50);
const REWARD_INPUT = { address: '*authorized-reward*' };

// Optional: swap fee basis points (0.30% default) for LP math
const SWAP_FEE_BPS = Number(process.env.SWAP_FEE_BPS || 30);

module.exports = {
  MINE_RATE,
  INITIAL_DIFFICULTY,
  GENESIS_DATA,
  STARTING_BALANCE,
  MINING_REWARD,
  REWARD_INPUT,
  SWAP_FEE_BPS
};
