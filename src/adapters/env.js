// Minimal EVM adapter placeholder. Real impl: use ethers v6 + WalletConnect
export async function connectEvm(){ /* connect metamask/walletconnect */ }
export async function stakeErc20({ tokenAddress, amount, stakingContract }){ /* approve + stake */ }
export async function claimRewards({ stakingContract }){ /* call claim */ }