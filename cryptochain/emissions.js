// cryptochain/emissions.js
const EMISSION = {
    GENESIS_REWARD: Number(process.env.GENESIS_REWARD ?? 50),   // CAP per block
    HALVING_INTERVAL: Number(process.env.HALVING_INTERVAL ?? 210000),
    TAIL_REWARD: Number(process.env.TAIL_REWARD ?? 0.1)         // minimum reward
  };
  
  function blockSubsidy(height) {
    const halvings = Math.floor(height / EMISSION.HALVING_INTERVAL);
    const decayed = EMISSION.GENESIS_REWARD / Math.pow(2, halvings);
    return Math.max(decayed, EMISSION.TAIL_REWARD);
  }
  
  module.exports = { EMISSION, blockSubsidy };
  