// backend/integrations/solana_token.js
const {
  Connection, Keypair, LAMPORTS_PER_SOL, PublicKey,
  SystemProgram, Transaction, sendAndConfirmTransaction
} = require('@solana/web3.js');

const RPC = process.env.SOLANA_RPC || 'https://api.devnet.solana.com';
const connection = new Connection(RPC, 'confirmed');

function getCustodyKeypair() {
  const raw = process.env.SOL_CUSTODY_SECRET;
  if (!raw) throw new Error('SOL_CUSTODY_SECRET missing');
  const arr = JSON.parse(raw);
  const secret = Uint8Array.from(arr);
  return Keypair.fromSecretKey(secret);
}

function getCustodyPubkey() {
  return getCustodyKeypair().publicKey.toBase58();
}

async function getCustodyInfo() {
  const kp = getCustodyKeypair();
  const bal = await connection.getBalance(kp.publicKey);
  return { pubkey: kp.publicKey.toBase58(), sol: bal / LAMPORTS_PER_SOL };
}

async function sendSol(toPubkey, lamports) {
  const kp = getCustodyKeypair();
  const to = new PublicKey(toPubkey);
  const amt = Math.max(1, Math.floor(lamports)); // ensure ≥1 lamport
  const tx = new Transaction().add(
    SystemProgram.transfer({ fromPubkey: kp.publicKey, toPubkey: to, lamports: amt })
  );
  const sig = await sendAndConfirmTransaction(connection, tx, [kp]);
  return sig;
}

function wcapEnabled() {
  const mint = process.env.WCAP_MINT;
  return { enabled: !!mint, mint: mint || null };
}

// Mint wCAP to owner (if WCAP_MINT is configured and custody is mint authority)
async function mintWcapTo(toPubkey, amountCap, decimals = 9) {
  const mod = await import('@solana/spl-token');
  const { getAssociatedTokenAddress, createAssociatedTokenAccountInstruction, createMintToInstruction } = mod;

  const kp = getCustodyKeypair();
  const mintStr = process.env.WCAP_MINT;
  if (!mintStr) throw new Error('WCAP_MINT not set');

  const mint = new PublicKey(mintStr);
  const owner = new PublicKey(toPubkey);
  const ata = await getAssociatedTokenAddress(mint, owner);

  const ixs = [];
  const info = await connection.getAccountInfo(ata);
  if (!info) ixs.push(createAssociatedTokenAccountInstruction(kp.publicKey, ata, owner, mint));

  const qty = BigInt(Math.floor(Number(amountCap) * 10 ** decimals));
  ixs.push(createMintToInstruction(mint, ata, kp.publicKey, qty));

  const tx = new Transaction().add(...ixs);
  const sig = await sendAndConfirmTransaction(connection, tx, [kp]);
  return { ata: ata.toBase58(), sig };
}

// -------- NEW: read-only helpers --------
async function getSolBalance(pubkey) {
  const bal = await connection.getBalance(new PublicKey(pubkey));
  return { lamports: bal, sol: bal / LAMPORTS_PER_SOL };
}

async function getSplBalances(pubkey) {
  const owner = new PublicKey(pubkey);
  const resp = await connection.getParsedTokenAccountsByOwner(owner, { programId: new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA') });
  const items = resp.value.map(v => {
    const info = v.account.data.parsed.info;
    const amount = Number(info.tokenAmount.amount || '0');
    const decimals = Number(info.tokenAmount.decimals || 0);
    const uiAmount = Number(info.tokenAmount.uiAmount || 0);
    const mint = info.mint;
    return { mint, amount, decimals, uiAmount };
  });
  return { items };
}

module.exports = {
  connection,
  LAMPORTS_PER_SOL,
  getCustodyKeypair,
  getCustodyPubkey,
  getCustodyInfo,
  sendSol,
  wcapEnabled,
  mintWcapTo,
  getSolBalance,
  getSplBalances
};
