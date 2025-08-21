import { useState } from 'react';

export default function NFTBridge(){
  const [tokenId, setTokenId] = useState('');
  const [targetChain, setTargetChain] = useState('EVM');
  const address = window.localStorage.getItem('walletAddress');

  const lock = async () => {
    const res = await fetch('/api/bridge/nft/lock', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ tokenId, ownerAddress: address, targetChain }) });
    const d = await res.json();
    if(d.ok) alert('Bridge job created: '+d.jobId);
  };

  return (
    <div className="border rounded p-4">
      <div className="font-semibold mb-2">Bridge NFT (CAP → EVM)</div>
      <input className="border p-2 w-full mb-2" placeholder="Token ID" value={tokenId} onChange={e=>setTokenId(e.target.value)} />
      <select className="border p-2 w-full mb-2" value={targetChain} onChange={e=>setTargetChain(e.target.value)}>
        <option>EVM</option>
        <option>SOL</option>
      </select>
      <button className="bg-black text-white px-4 py-2 rounded" onClick={lock}>Start Bridge</button>
    </div>
  );
}