// cryptochain/public/dashboard.js
document.addEventListener('DOMContentLoaded', async () => {
  // ===== Auth =====
  const token = localStorage.getItem('token');
  if (!token) return location.replace('/login.html?redirect=/dashboard.html');

  const authedFetch = async (url, opts = {}) => {
    const headers = new Headers(opts.headers || {});
    headers.set('Authorization', `Bearer ${localStorage.getItem('token') || ''}`);
    const res = await fetch(url, { ...opts, headers });
    if (res.status === 401) {
      localStorage.removeItem('token');
      const redirect = encodeURIComponent(location.pathname + location.search);
      location.replace(`/login.html?redirect=${redirect}`);
      return new Response(null, { status: 401 });
    }
    return res;
  };

  // ===== Elements =====
  const newWalletBtn      = document.getElementById('new-wallet-btn');
  const refreshWalletsBtn = document.getElementById('refresh-wallets-btn');
  const faucetBtn         = document.getElementById('faucet-btn');
  const walletSelect      = document.getElementById('walletSelect');
  const addressSpan       = document.getElementById('wallet-address');
  const capSpan           = document.getElementById('wallet-cap');
  const nativeSpan        = document.getElementById('wallet-native');
  const mineBtn           = document.getElementById('mine-btn');
  const mineResult        = document.getElementById('mine-result');

  const dirCapToNative = document.getElementById('dir-cap-to-native');
  const dirNativeToCap = document.getElementById('dir-native-to-cap');
  const amountLabel    = document.getElementById('amount-label');
  const amountInput    = document.getElementById('swap-amount');
  const feeInput       = document.getElementById('swap-fee');
  const swapBtn        = document.getElementById('swap-exec-btn');

  const sendToInput    = document.getElementById('send-to');
  const sendAmtInput   = document.getElementById('send-amount');
  const sendBtn        = document.getElementById('send-cap-btn');
  const sendStatus     = document.getElementById('send-status');

  const importKeyBtn   = document.getElementById('import-key-btn');
  const exportKeyBtn   = document.getElementById('export-key-btn');
  const keyStatus      = document.getElementById('key-status');

  // ===== State =====
  let currentWallet = null;
  let priceChart = null;

  // ===== Utils =====
  const shorten = (addr) => (addr ? addr.slice(0, 8) + '…' + addr.slice(-6) : '');

  function getPriv(addr) {
    try { return localStorage.getItem(`priv:${addr}`) || null; } catch { return null; }
  }
  function hasPriv(addr) { return !!getPriv(addr); }

  function refreshKeyStatus() {
    if (!keyStatus || !currentWallet) return;
    const hex = getPriv(currentWallet);
    const ok = !!hex;
    keyStatus.textContent = `Key: ${ok ? 'present' : 'missing'}${ok ? ` (${hex.length} chars)` : ''}`;
  }

// Helpers: hex/sha256
function bytesToHex(b) { return Array.from(b).map(x => x.toString(16).padStart(2, '0')).join(''); }
async function sha256Hex(msg) {
  const enc = new TextEncoder();
  const buf = await crypto.subtle.digest('SHA-256', enc.encode(msg));
  return bytesToHex(new Uint8Array(buf));
}

// --- utilities (place near top of your file, inside DOMContentLoaded scope) ---
function bytesToHex(b) { return Array.from(b).map(x => x.toString(16).padStart(2, '0')).join(''); }
async function sha256Hex(msg) {
  const enc = new TextEncoder();
  const buf = await crypto.subtle.digest('SHA-256', enc.encode(msg));
  return bytesToHex(new Uint8Array(buf));
}

// Dynamically import @noble/secp256k1 as an ES module (no npm, no local files).
// We pin to a well-known 1.x release that supports sign/getPublicKey.
let _secpMod = null;
async function ensureSecp() {
  if (_secpMod) return _secpMod;
  // Try esm.sh first, fallback to unpkg
  try {
    _secpMod = await import('https://esm.sh/@noble/secp256k1@1.7.1');
  } catch {
    _secpMod = await import('https://unpkg.com/@noble/secp256k1@1.7.1/dist/index.js');
  }
  return _secpMod;
}

// Your localStorage helpers should already exist; if not, include:
function getPriv(addr) {
  try { return localStorage.getItem(`priv:${addr}`) || null; } catch { return null; }
}
function hasPriv(addr) { return !!getPriv(addr); }

// REPLACE your previous signCapSpend with this Noble-based version
async function signCapSpend(address, amount, nonce) {
  const hexPriv = getPriv(address);
  if (!hexPriv) return null;

  const secp = await ensureSecp(); // { sign, getPublicKey, utils, etc. }
  if (!secp || !secp.sign || !secp.getPublicKey) {
    console.error('Failed to load @noble/secp256k1');
    return null;
  }

  // Message format must match the server verifier:
  // "<address>:<amount>:CAP:<nonce>"
  const hashHex = await sha256Hex(`${address}:${amount}:CAP:${nonce}`);

  // 64-byte raw signature [r||s] (der: false)
  const sigBytes = await secp.sign(hashHex, hexPriv, { der: false });
  const sigHex = typeof sigBytes === 'string' ? sigBytes : bytesToHex(sigBytes);
  const r = sigHex.slice(0, 64);
  const s = sigHex.slice(64, 128);

  // Uncompressed (65-byte) public key 0x04||X||Y, which matches your wallet format
  const pubBytes = secp.getPublicKey(hexPriv, false);
  const publicKey = bytesToHex(pubBytes);

  return { publicKey, signature: { r, s }, nonce };
}

// (Optional) warm up the module early so it’s cached by the time you click Send/Swap:
ensureSecp().catch(() => {});

// ESM libs used only when importing phrases
async function importBIP39Phrase() {
  const mnemonic = prompt('Paste 24-word mnemonic:')?.trim().toLowerCase();
  if (!mnemonic) return;
  const bip39 = await import('https://esm.sh/@scure/bip39@1.2.2');
  const english = (await import('https://esm.sh/@scure/bip39@1.2.2/wordlists/english')).wordlist;
  if (!bip39.validateMnemonic(mnemonic, english)) return alert('Invalid BIP-39');
  const { HDKey } = await import('https://esm.sh/@scure/bip32@1.3.1');
  const secp = await import('https://esm.sh/@noble/secp256k1@1.7.1');
  const seed = bip39.mnemonicToSeedSync(mnemonic);
  const hd = HDKey.fromMasterSeed(seed);
  const child = hd.derive("m/44'/7777'/0'/0/0");
  if (!child.privateKey) return alert('Derivation failed');
  const privHex = Array.from(child.privateKey).map(b => b.toString(16).padStart(2,'0')).join('');
  const pubHex = Array.from(secp.getPublicKey(child.privateKey, false)).map(b => b.toString(16).padStart(2,'0')).join('');
  // store and select
  try { localStorage.setItem(`priv:${pubHex}`, privHex); } catch {}
  // ensure in select
  const opt = document.createElement('option'); opt.value = pubHex; opt.textContent = pubHex.slice(0,8)+'…'+pubHex.slice(-6);
  document.getElementById('walletSelect')?.appendChild(opt);
  document.getElementById('walletSelect').value = pubHex;
  // trigger your existing selection handlers
  const evt = new Event('change'); document.getElementById('walletSelect').dispatchEvent(evt);
  alert('Imported. (24-word)');
}
async function import19Phrase() {
  const words19 = prompt('Paste 19-word paper code:')?.trim().toLowerCase();
  if (!words19) return;
  const { wordlist } = await import('https://esm.sh/@scure/bip39@1.2.2/wordlists/english');
  const { hmac } = await import('https://esm.sh/@noble/hashes@1.4.0/hmac');
  const { sha512 } = await import('https://esm.sh/@noble/hashes@1.4.0/sha512');
  const secp = await import('https://esm.sh/@noble/secp256k1@1.7.1');

  const words = words19.split(/\s+/);
  if (words.length!==19) return alert('Need exactly 19 words');
  const idxs = words.map(w=>{ const i = wordlist.indexOf(w); if (i<0) throw new Error(`Unknown word: ${w}`); return i; });
  let bits=[]; for (const i of idxs){ for(let b=10;b>=0;b--) bits.push((i>>b)&1); }
  const bytes209 = new Uint8Array(Math.ceil(209/8));
  for (let i=0;i<209;i++) if (bits[i]) bytes209[i>>3] |= 1<<(7-(i&7));
  const mac = hmac.create(sha512, new TextEncoder().encode('CENTRATECH/PAPER19-TO-PRIV'));
  mac.update(bytes209);
  let priv = mac.digest().slice(0,32);
  if (secp.utils.isValidPrivateKey(priv) === false) priv = Uint8Array.from(Array(32).fill(1));
  const toHex = (u8)=>Array.from(u8).map(b=>b.toString(16).padStart(2,'0')).join('');
  const privHex = toHex(priv);
  const pubHex  = toHex(secp.getPublicKey(priv, false));
  try { localStorage.setItem(`priv:${pubHex}`, privHex); } catch {}
  const opt = document.createElement('option'); opt.value = pubHex; opt.textContent = pubHex.slice(0,8)+'…'+pubHex.slice(-6);
  document.getElementById('walletSelect')?.appendChild(opt);
  document.getElementById('walletSelect').value = pubHex;
  document.getElementById('walletSelect').dispatchEvent(new Event('change'));
  alert('Imported. (19-word paper code)');
}
// hook buttons
document.getElementById('import-bip39-btn')?.addEventListener('click', importBIP39Phrase);
document.getElementById('import-19-btn')?.addEventListener('click', import19Phrase);


  async function getNextNonce(address) {
    try {
      const r = await authedFetch(`/api/token/nonce?address=${encodeURIComponent(address)}`);
      if (!r.ok) return null;
      const { nextNonce } = await r.json();
      return Number.isInteger(nextNonce) ? nextNonce : null;
    } catch { return null; }
  }

  // If server doesn’t return a wallet, use the saved local one
(function primeLocalWallet() {
  const addr = localStorage.getItem('cap_addr');
  if (addr) {
    const el = document.querySelector('#cap-address-display');
    if (el) el.textContent = addr.slice(0,8)+'…'+addr.slice(-6);
  }
})();

// ---------- helpers ----------
const fromHex = (h) => Uint8Array.from((h.match(/../g)||[]), b=>parseInt(b,16));

// Reuse from earlier:
/// setDerivedWallet({ privHex, pubHex });

async function decryptPrivFromEncBlob(encBlob, passphrase) {
  const enc = new TextEncoder();
  const salt = fromHex(encBlob.salt);
  const iv   = fromHex(encBlob.nonce);
  const ct   = fromHex(encBlob.ciphertext);

  const baseKey = await crypto.subtle.importKey('raw', enc.encode(passphrase), 'PBKDF2', false, ['deriveKey']);
  const aesKey = await crypto.subtle.deriveKey(
    { name:'PBKDF2', salt, iterations: encBlob.rounds || 150000, hash:'SHA-256' },
    baseKey, { name:'AES-GCM', length: 256 }, false, ['decrypt']
  );
  const ptBuf = await crypto.subtle.decrypt({ name:'AES-GCM', iv }, aesKey, ct);
  return new TextDecoder().decode(ptBuf); // privHex
}

// ---------- Load from account ----------
$('#btn-load-account')?.addEventListener('click', async () => {
  try {
    const token = localStorage.getItem('token') || '';
    if (!token) return alert('Sign in first on the Connect tab.');
    const pass = $('#backup-pass')?.value || '';
    if (!pass) return alert('Enter your passphrase to decrypt.');

    const r = await fetch('/api/profile/wallet', {
      headers: { 'Authorization': 'Bearer ' + token }
    });
    if (!r.ok) throw new Error('Fetch failed');
    const data = await r.json();
    if (!data?.enc) return alert('No encrypted backup found on your account.');

    const privHex = await decryptPrivFromEncBlob(data.enc, pass);

    // Recompute public from private
    const secp = window.nobleSecp256k1 || window.secp256k1;
    if (!secp) throw new Error('secp256k1 not loaded');
    const pubBytes = secp.getPublicKey(privHex, false); // 0x04…
    const pubHex = typeof pubBytes === 'string' ? pubBytes : Array.from(pubBytes).map(b=>b.toString(16).padStart(2,'0')).join('');

    await setDerivedWallet({ privHex, pubHex });
    alert('Loaded from account ✔');
  } catch (e) {
    alert('Load failed: ' + e.message);
  }
});

// ---------- Save as default (local only) ----------
$('#btn-save-default')?.addEventListener('click', async () => {
  const privHex = $('#current-priv-hex')?.value?.trim();
  const addr    = $('#current-cap-addr')?.value?.trim();
  if (!privHex || !addr) return alert('No wallet to save.');
  localStorage.setItem('cap_priv_hex', privHex);
  localStorage.setItem('cap_addr', addr);
  await renderCapQr(addr);
  alert('Saved as default on this device ✔');
});

// ---------- Load saved (local only) ----------
$('#btn-load-saved')?.addEventListener('click', async () => {
  const privHex = localStorage.getItem('cap_priv_hex') || '';
  const pubHex  = localStorage.getItem('cap_addr') || '';
  if (!privHex || !pubHex) return alert('No saved wallet on this device.');
  await setDerivedWallet({ privHex, pubHex });
  alert('Loaded saved wallet ✔');
});



  // ===== Wallets =====
  async function initializeWallets() {
    let wallets = [];
    try {
      const res = await authedFetch('/api/wallets');
      if (!res.ok) throw new Error('Could not load wallets');
      wallets = await res.json();
    } catch {
      const created = await createWallet();
      if (created) wallets = [created];
    }

    if (walletSelect) {
      walletSelect.innerHTML = '';
      wallets.forEach(addr => {
        const opt = document.createElement('option');
        opt.value = addr;
        opt.textContent = shorten(addr);
        walletSelect.appendChild(opt);
      });
    }

    if (!currentWallet && wallets.length) {
      currentWallet = wallets[0];
      if (walletSelect) walletSelect.value = currentWallet;
      await updateWalletInfo();
      refreshKeyStatus();
    }

    walletSelect?.addEventListener('change', async (e) => {
      currentWallet = e.target.value;
      await updateWalletInfo();
      refreshKeyStatus();
    });
  }

  async function createWallet() {
    try {
      const res = await authedFetch('/api/wallets/generate', { method: 'POST' });
      if (!res.ok) throw new Error('Creation failed');
      const { publicKey, privateKey } = await res.json();
      try { localStorage.setItem(`priv:${publicKey}`, privateKey); } catch {}
      return publicKey;
    } catch (err) { console.error('Failed to create wallet', err); return null; }
  }

  async function updateWalletInfo() {
    if (!currentWallet) return;
    try {
      const res = await authedFetch(`/api/wallets/info?address=${encodeURIComponent(currentWallet)}`);
      if (!res.ok) throw new Error('Failed to load wallet info');
      const { address, balance, capTokenBalance } = await res.json();
      if (addressSpan) addressSpan.textContent = shorten(address);
      if (nativeSpan)  nativeSpan.textContent  = Number(balance).toFixed(6);
      if (capSpan)     capSpan.textContent     = Number(capTokenBalance || 0).toFixed(2);
    } catch (err) { console.error(err); }
  }
  

  newWalletBtn?.addEventListener('click', async () => {
    try {
      const res = await authedFetch('/api/wallets/generate', { method: 'POST' });
      if (!res.ok) throw new Error('Creation failed');
      const { publicKey, privateKey } = await res.json();
      try { localStorage.setItem(`priv:${publicKey}`, privateKey); } catch {}
      if (walletSelect) {
        const opt = document.createElement('option');
        opt.value = publicKey;
        opt.textContent = shorten(publicKey);
        walletSelect.appendChild(opt);
        walletSelect.value = publicKey;
      }
      currentWallet = publicKey;
      await updateWalletInfo();
      refreshKeyStatus();
    } catch { alert('Failed to create wallet'); }
  });

  refreshWalletsBtn?.addEventListener('click', async () => {
    await initializeWallets();
    refreshKeyStatus();
  });

  // Import/Export key
  importKeyBtn?.addEventListener('click', () => {
    if (!currentWallet) return alert('Select a wallet first');
    const pasted = prompt('Paste hex private key for this wallet (64 hex chars, no 0x).');
    if (!pasted) return;
    const hex = pasted.trim().replace(/^0x/i, '');
    if (!/^[0-9a-fA-F]{64}$/.test(hex)) return alert('Not a valid 32-byte hex key');
    try { localStorage.setItem(`priv:${currentWallet}`, hex); alert('Key imported.'); refreshKeyStatus(); }
    catch { alert('Failed to save key'); }
  });

  exportKeyBtn?.addEventListener('click', () => {
    if (!currentWallet) return alert('Select a wallet first');
    const hex = getPriv(currentWallet);
    if (!hex) return alert('No private key stored for this wallet in this browser.');
    prompt('Private key (hex) — copy carefully:', hex);
  });

  // ===== Mining =====
  mineBtn?.addEventListener('click', async () => {
    try {
      const res = await authedFetch('/api/mine', { method: 'POST' });
      if (!res.ok) throw new Error('Mining failed');
      const info = await res.json().catch(() => ({}));
      if (mineResult) mineResult.textContent = `Mined at height ${info.height ?? '—'} • ${new Date().toLocaleTimeString()}`;
      await Promise.all([updateWalletInfo(), loadHistory(), renderChart(), loadExplorer(), refreshMining()]);
    } catch (e) { alert(e.message || 'Mining failed'); }
  });

  faucetBtn?.addEventListener('click', async () => {
    if (!currentWallet) return alert('Create/select a wallet first');
    try {
      const res = await authedFetch('/api/token/faucet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address: currentWallet, amount: 100 })
      });
      if (!res.ok) throw new Error('Faucet failed');
      alert('Queued 100 CAP. Mine to confirm.');
    } catch (e) { alert(e.message || 'Faucet failed'); }
  });

  // ===== Swap =====
  function refreshAmountLabel() {
    const isCapToNative = dirCapToNative?.checked;
    if (amountLabel) amountLabel.textContent = `Amount (${isCapToNative ? 'CAP' : 'NATIVE'})`;
  }
  dirCapToNative?.addEventListener('change', refreshAmountLabel);
  dirNativeToCap?.addEventListener('change', refreshAmountLabel);
  refreshAmountLabel();

  swapBtn?.addEventListener('click', async () => {
    const isCapToNative = dirCapToNative?.checked;
    const fromToken = isCapToNative ? 'CAP' : 'NATIVE';
    const toToken   = isCapToNative ? 'NATIVE' : 'CAP';

    const amount = parseFloat((amountInput?.value || '0'));
    if (!Number.isFinite(amount) || amount <= 0) return alert('Enter a valid amount');

    try {
      const q = await authedFetch(`/api/swaps/quote?fromToken=${encodeURIComponent(fromToken)}&toToken=${encodeURIComponent(toToken)}&amount=${encodeURIComponent(amount)}`);
      if (!q.ok) throw new Error('Quote failed');
      await q.json();
    } catch { return alert('Failed to get quote'); }

    try {
      const fee = Math.max(0, Number(feeInput?.value || 0) || 0);
      const payload = { fromToken, toToken, amountIn: amount, minAmountOut: 0, walletAddress: currentWallet, minerFee: fee };

      if (fromToken === 'CAP') {
        const nonce = await getNextNonce(currentWallet);
        if (nonce == null) return alert('Could not get nonce');

        if (!hasPriv(currentWallet)) {
          const ok = confirm('This wallet’s private key is not in this browser. Import it now?');
          if (ok) importKeyBtn?.click();
        }
        const sig = await signCapSpend(currentWallet, amount, nonce);
        if (!sig) throw new Error('Missing private key to sign');
        payload.tokenSig = sig;
      }

      const exRes = await authedFetch('/api/swaps/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!exRes.ok) {
        const err = await exRes.json().catch(() => ({}));
        throw new Error(err.message || `Swap failed (${exRes.status})`);
      }

      const toastOut = document.getElementById('toast-output');
      if (toastOut) toastOut.textContent = `${amount} ${fromToken} → ${toToken}`;
      const toastEl = document.getElementById('purchaseToast');
      if (toastEl && window.bootstrap) new bootstrap.Toast(toastEl).show();

      await Promise.all([updateWalletInfo(), loadHistory(), renderChart(), loadExplorer()]);
      refreshKeyStatus();
    } catch (e) {
      alert(e.message || 'Swap failed');
    }
  });

  // ===== Send CAP =====
  sendBtn?.addEventListener('click', async () => {
    if (!currentWallet) return alert('Select a wallet first');
    const to = (sendToInput?.value || '').trim();
    const amt = Number(sendAmtInput?.value || '0');
    if (!to || !/^0[0-9a-fA-F]+$/.test(to)) return alert('Enter a valid recipient address');
    if (!Number.isFinite(amt) || amt <= 0) return alert('Enter a valid CAP amount');

    try {
      const nonce = await getNextNonce(currentWallet);
      if (nonce == null) throw new Error('Could not get nonce');

      if (!hasPriv(currentWallet)) {
        const ok = confirm('This wallet’s private key is not in this browser. Import it now?');
        if (ok) importKeyBtn?.click();
      }
      const sig = await signCapSpend(currentWallet, amt, nonce);
      if (!sig) throw new Error('Missing private key to sign');

      const res = await authedFetch('/api/token/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fromAddress: currentWallet, toAddress: to, amount: amt, tokenSig: sig })
      });
      const j = await res.json().catch(()=> ({}));
      if (!res.ok) throw new Error(j.message || 'Send failed');

      if (sendStatus) sendStatus.textContent = `Queued ${j.queued}. Click Mine to confirm.`;
      await Promise.all([updateWalletInfo(), loadHistory(), loadExplorer()]);
    } catch (e) {
      if (sendStatus) sendStatus.textContent = e.message || 'Send failed';
      else alert(e.message || 'Send failed');
    }
  });

  // ===== History =====
  async function loadHistory() {
    const list = document.getElementById('history-list');
    if (!list) return;
    try {
      const res = await authedFetch('/api/transactions/history');
      if (!res.ok) throw new Error('History load failed');
      const rows = await res.json();
      const html = rows.map(r => `
        <li class="list-group-item d-flex justify-content-between align-items-center">
          <span>${r.type || 'swap'} • ${new Date(r.timestamp || Date.now()).toLocaleString()}</span>
          <span>${r.fromAmount ?? r.amountIn} ${r.from || r.fromToken} → ${r.toAmount ?? r.amountOut} ${r.to || r.toToken}</span>
        </li>
      `).join('');
      list.innerHTML = html || '<li class="list-group-item">No recent activity.</li>';
    } catch {
      list.innerHTML = '<li class="list-group-item">Failed to load history</li>';
    }
  }

  // ===== Optional Rate =====
  async function showCapRate() {
    try {
      const res = await authedFetch('/api/rates/cap?vs=CAD');
      if (!res.ok) return;
      const r = await res.json();
      const el = document.getElementById('cap-rate');
      if (el) {
        const cad = r.cap_fiat != null ? Number(r.cap_fiat).toLocaleString(undefined, { maximumFractionDigits: 6 }) : '—';
        el.textContent = `1 CAP ≈ ${Number(r.cap_native).toFixed(6)} NATIVE${cad !== '—' ? ` ≈ ${cad} CAD` : ''}`;
      }
    } catch {}
  }

  // ===== Mining panel =====
  async function refreshMining() {
    try {
      const s = await authedFetch('/api/mining/stats'); if (!s.ok) throw 0;
      const stats = await s.json();
      const el = document.getElementById('mining-stats');
      if (el) el.textContent =
        `height ${stats.height} • mempool ${stats.mempoolSize} • last ${stats.lastTimestamp ? new Date(stats.lastTimestamp).toLocaleTimeString() : '—'}`;

      const mp = await authedFetch('/api/mining/mempool'); if (!mp.ok) throw 0;
      const { items } = await mp.json();
      const list = document.getElementById('mempool-list');
      if (list) {
        list.innerHTML = items.map(x =>
          `<li class="list-group-item d-flex justify-content-between">
             <span>${x.type}${x.symbol ? ':'+x.symbol : ''} • ${x.id.slice(0,8)}…</span>
             <span>${Number(x.amountToWallet).toFixed(6)} (fee ${x.fee})</span>
           </li>`).join('') || '<li class="list-group-item">Empty</li>';
      }
    } catch {}
  }
  document.getElementById('refresh-mining')?.addEventListener('click', refreshMining);

  // ===== Chart =====
  async function renderChart() {
    try {
      const res = await authedFetch('/api/liquidity/reserves');
      if (!res.ok) throw new Error('Stats load failed');
      const stats = await res.json();

      const el = document.getElementById('price-chart');
      if (!el || typeof Chart === 'undefined') return;

      if (priceChart) { priceChart.destroy(); priceChart = null; }

      const p = Number(stats.price) || (stats.NATIVE && stats.CAP ? (stats.NATIVE / stats.CAP) : 1);

      priceChart = new Chart(el, {
        type: 'line',
        data: {
          labels: ['now-3', 'now-2', 'now-1', 'now'],
          datasets: [{ label: 'CAP/NATIVE price', data: [p*0.98, p*0.99, p, p*1.01] }]
        },
        options: { responsive: true, maintainAspectRatio: false }
      });
    } catch {
      const chartError = document.getElementById('chart-error');
      if (chartError) chartError.textContent = 'Failed to load stats';
    }
  }

  // ===== Explorer =====
  async function loadExplorer() {
    try {
      const [bs, ts] = await Promise.all([
        authedFetch('/api/explorer/blocks?limit=10'),
        authedFetch('/api/explorer/transfers?symbol=CAP&limit=20')
      ]);
      const blocks = bs.ok ? await bs.json() : [];
      const transfers = ts.ok ? await ts.json() : [];

      const head = document.getElementById('explorer-head');
      if (head) head.textContent = `height ${blocks[0]?.height ?? '—'} • ${new Date().toLocaleTimeString()}`;

      const bl = document.getElementById('blocks-list');
      if (bl) bl.innerHTML = (blocks.map(b =>
        `<li class="list-group-item d-flex justify-content-between">
           <span>#${b.height}</span><span>${new Date(b.timestamp).toLocaleTimeString()}</span>
           <span>${b.txCount} tx</span>
         </li>`).join('')) || '<li class="list-group-item">No blocks yet.</li>';

      const tl = document.getElementById('transfers-list');
      if (tl) tl.innerHTML = (transfers.map(t =>
        `<li class="list-group-item">
           <div><strong>${t.amount}</strong> CAP</div>
           <div class="small text-muted">${t.from.slice(0,8)}… → ${t.to.slice(0,8)}… • h${t.blockHeight} • ${new Date(t.timestamp).toLocaleTimeString()}</div>
         </li>`).join('')) || '<li class="list-group-item">No CAP transfers yet.</li>';
    } catch {}
  }
  document.getElementById('explorer-refresh')?.addEventListener('click', loadExplorer);

  async function wcapMint() {
    const amt = Number(document.getElementById('wcap-amt').value);
    const dest = document.getElementById('wcap-dest').value.trim();
    if (!(amt>0)) return document.getElementById('wcap-info').textContent = 'Enter CAP amount.';
    if (!/^[1-9A-HJ-NP-Za-km-z]{32,48}$/.test(dest)) return document.getElementById('wcap-info').textContent = 'Enter valid Solana address.';
  
    const fromCap = getCAPAddress();
    // (Optional) sign a CAP-spend intent here similar to swaps; for dev we just lock to BRIDGE_LOCK
  
    const r = await authedFetch('/api/bridge/solana/wcap/mint', {
      method:'POST',
      body: JSON.stringify({ toPubkey: dest, amountCap: amt, fromCapAddress: fromCap })
    });
    const j = await r.json();
    document.getElementById('wcap-info').textContent =
      r.ok ? `Locked on-chain: ${j.lockTx}\nMinted wCAP → ${dest}\nATA: ${j.ata}\nSig: ${j.mintSig}\nMint: ${j.wcapMint}`
          : `Failed: ${j.message||r.status}`;
  }
  document.getElementById('wcap-send').addEventListener('click', wcapMint);
  

  // ===== Kickoff =====
  await initializeWallets();
  await updateWalletInfo();
  refreshKeyStatus();
  loadHistory();
  renderChart();
  showCapRate();
  setInterval(showCapRate, 10000);
  loadExplorer();
  refreshMining();
});
