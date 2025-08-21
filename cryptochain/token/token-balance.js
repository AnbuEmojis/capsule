// cryptochain/token/token-balance.js

// CAP (or any token symbol) from TOKEN entries
function calculateTokenBalance({ chain, address, symbol = 'CAP' }) {
  let bal = 0;
  for (const block of chain) {
    if (!Array.isArray(block.data)) continue;
    for (const ev of block.data) {
      if (!ev || ev.type !== 'TOKEN' || ev.symbol !== symbol) continue;

      // Preferred tx-shaped entry: outputMap { addr: +/-amount }
      if (ev.outputMap && typeof ev.outputMap === 'object') {
        if (typeof ev.outputMap[address] === 'number') {
          bal += Number(ev.outputMap[address]);
        }
        continue;
      }
      // Fallback event shape
      if (ev.recipient === address) bal += Number(ev.amount) || 0;
      if (ev.sender    === address) bal -= Number(ev.amount) || 0;
    }
  }
  return bal;
}

// NATIVE deltas that come specifically from swaps we encode as type:'NATIVE'
function calculateNativeSwapDelta({ chain, address }) {
  let bal = 0;
  for (const block of chain) {
    if (!Array.isArray(block.data)) continue;
    for (const ev of block.data) {
      if (!ev || ev.type !== 'NATIVE') continue;
      if (ev.outputMap && typeof ev.outputMap === 'object') {
        if (typeof ev.outputMap[address] === 'number') {
          bal += Number(ev.outputMap[address]);
        }
      }
    }
  }
  return bal;
}

module.exports = { calculateTokenBalance, calculateNativeSwapDelta };
