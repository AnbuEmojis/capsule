// cryptochain/modules/nft.js
// Minimal on-chain NFT registry in node state; metadata is off-chain (URI)

function mintNFT(state, { tokenId, ownerAddress, metadataURI }){
    if(state.nfts[tokenId]) throw new Error('NFT already exists');
    state.nfts[tokenId] = { ownerAddress, metadataURI };
    return state;
  }
  
  function transferNFT(state, { tokenId, from, to }){
    const nft = state.nfts[tokenId];
    if(!nft) throw new Error('NFT not found');
    if(nft.ownerAddress !== from) throw new Error('Not owner');
    nft.ownerAddress = to;
    return state;
  }
  
  function burnNFT(state, { tokenId, owner }){
    const nft = state.nfts[tokenId];
    if(!nft) throw new Error('NFT not found');
    if(nft.ownerAddress !== owner) throw new Error('Not owner');
    delete state.nfts[tokenId];
    return state;
  }
  
  module.exports = { mintNFT, transferNFT, burnNFT };