import { useState } from 'react';
import { connectEvm, stakeErc20 } from '../adapters/evm';

export default function StakeOtherCoins(){
  const [amount, setAmount] = useState('');
  const [connected, setConnected] = useState(false);

  const connect = async () => { await connectEvm(); setConnected(true); };
  const stake = async () => { await stakeErc20({ tokenAddress:'0x...', amount, stakingContract:'0x...' }); };

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold mb-4">Stake Other Coins</h1>
      <button className="bg-black text-white px-4 py-2 rounded mb-4" onClick={connect}>{connected?'Connected':'Connect EVM Wallet'}</button>
      <div className="border rounded p-4">
        <div className="font-semibold mb-2">Stake ERC‑20</div>
        <input className="border p-2 w-full mb-2" placeholder="Amount" value={amount} onChange={e=>setAmount(e.target.value)} />
        <button className="bg-black text-white px-4 py-2 rounded" onClick={stake}>Stake</button>
      </div>
    </div>
  );
}