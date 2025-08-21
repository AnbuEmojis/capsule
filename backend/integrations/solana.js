// backend/integrations/solana.js
// Lazy, safe Solana helper. If @solana/web3.js isn't installed or custody
// isn't configured, callers get clear SOLANA_* errors instead of crashing.

let web3 = null;

function haveWeb3() {
  try { require.resolve('@solana/web3.js'); return true; }
  catch { return false; }
}

function getWeb3() {
  if (web3) return web3;
  if (!haveWeb3()) throw new Error('SOLANA_DISABLED: @solana/web3.js not installed');
  // eslint-disable-next-line global-require
  web3 = require('@solana/web3.js');
  return web3;
}

const SOLANA_ENDPOINT = process.env.SOLANA_RPC || 'https://api.devnet.solana.com';

// Parse custody secret from JSON array (Keypair.secretKey)
function getCustody() {
  const raw = process.env.SOL_CUSTODY_SECRET;
  if (!raw) return null;
  let arr;
  try { arr = JSON.parse(raw); } catch { return null; }
  if (!Array.isArray(arr)) return null;
  const { Keypair } = getWeb3();
  return Keypair.fromSecretKey(Uint8Array.from(arr));
}

// Enabled if library is present (you can also require custody here if you prefer)
function isEnabled() {
  try { return haveWeb3(); } catch { return false; }
}

async function getConnection() {
  const { Connection } = getWeb3();
  return new Connection(SOLANA_ENDPOINT, 'confirmed');
}

async function getBalanceSOL(pubkey) {
  const { PublicKey, LAMPORTS_PER_SOL } = getWeb3();
  const conn = await getConnection();
  const lamports = await conn.getBalance(new PublicKey(pubkey));
  return lamports / LAMPORTS_PER_SOL;
}

/** Send SOL from custody → user (devnet). Returns tx signature. */
async function sendSOL(toPubkey, solAmount) {
  const { PublicKey, SystemProgram, Transaction, sendAndConfirmTransaction, LAMPORTS_PER_SOL } = getWeb3();
  const custody = getCustody();
  if (!custody) throw new Error('SOLANA_CUSTODY_MISSING: set SOL_CUSTODY_SECRET env var');

  const conn = await getConnection();
  const to = new PublicKey(toPubkey);
  const tx = new Transaction().add(SystemProgram.transfer({
    fromPubkey: custody.publicKey,
    toPubkey: to,
    lamports: Math.round(Number(solAmount) * LAMPORTS_PER_SOL)
  }));
  const sig = await sendAndConfirmTransaction(conn, tx, [custody]);
  return sig;
}

module.exports = { isEnabled, getConnection, getBalanceSOL, sendSOL };
