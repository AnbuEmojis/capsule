// backend/services/solana.js
const {Connection, Keypair, PublicKey, SystemProgram, Transaction, LAMPORTS_PER_SOL} = require('@solana/web3.js');

const CLUSTER = (process.env.SOLANA_CLUSTER || 'devnet').toLowerCase(); // 'devnet' | 'mainnet'
const DEFAULT_RPC = CLUSTER === 'mainnet'
  ? 'https://api.mainnet-beta.solana.com'
  : 'https://api.devnet.solana.com';

const RPC = process.env.SOLANA_RPC || DEFAULT_RPC;
const connection = new Connection(RPC, 'confirmed');

function loadTreasury() {
  const raw = process.env.SOL_TREASURY_SECRET_KEY || process.env.SOLANA_TREASURY_SECRET_KEY;
  if (!raw) throw new Error('Missing SOL_TREASURY_SECRET_KEY in .env');

  // Accept JSON array or comma-separated numbers
  const secretArr = raw.trim().startsWith('[')
    ? JSON.parse(raw)
    : raw.split(',').map(n => parseInt(n, 10));
  return Keypair.fromSecretKey(Uint8Array.from(secretArr));
}

async function sendSol({ toBase58, lamports }) {
  const treasury = loadTreasury();
  const toPubkey = new PublicKey(toBase58);

  const tx = new Transaction().add(SystemProgram.transfer({
    fromPubkey: treasury.publicKey,
    toPubkey,
    lamports: Math.floor(lamports)
  }));

  const sig = await connection.sendTransaction(tx, [treasury], { skipPreflight: false });
  await connection.confirmTransaction(sig, 'confirmed');
  return sig;
}

function solscanTxUrl(signature) {
  const suffix = CLUSTER === 'mainnet' ? '' : `?cluster=${CLUSTER}`;
  return `https://solscan.io/tx/${signature}${suffix}`;
}

module.exports = {
  connection,
  sendSol,
  solscanTxUrl,
  LAMPORTS_PER_SOL
};
