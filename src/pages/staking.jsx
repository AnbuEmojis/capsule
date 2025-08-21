import { useEffect, useState } from 'react';

export default function Staking(){
  const [pools, setPools] = useState([]);
  const [positions, setPositions] = useState([]);
  const [form, setForm] = useState({ poolSymbol:'CAP', amount:'' });
  const address = window.localStorage.getItem('walletAddress');

  useEffect(() => { fetch('/api/staking/pools').then(r=>r.json()).then(d=>setPools(d.pools||[])); }, []);
  useEffect(() => { if(address) fetch('/api/staking/positions?address='+address).then(r=>r.json()).then(d=>setPositions(d.positions||[])); }, [address]);

  const stake = async () => {
    const res = await fetch('/api/staking/stake', { method:'POST', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify({ ...form, address }) });
    const d = await res.json();
    if(d.ok){ alert('Staked!'); } else { alert(d.error||'Error'); }
  };

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold mb-4">Staking</h1>
      <div className="space-y-2 mb-6">
        {pools.map(p => (
          <div key={p.symbol} className="border rounded p-3">
            <div className="font-semibold">{p.displayName} ({p.symbol})</div>
            <div>APR: {(p.aprBps/100).toFixed(2)}%</div>
            <div>Total Staked: {p.totalStaked}</div>
          </div>
        ))}
      </div>

      <div className="border rounded p-4">
        <div className="font-semibold mb-2">Stake CAP</div>
        <div className="flex gap-2">
          <input className="border p-2 flex-1" placeholder="Amount" value={form.amount} onChange={e=>setForm(f=>({...f, amount: e.target.value}))} />
          <button className="bg-black text-white px-4 rounded" onClick={stake}>Stake</button>
        </div>
      </div>

      <h2 className="text-xl font-semibold mt-8 mb-2">Your Positions</h2>
      <pre className="text-sm bg-gray-50 p-3 rounded overflow-auto">{JSON.stringify(positions, null, 2)}</pre>
    </div>
  );
}