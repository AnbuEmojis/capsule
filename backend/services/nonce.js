// backend/services/nonce.js
function maxTokenNonce({ chain, mempoolMap = {}, publicKey, symbol = 'CAP' }) {
    let max = -1;
  
    // Scan blocks
    for (const block of chain) {
      if (!Array.isArray(block.data)) continue;
      for (const tx of block.data) {
        if (!tx || tx.type !== 'TOKEN' || tx.symbol !== symbol) continue;
        // We store nonce in input.nonce
        const from = tx.input?.address;
        const n = tx.input?.nonce;
        if (from === publicKey && Number.isInteger(n) && n > max) max = n;
      }
    }
  
    // Scan mempool (pending)
    for (const tx of Object.values(mempoolMap)) {
      if (!tx || tx.type !== 'TOKEN' || tx.symbol !== symbol) continue;
      const from = tx.input?.address;
      const n = tx.input?.nonce;
      if (from === publicKey && Number.isInteger(n) && n > max) max = n;
    }
  
    return max;
  }
  
  function nextTokenNonce(args) {
    return maxTokenNonce(args) + 1;
  }
  
  module.exports = { maxTokenNonce, nextTokenNonce };
  