const Transaction = require('./wallet/transaction'); // Add this if you're using createRewardTransaction()

const MINE_RATE = 1000; // ms
const INITIAL_DIFFICULTY = 24;
const INITIAL_TOKENS = 60000000;

const GENESIS_DATA = {
  timestamp: 1,
  lastHash: '_________',
  hash: 'hatch',
  difficulty: INITIAL_DIFFICULTY,
  nonce: 0,
  data: []
};

const STARTING_BALANCE = 0;

const MINING_REWARD = 50;

const REWARD_INPUT = {
  address: '*authorized-reward*'
};

// These two just subtract the MINING_REWARD, but that logic should be handled elsewhere
const TOKEN_REWARDS = MINING_REWARD; // Total tokens issued via mining rewards (so far)
const TOKEN_BALANCE = INITIAL_TOKENS - TOKEN_REWARDS; // Remaining tokens held by creator, or reserve

// Optional helper to create a reward transaction
const createRewardTransaction = (minerWallet) => {
  return Transaction.rewardTransaction({ minerWallet });
};

module.exports = {
  GENESIS_DATA,
  MINE_RATE,
  STARTING_BALANCE,
  REWARD_INPUT,
  MINING_REWARD,
  TOKEN_REWARDS,
  TOKEN_BALANCE,
  createRewardTransaction
};
