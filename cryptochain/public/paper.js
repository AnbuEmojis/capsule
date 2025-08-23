/* ============================
   CAP Paper Wallet — front end
   ============================ */
   (() => {
    const $  = (sel, root = document) => root.querySelector(sel);
    const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  
    // -------- session / state --------
    const state = {
      rates: null,  // { NATIVE_USD, CAP_NATIVE, SOL_USD, SOL_NATIVE? ... }
      addrs: {
        cap: localStorage.getItem('cap_addr') || '',
        sol: localStorage.getItem('sol_addr') || ''
      },
      keys: {
        capPrivHex: localStorage.getItem('cap_priv_hex') || ''
      }
    };
  
    function getToken(){ return localStorage.getItem('token') || sessionStorage.getItem('token') || ''; }
    function authHeaders(h = {}){ const t = getToken(); return t ? { ...h, Authorization:`Bearer ${t}` } : h; }
  
    async function api(path, { method='GET', headers, body } = {}) {
      const opts = { method, headers: authHeaders(headers||{}) };
      if (body && !(body instanceof FormData)) {
        opts.headers['Content-Type'] = 'application/json';
        opts.body = JSON.stringify(body);
      } else if (body) { opts.body = body; }
  
      const res = await fetch(path, opts);
      if (!res.ok) {
        let err = await res.text().catch(()=>`${res.status}`);
        try { err = JSON.parse(err); } catch {}
        throw new Error(typeof err === 'string' ? err : (err.message || 'Request failed'));
      }
      const ct = res.headers.get('content-type') || '';
      return ct.includes('application/json') ? res.json() : res.text();
    }
  
    // -------- tiny toast --------
    function toast(msg, kind='info', ms=2600){
      const n = document.createElement('div');
      n.className = `toast-lite ${kind}`;
      n.textContent = msg;
      Object.assign(n.style, {
        position:'fixed', right:'16px', bottom:'16px', background: kind==='success'?'#16a34a':kind==='warning'?'#a16207':'#334155',
        color:'#fff', padding:'10px 12px', borderRadius:'10px', boxShadow:'0 10px 30px rgba(0,0,0,.25)', zIndex:9999
      });
      document.body.appendChild(n);
      setTimeout(()=>n.remove(), ms);
    }

    // ===== Google Drive backup (client-owned) =====
async function backupToGoogleDrive({ address, encPrivKeyBlob }) {
  // 1) Get an OAuth token for Drive (drive.file scope lets us create user-owned files we write)
  // Requires a Google OAuth Web Client ID (put it in window.GOOGLE_CLIENT_ID from server or inline)
  const token = await new Promise((resolve, reject) => {
    google.accounts.oauth2
      .initTokenClient({
        client_id: window.GOOGLE_CLIENT_ID,             // <-- set this
        scope: 'https://www.googleapis.com/auth/drive.file',
        callback: (r) => r && r.access_token ? resolve(r.access_token) : reject('no token')
      })
      .requestAccessToken();
  });

  // 2) Build metadata + media (encrypted JSON blob)
  const fileName = `cap-wallet-backup-${address.slice(0,10)}.capwallet.json`;
  const meta = { name: fileName, mimeType: 'application/json' };
  const boundary = '-------314159265358979323846';
  const body =
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n`+
    `${JSON.stringify(meta)}\r\n`+
    `--${boundary}\r\nContent-Type: application/json\r\n\r\n`+
    `${JSON.stringify(encPrivKeyBlob)}\r\n`+
    `--${boundary}--`;

  // 3) Upload to Drive
  const res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': `multipart/related; boundary=${boundary}` },
    body
  });
  if (!res.ok) throw new Error('drive_upload_failed');
  const json = await res.json();
  alert(`✅ Backup saved to your Google Drive as ${fileName}`);
  return json;
}

// Wire the button
document.getElementById('backupDriveBtn')?.addEventListener('click', async () => {
  try {
    // Use your existing encrypted key blob if you have it.
    // If you only have a plaintext privateKey, prompt for a passphrase and encrypt first.
    const address = window.currentCapAddress; // set this from your state
    if (!address) return alert('Set your CAP address first.');
    const pass = await promptForPassphrase(); // implement with your existing UI
    const encPrivKeyBlob = await encryptPrivKey({ privateKey: window.currentPrivateKey, passphrase: pass });
    await backupToGoogleDrive({ address, encPrivKeyBlob });
  } catch (e) {
    console.error(e); alert('Backup failed.');
  }
});

// Lightweight wordlist (replace with full BIP39 if you like)
const WORDS = ["alley","arrow","basket","cabin","dawn","ember","field","globe","harbor","ivory","jungle","kilo","lemon","meadow","nectar","oasis","piano","quartz","river","saddle","timber","ultra","vapor","willow","xenon","yellow","zephyr"];
function genPassphrase(n=12){ return Array.from({length:n},()=>WORDS[(Math.random()*WORDS.length)|0]).join(' '); }

let cachedPassphrase = null;
document.getElementById('genPassBtn')?.addEventListener('click', ()=>{
  cachedPassphrase = genPassphrase();
  document.getElementById('passOut').textContent = '••••••••••••••••';
});
document.getElementById('revealPassBtn')?.addEventListener('click', ()=>{
  if (!cachedPassphrase) return;
  const el = document.getElementById('passOut');
  el.textContent = (el.textContent.startsWith('•')) ? cachedPassphrase : '••••••••••••••••';
});

// Example encrypt helper using your existing scrypt/AES
async function encryptPrivKey({ privateKey, passphrase }) {
  // TODO: call your existing encryptor; placeholder:
  return { scheme:'passphrase', ciphertext: btoa(privateKey), salt: 'demo', iv:'demo', tag:'demo' };
}
async function promptForPassphrase(){
  if (cachedPassphrase) return cachedPassphrase;
  const p = prompt('Enter passphrase to encrypt your backup:');
  if (!p) throw new Error('passphrase_required'); return p;
}

document.getElementById('saveCurrencyBtn')?.addEventListener('click', async ()=>{
  const currency = document.getElementById('currencySelect').value; // you already have the control
  await fetch('/api/user/prefs/currency', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ currency }) });
  alert('✅ Currency saved');
});

const STRIPE_PK = window.STRIPE_PUBLISHABLE_KEY; // inject from server if needed

async function fiatInit(){
  await fetch('/api/fiat/init', { method:'POST' }); // assumes auth cookie/JWT
  await fiatRefresh();
}
async function fiatRefresh(){
  const r = await fetch('/api/fiat/balance'); const j = await r.json();
  document.getElementById('fiatBalance').textContent = `${(j.balanceCents/100).toFixed(2)} ${j.currency.toUpperCase()}`;
}
async function fiatDeposit(){
  const amount = prompt('Deposit amount (USD):', '10.00'); if (!amount) return;
  const amountCents = Math.round(parseFloat(amount)*100);
  const res = await fetch('/api/fiat/deposit-checkout', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ amountCents, currency:'usd' }) });
  const { url } = await res.json(); location.href = url; // redirect to Stripe Checkout
}
async function fiatWithdraw(){
  const amount = prompt('Withdraw amount (USD):', '5.00'); if (!amount) return;
  const amountCents = Math.round(parseFloat(amount)*100);
  const res = await fetch('/api/fiat/withdraw', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ amountCents }) });
  if (!res.ok) return alert('Withdraw failed');
  await fiatRefresh();
}

document.getElementById('fiatSetupBtn')?.addEventListener('click', fiatInit);
document.getElementById('fiatDepositBtn')?.addEventListener('click', fiatDeposit);
document.getElementById('fiatWithdrawBtn')?.addEventListener('click', fiatWithdraw);

// On page load, reflect Checkout result and refresh balance
(() => {
  const q = new URLSearchParams(location.search);
  if (q.get('fiat') === 'success') { fiatRefresh(); }
})();
  

    // -------- presence + header email --------
    async function refreshProfileCache(){
      const t = getToken(); if (!t) return null;
      try {
        const me = await api('/api/profile/me');
        if (me?.email) localStorage.setItem('session_email', me.email);
        // adopt stored defaults if local is empty
        const cap = me?.addresses?.capDefault || me?.addresses?.cap || me?.capAddress || '';
        const sol = me?.addresses?.solDefault || me?.addresses?.sol || me?.solAddress || '';
        if (cap && !state.addrs.cap) { state.addrs.cap = cap; localStorage.setItem('cap_addr', cap); }
        if (sol && !state.addrs.sol) { state.addrs.sol = sol; localStorage.setItem('sol_addr', sol); }
        return me;
      } catch { return null; }
    }
    function setConnUI(){
      const online = !!getToken();
      $$('#conn-status').forEach(b=>{
        b.textContent = online ? 'online' : 'offline';
        b.className   = `badge ${online?'bg-success':'bg-secondary'}`;
      });
      const email = localStorage.getItem('session_email') || '(session)';
      $$('#session-email').forEach(e => e.textContent = online ? `Logged in as ${email}` : 'Not signed in');
    }
  
    // -------- prices / quotes --------
    async function fetchRates(){
      try {
        const r = await api('/api/prices/latest');
        state.rates = r;
        return r;
      } catch {
        state.rates = state.rates || { NATIVE_USD: 1.00, CAP_NATIVE: 0.01, SOL_USD: 150 };
        return state.rates;
      }
    }
    function localQuote({ mode, amount }){
      const fx = state.rates || {};
      const f6 = (n)=>Number(n).toFixed(6);
      if (!fx.NATIVE_USD) return { ok:false, message:'Rates unavailable' };
  
      if (mode==='native2cap'){ const cap = amount/(fx.CAP_NATIVE||0.01); return { ok:true, route:['NATIVE','CAP'], amountOut:+f6(cap) }; }
      if (mode==='cap2native'){ const nat = amount*(fx.CAP_NATIVE||0.01); return { ok:true, route:['CAP','NATIVE'], amountOut:+f6(nat) }; }
      if (mode==='cap2sol'){
        const nat = amount*(fx.CAP_NATIVE||0.01);
        const sol = fx.SOL_NATIVE ? (nat/fx.SOL_NATIVE) : ((nat*fx.NATIVE_USD)/(fx.SOL_USD||150));
        return { ok:true, route:['CAP','NATIVE','SOL'], amountOut:+f6(sol) };
      }
      return { ok:false, message:'Unsupported mode' };
    }
    async function getQuoteOnline({ mode, amount }){
      try {
        const map = { native2cap:['NATIVE','CAP'], cap2native:['CAP','NATIVE'], cap2sol:['CAP','SOL'] };
        const [fromToken,toToken] = map[mode] || [];
        if (fromToken) {
          const q = await api(`/api/swaps/quote?fromToken=${fromToken}&toToken=${toToken}&amount=${encodeURIComponent(amount)}`);
          if (q?.amountOut != null) return { ok:true, route:[fromToken,toToken], amountOut:q.amountOut };
        }
      } catch {}
      return localQuote({ mode, amount });
    }
  
    // -------- balances (server best-effort) --------
    async function getCapBalance(capAddr){
      if (!capAddr) return { capTokens:0, native:0 };
      const tryJSON = async url => { const r = await fetch(url,{headers:authHeaders()}); if (!r.ok) throw 0; return r.json(); };
      try {
        const j = await tryJSON(`/api/wallets/info?address=${encodeURIComponent(capAddr)}`);
        return { capTokens: j.capTokenBalance ?? j.cap ?? 0, native: j.balance ?? j.native ?? 0 };
      } catch {}
      try {
        const j = await tryJSON(`/api/wallets/info?address=${encodeURIComponent(capAddr)}`);
        return { capTokens: j.capTokenBalance ?? j.cap ?? 0, native: j.balance ?? j.native ?? 0 };
      } catch {}
      return { capTokens:0, native:0 };
    }
    async function getSolBalance(solPubkey){
      if (!solPubkey) return { sol:0, wcap:0 };
      const tryJSON = async url => { const r = await fetch(url,{headers:authHeaders()}); if (!r.ok) throw 0; return r.json(); };
      try { return await tryJSON(`/api/bridge/solana/balances?pubkey=${encodeURIComponent(solPubkey)}`); } catch {}
      try { return await tryJSON(`/api/solana/balances?pubkey=${encodeURIComponent(solPubkey)}`); } catch {}
      return { sol:0, wcap:0 };
    }
  
    // -------- portfolio UI --------
    function renderPortfolioRows(items){
      const body = $('#pf-list'); body.innerHTML = '';
      const fmt = n => Number(n).toLocaleString(undefined,{maximumFractionDigits:6});
      items.forEach(it=>{
        const row = document.createElement('div');
        row.className = 'table-r';
        row.innerHTML = `
          <div class="d-flex align-items-center gap-2">
            <span class="badge ${it.symbol==='CAP'?'text-bg-dark':(it.symbol==='SOL'?'text-bg-info':'text-bg-secondary')}">${it.symbol}</span>
            <span>${it.name}</span>
          </div>
          <div class="ta-r">${fmt(it.balance)}</div>
          <div class="ta-r">${fmt(it.valueUsd)}</div>`;
        body.appendChild(row);
      });
    }
  
    async function refreshPortfolio(){
      const spinner = document.querySelector('#pf-refreshing');
      if (spinner) spinner.style.display = 'inline-block';
    
      try{
        await fetchRates();
        const capAddr = (document.querySelector('#bal-cap-addr')?.value || state.addrs.cap || '').trim();
        const solAddr = (document.querySelector('#bal-sol-addr')?.value || state.addrs.sol || '').trim();
    
        const [capB, solB] = await Promise.all([ getCapBalance(capAddr), getSolBalance(solAddr) ]);
        const fx = state.rates || {};
    
        const capInNative = (capB.capTokens || 0) * (fx.CAP_NATIVE || 0.01);
        const capUsd      = capInNative * (fx.NATIVE_USD || 1);
        const nativeUsd   = (capB.native   || 0) * (fx.NATIVE_USD || 1);
        const solUsd      = (solB.sol      || 0) * (fx.SOL_USD    || 150);
        const wcapUsd     = (solB.wcap     || 0) * (fx.CAP_NATIVE || 0.01) * (fx.NATIVE_USD || 1);
    
        const items = [
          { symbol:'CAP',    name:'CAP on CAP chain',         balance:capB.capTokens||0, valueUsd:capUsd },
          { symbol:'NATIVE', name:'Native coin on CAP chain', balance:capB.native||0,    valueUsd:nativeUsd },
          { symbol:'SOL',    name:'Solana (devnet)',          balance:solB.sol||0,       valueUsd:solUsd },
          { symbol:'wCAP',   name:'Wrapped CAP (devnet)',     balance:solB.wcap||0,      valueUsd:wcapUsd },
        ];
    
        // render rows
        const body = document.querySelector('#pf-list');
        if (body) {
          body.innerHTML = '';
          const fmt = n => Number(n).toLocaleString(undefined,{ maximumFractionDigits: 6 });
          for (const it of items) {
            const row = document.createElement('div');
            row.className = 'table-r';
            row.innerHTML = `
              <div class="d-flex align-items-center gap-2">
                <span class="badge ${it.symbol==='CAP'?'text-bg-dark':(it.symbol==='SOL'?'text-bg-info':'text-bg-secondary')}">${it.symbol}</span>
                <span>${it.name}</span>
              </div>
              <div class="ta-r">${fmt(it.balance)}</div>
              <div class="ta-r">${fmt(it.valueUsd)}</div>`;
            body.appendChild(row);
          }
        }
    
        // totals
        const totalUsd    = items.reduce((s,x)=>s+(x.valueUsd||0),0);
        const totalNative = (capB.native||0) + capInNative + ((solB.wcap||0)*(fx.CAP_NATIVE||0.01));
    
        const usdEl = document.querySelector('#pf-total-usd');
        const natEl = document.querySelector('#pf-total-native');
        if (usdEl) usdEl.textContent = totalUsd.toLocaleString(undefined,{maximumFractionDigits:2});
        if (natEl) natEl.textContent = totalNative.toLocaleString(undefined,{maximumFractionDigits:6});
    
        // mirror mini balances (if present)
        const setTxt = (sel, v)=>{ const el = document.querySelector(sel); if (el) el.textContent = v.toLocaleString(); };
        setTxt('#bal-cap-cap', capB.capTokens||0);
        setTxt('#bal-cap-native', capB.native||0);
        setTxt('#bal-sol-sol', solB.sol||0);
        setTxt('#bal-sol-wcap', solB.wcap||0);
      } catch (e) {
        console.error(e);
        toast('Portfolio refresh failed', 'warning');
      } finally {
        if (spinner) spinner.style.display = 'none';
      }
    }
    
  
    // -------- Connect tab --------
    async function saveCapAddress(){
      const v = $('#cap-addr-input').value.trim();
      if (!/^04[a-fA-F0-9]{128}$/.test(v)) return toast('Use full uncompressed CAP pubkey (04…130 chars)','warning');
      state.addrs.cap = v; localStorage.setItem('cap_addr', v);
      try { await api('/api/profile/addresses',{ method:'POST', body:{ cap:v, setDefault:true }}); } catch {}
      toast('CAP address saved','success');
    }
    async function saveSolAddress(){
      const v = $('#sol-addr-input').value.trim();
      if (!v) return toast('Paste Solana pubkey (devnet)','warning');
      state.addrs.sol = v; localStorage.setItem('sol_addr', v);
      try { await api('/api/profile/addresses',{ method:'POST', body:{ sol:v, setDefault:true }}); } catch {}
      toast('SOL address saved','success');
    }
    function useSavedAddresses(){
      if (state.addrs.cap) $('#bal-cap-addr').value = state.addrs.cap;
      if (state.addrs.sol) $('#bal-sol-addr').value = state.addrs.sol;
    }
  
    // -------- Hub: Buy / Sell / Swap / Transfer --------
    function switchPanel(which){
      const map = { buy:'#panel-buy', sell:'#panel-sell', swap:'#panel-swap', xfer:'#panel-xfer', search:'#panel-search' };
      Object.values(map).forEach(sel => $(sel)?.classList.add('d-none'));
      $(map[which])?.classList.remove('d-none');
      $$('#hub .btn-group .btn').forEach(b=>b.classList.remove('active'));
      ({buy:'#act-buy',sell:'#act-sell',swap:'#act-swap',xfer:'#act-xfer',search:'#act-search'});
      const id = {buy:'#act-buy',sell:'#act-sell',swap:'#act-swap',xfer:'#act-xfer',search:'#act-search'}[which];
      $(id)?.classList.add('active');
    }
  
    // BUY (NATIVE -> CAP)
    $('#buy-quote')?.addEventListener('click', async ()=>{
      await fetchRates();
      const amt = Number($('#buy-native').value||0); if (amt<=0) return;
      const q = await getQuoteOnline({ mode:'native2cap', amount:amt });
      if (!q.ok) return toast('Quote failed','warning');
      $('#buy-cap-out').value = q.amountOut;
      $('#buy-quote-info').textContent = `Route: ${q.route?.join(' → ') || 'NATIVE → CAP'}`;
    });
    $('#buy-exec')?.addEventListener('click', async ()=>{
      try{
        const amountIn = Number($('#buy-native').value||0);
        const toCap    = ($('#buy-dst-cap').value||'').trim();
        if (!(amountIn>0) || !toCap) return toast('Amount + destination required','warning');
        const r = await api('/api/swaps/execute',{ method:'POST', body:{ fromToken:'NATIVE', toToken:'CAP', amountIn, autoTax:true } });
        toast(`Bought ~${Number(r.amountOut||0).toFixed(6)} CAP • Penny ${Number(r.pennyApplied||0).toFixed(6)}`,'success');
        refreshPortfolio();
      }catch(e){ toast('Buy failed (server route not mounted?)','warning'); }
    });
  
    // SELL (CAP -> NATIVE)
    $('#sell-quote')?.addEventListener('click', async ()=>{
      await fetchRates();
      const amt = Number($('#sell-cap').value||0); if (amt<=0) return;
      const q = await getQuoteOnline({ mode:'cap2native', amount:amt });
      if (!q.ok) return toast('Quote failed','warning');
      $('#sell-native-out').value = q.amountOut;
      $('#sell-quote-info').textContent = `Route: ${q.route?.join(' → ') || 'CAP → NATIVE'}`;
    });
    $('#sell-exec')?.addEventListener('click', async ()=>{
      try{
        const amountIn = Number($('#sell-cap').value||0);
        const fromCap  = ($('#sell-src-cap').value||'').trim();
        if (!(amountIn>0) || !fromCap) return toast('Amount + source CAP address required','warning');
        const r = await api('/api/swaps/execute',{ method:'POST', body:{ fromToken:'CAP', toToken:'NATIVE', amountIn, autoTax:true } });
        toast(`Sold ~${Number(amountIn).toFixed(6)} CAP • Penny ${Number(r.pennyApplied||0).toFixed(6)}`,'success');
        refreshPortfolio();
      }catch(e){ toast('Sell failed','warning'); }
    });
  
    // SWAP (CAP -> SOL via bridge)
    $('#swap-quote')?.addEventListener('click', async ()=>{
      await fetchRates();
      const amt = Number($('#swap-cap').value||0); if (amt<=0) return;
      const q = await getQuoteOnline({ mode:'cap2sol', amount:amt });
      if (!q.ok) return toast('Quote failed','warning');
      $('#swap-quote-info').textContent = `CAP → SOL ≈ ${q.amountOut} (route: ${q.route?.join(' → ') || 'CAP → NATIVE → SOL'})`;
    });
    $('#swap-exec')?.addEventListener('click', async ()=>{
      try{
        const fromCap = ($('#swap-src-cap').value||'').trim();
        const toSol   = ($('#swap-dst-sol').value||'').trim();
        const amount  = Number($('#swap-cap').value||0);
        if (!fromCap || !toSol || !(amount>0)) return toast('Fill CAP source, SOL destination, and amount','warning');
        const r = await api('/api/bridge/cap2sol/execute',{ method:'POST', body:{ fromCapAddress:fromCap, toPubkey:toSol, amountCap:amount, privateKey: state.keys.capPrivHex || null }});
        toast('Swap executed (check Phantom devnet)','success');
        refreshPortfolio();
      }catch(e){ toast('Swap failed – check bridge exports (getCustodyPubkey etc.)','warning'); }
    });
  
    // Transfer CAP (on-chain)
    $('#xfer-cap-send')?.addEventListener('click', async ()=>{
      const from = ($('#xfer-cap-from').value||'').trim();
      const to   = ($('#xfer-cap-to').value||'').trim();
      const amt  = Number($('#xfer-cap-amt').value||0);
      const fee  = Number($('#xfer-cap-fee').value||0.02);
      if (!from || !to || !(amt>0)) return toast('Fill from/to/amount','warning');
      if (!state.keys.capPrivHex) return toast('Import/generate your CAP private key first (Settings)','warning');
      try{
        await api('/api/transfers/send',{ method:'POST', body:{ asset:'CAP', fromAddress:from, toAddress:to, amount:amt, minerFee:fee, privateKey:state.keys.capPrivHex }});
        toast('CAP sent','success'); refreshPortfolio();
      }catch{ toast('CAP send failed','warning'); }
    });
  
    // SOL devnet helper (airdrop)
    $('#xfer-sol-airdrop')?.addEventListener('click', async ()=>{
      const to = ($('#xfer-sol-to').value||'').trim() || state.addrs.sol;
      const amt = Number($('#xfer-sol-amt').value||0.25);
      if (!to) return toast('Enter Solana pubkey','warning');
      try{ await api(`/api/bridge/solana/airdrop?pubkey=${encodeURIComponent(to)}&amount=${encodeURIComponent(amt)}`); toast('Airdrop requested','success'); refreshPortfolio(); }
      catch{ toast('Airdrop failed','warning'); }
    });
  
    // -------- Settings: local encrypt/decrypt backup --------
    $('#sec-encrypt-download')?.addEventListener('click', async ()=>{
      if (!state.keys.capPrivHex) return toast('No CAP private key found','warning');
      const pass = $('#sec-pass').value, pass2 = $('#sec-pass2').value;
      if (!pass || pass!==pass2) return toast('Passphrases do not match','warning');
      const enc = await aesEncryptHex(state.keys.capPrivHex, pass);
      const blob = new Blob([JSON.stringify(enc,null,2)],{type:'application/json'});
      const url = URL.createObjectURL(blob); const a = document.createElement('a');
      a.href = url; a.download = 'cap-wallet.backup.json'; a.click(); URL.revokeObjectURL(url);
      toast('Encrypted backup downloaded','success');
    });
    $('#sec-upload')?.addEventListener('change', async (e)=>{
      const f = e.target.files?.[0]; if (!f) return;
      const pass = prompt('Enter passphrase to decrypt your backup:') || ''; if (!pass) return;
      try{
        const obj = JSON.parse(await f.text());
        const hex = await aesDecryptHex(obj, pass);
        state.keys.capPrivHex = hex; localStorage.setItem('cap_priv_hex', hex);
        $('#sec-status').textContent = 'Private key restored to this browser.';
        toast('Backup decrypted','success');
      }catch{ toast('Decryption failed','warning'); }
    });
  
    // WebCrypto helpers
    const toB64   = b => btoa(String.fromCharCode(...b));
    const fromB64 = s => new Uint8Array([...atob(s)].map(c=>c.charCodeAt(0)));
    const hexToBytes = h => new Uint8Array(h.match(/.{1,2}/g).map(b=>parseInt(b,16)));
    const bytesToHex = b => [...b].map(x=>x.toString(16).padStart(2,'0')).join('');
    async function deriveKey(pass, salt){
      const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(pass), 'PBKDF2', false, ['deriveKey']);
      return crypto.subtle.deriveKey({ name:'PBKDF2', salt, iterations:150_000, hash:'SHA-256' }, base, { name:'AES-GCM', length:256 }, false, ['encrypt','decrypt']);
    }
    async function aesEncryptHex(hex, pass){
      const salt = crypto.getRandomValues(new Uint8Array(16));
      const iv   = crypto.getRandomValues(new Uint8Array(12));
      const key  = await deriveKey(pass, salt);
      const ct   = await crypto.subtle.encrypt({ name:'AES-GCM', iv }, key, hexToBytes(hex));
      return { kdf:'PBKDF2', alg:'AES-GCM', salt:toB64(salt), iv:toB64(iv), ct:toB64(new Uint8Array(ct)) };
    }
    async function aesDecryptHex(obj, pass){
      const key = await deriveKey(pass, fromB64(obj.salt));
      const pt  = await crypto.subtle.decrypt({ name:'AES-GCM', iv:fromB64(obj.iv) }, key, fromB64(obj.ct));
      return bytesToHex(new Uint8Array(pt));
    }
  
    // -------- wiring + first load --------
    function wireConnectTab(){
      $('#btn-google')?.addEventListener('click', ()=> window.location.href='/api/oauth/google');
      $('#btn-github')?.addEventListener('click', ()=> window.location.href='/api/oauth/github');
      $('#btn-copy-token')?.addEventListener('click', async ()=> { const t=getToken(); if (!t) return; await navigator.clipboard.writeText(t); toast('Token copied','success'); });
      $('#btn-signout')?.addEventListener('click', ()=>{ localStorage.removeItem('token'); sessionStorage.removeItem('token'); setConnUI(); });
  
      $('#btn-save-cap')?.addEventListener('click', saveCapAddress);
      $('#btn-save-sol')?.addEventListener('click', saveSolAddress);
    }
    function wirePortfolio(){
      $('#pf-use-saved')?.addEventListener('click', useSavedAddresses);
      $('#pf-refresh')?.addEventListener('click', refreshPortfolio);
      $('#bal-refresh-cap')?.addEventListener('click', refreshPortfolio);
      $('#bal-refresh-sol')?.addEventListener('click', refreshPortfolio);
    }
  
    (async function init(){
      setConnUI(); await refreshProfileCache(); setConnUI();
      wireConnectTab(); wirePortfolio();
      useSavedAddresses();
      refreshPortfolio().catch(()=>{});
    })();
  })();
  
// ====== CAP Wallet – Settings Enhancements (Fiat / Rewards / Backup) ======
(function(){
  const $ = (id)=>document.getElementById(id);

  // -------- Passphrase (generate/reveal) --------
  const WORDS = ["alley","arrow","basket","cabin","dawn","ember","field","globe","harbor","ivory","jungle","kilo","lemon","meadow","nectar","oasis","piano","quartz","river","saddle","timber","ultra","vapor","willow","xenon","yellow","zephyr"];
  function genPass(n=12){ return Array.from({length:n},()=>WORDS[(Math.random()*WORDS.length)|0]).join(' '); }
  let _pass = null;
  window.capGenPass = function(){ _pass = genPass(); const out=$('passOut'); if(out) out.textContent='••••••••••••••'; };
  window.capRevealPass = function(){ const out=$('passOut'); if(!_pass||!out) return; out.textContent = out.textContent.startsWith('•') ? _pass : '••••••••••••••'; };

  // Placeholder: plug your real AES/scrypt here
  async function encryptPrivKey({ privateKey, passphrase }){ return { scheme:'passphrase', ciphertext: btoa(privateKey), salt:'demo', iv:'demo', tag:'demo' }; }
  async function promptPass(){ if(_pass) return _pass; const p = prompt('Enter passphrase to encrypt your backup:'); if(!p) throw new Error('passphrase_required'); return p; }

  // -------- Google Drive backup --------
  window.capBackupToDrive = async function({ address, privateKey }){
    if (!window.GOOGLE_CLIENT_ID) return alert('Missing GOOGLE_CLIENT_ID');
    const token = await new Promise((resolve,reject)=>{
      google.accounts.oauth2.initTokenClient({
        client_id: window.GOOGLE_CLIENT_ID,
        scope: 'https://www.googleapis.com/auth/drive.file',
        callback: r => r?.access_token ? resolve(r.access_token) : reject('no_token')
      }).requestAccessToken();
    });
    const pass = await promptPass();
    const enc = await encryptPrivKey({ privateKey, passphrase: pass });
    const name = `cap-wallet-backup-${(address||'addr').slice(0,10)}.capwallet.json`;
    const boundary = '-------314159265358979323846';
    const meta = { name, mimeType:'application/json' };
    const body =
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n`+
      `${JSON.stringify(meta)}\r\n`+
      `--${boundary}\r\nContent-Type: application/json\r\n\r\n`+
      `${JSON.stringify(enc)}\r\n`+
      `--${boundary}--`;
    const res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
      method:'POST',
      headers:{ Authorization:`Bearer ${token}`, 'Content-Type':`multipart/related; boundary=${boundary}` },
      body
    });
    if(!res.ok) throw new Error('drive_upload_failed');
    alert('✅ Backup saved to your Google Drive');
  };

  // -------- Fiat wallet --------
  function userId(){ return window.USER_ID || localStorage.getItem('USER_ID') || null; }
  window.fiatInit = async function(){
    const r = await fetch('/api/fiat/init',{ method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ userId: userId() }) });
    if(!r.ok) return alert('Fiat setup failed'); alert('✅ Fiat wallet ready'); fiatRefresh();
  };
  window.fiatRefresh = async function(){
    const r = await fetch('/api/fiat/balance?userId='+encodeURIComponent(userId()||'')); if(!r.ok) return;
    const j = await r.json(); const el=$('fiatBalance'); if(el) el.textContent = `${(j.balanceCents/100).toFixed(2)} ${j.currency}`;
  };
  window.fiatDeposit = async function(){
    const amount = prompt('Deposit amount (USD):','10.00'); if(!amount) return;
    const r = await fetch('/api/fiat/deposit-checkout',{ method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ amountCents: Math.round(parseFloat(amount)*100), currency:'usd', userId: userId() }) });
    let j=null; try{ j=await r.json(); }catch(e){}
    if(!r.ok || !j?.url) return alert('Could not start Stripe Checkout');
    location.assign(j.url);
  };
  window.fiatWithdraw = async function(){
    const amount = prompt('Withdraw amount (USD):','5.00'); if(!amount) return;
    const r = await fetch('/api/fiat/withdraw',{ method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ amountCents: Math.round(parseFloat(amount)*100), userId: userId() }) });
    if(!r.ok) return alert('Withdraw failed'); fiatRefresh();
  };
  // success bounce
  (()=>{
    const q = new URLSearchParams(location.search);
    if (q.get('fiat') === 'success') fiatRefresh();
  })();

  // -------- User prefs: currency --------
  window.saveCurrency = async function(){
    const sel = document.querySelector('[data-cap-currency]'); if(!sel) return alert('Currency selector not found');
    await fetch('/api/user/prefs/currency',{ method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ userId: userId(), currency: sel.value }) });
    alert('✅ Currency saved');
  };

  // -------- Rewards --------
  window.rwRefresh = async function(){
    const r = await fetch('/api/rewards/balance?userId='+encodeURIComponent(userId()||'')); if(!r.ok) return;
    const j = await r.json(); const p=document.getElementById('rwPoints'); const s=document.getElementById('rwStreak');
    if(p) p.textContent=j.points; if(s) s.textContent=j.streak;
  };
  window.rwCheckin = async function(){
    const r = await fetch('/api/rewards/checkin',{ method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ userId: userId() }) });
    if(!r.ok) return alert('Already checked in today'); rwRefresh();
  };
  window.rwClaim = async function(){
    const r = await fetch('/api/rewards/claim',{ method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ userId: userId() }) });
    if(!r.ok) return alert('Need 100 points to claim'); alert('🎉 Claimed'); rwRefresh();
  };
})();
