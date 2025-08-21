const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const { Connection, Keypair } = require('@solana/web3.js');
const { createMint, getOrCreateAssociatedTokenAccount, mintTo } = require('@solana/spl-token');

(async () => {
  const rpc = process.env.SOLANA_RPC || 'https://api.devnet.solana.com';
  const secret = process.env.SOL_CUSTODY_SECRET ? JSON.parse(process.env.SOL_CUSTODY_SECRET) : null;
  if (!secret) throw new Error('Set SOL_CUSTODY_SECRET in .env (JSON array)');

  const payer = Keypair.fromSecretKey(Uint8Array.from(secret));
  const conn = new Connection(rpc, 'confirmed');

  // Create SPL mint with 9 decimals; custody is mint+freeze authority
  const mintPubkey = await createMint(conn, payer, payer.publicKey, payer.publicKey, 9);
  console.log('WCAP_MINT', mintPubkey.toBase58());

  // Optional: mint 1 wCAP to custody to verify
  const ata = await getOrCreateAssociatedTokenAccount(conn, payer, mintPubkey, payer.publicKey);
  const sig = await mintTo(conn, payer, mintPubkey, ata.address, payer, BigInt(1_000_000_000)); // 1.000000000 wCAP
  console.log('Test mint 1 wCAP →', ata.address.toBase58(), 'sig', sig);
})();
