import { useEffect, useState } from 'react';

export default function NFTs(){
  const address = window.localStorage.getItem('walletAddress');
  const [nfts, setNfts] = useState([]);
  const [uri, setUri] = useState('');

  useEffect(() => { if(address) fetch('/api/nfts/my?address='+address).then(r=>r.json()).then(d=>setNfts(d.nfts||[])); }, [address]);

  const mint = async () => {
    const res = await fetch('/api/nfts/mint', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ ownerAddress: address, metadataURI: uri }) });
    const d = await res.json();
    if(d.ok){ setNfts(v=>[d.nft, ...v]); setUri(''); }
  };

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold mb-4">NFTs</h1>
      <div className="border rounded p-4 mb-6">
        <div className="font-semibold mb-2">Mint NFT</div>
        <input className="border p-2 w-full mb-2" placeholder="metadata URI (ipfs://...)" value={uri} onChange={e=>setUri(e.target.value)} />
        <button className="bg-black text-white px-4 py-2 rounded" onClick={mint}>Mint</button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {nfts.map(n => (
          <div key={n.tokenId} className="border rounded p-3">
            <div className="font-semibold">#{n.tokenId}</div>
            <div className="text-sm break-words">{n.metadataURI}</div>
            <div className="text-xs mt-1">Owner: {n.ownerAddress}</div>
          </div>
        ))}
      </div>
    </div>
  );
}