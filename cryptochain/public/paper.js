/* ============================
   CAP Paper Wallet — front end
   ============================ */
   (() => {
    const $  = (sel, root = document) => root.querySelector(sel);
    const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  
    // -------- session / state --------
    const state = {
      rates: null,  // { NATIVE_USD, CAP_NATIVE, SOL_USD, ... }
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
      const token = await new Promise((resolve, reject) => {
        google.accounts.oauth2
          .initTokenClient({
            client_id: window.GOOGLE_CLIENT_ID,
            scope: 'https://www.googleapis.com/auth/drive.file',
            callback: (r) => r && r.access_token ? resolve(r.access_token) : reject('no token')
          })
          .requestAccessToken();
      });
  
      const fileName = `cap-wallet-backup-${address.slice(0,10)}.capwallet.json`;
      const meta = { name: fileName, mimeType: 'application/json' };
      const boundary = '-------314159265358979323846';
      const body =
        `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n`+
        `${JSON.stringify(meta)}\r\n`+
        `--${boundary}\r\nContent-Type: application/json\r\n\r\n`+
        `${JSON.stringify(encPrivKeyBlob)}\r\n`+
        `--${boundary}--`;
  
      const res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': `multipart/related; boundary=${boundary}` },
        body
      });
      if (!res.ok) throw new Error('drive_upload_failed');
      alert(`✅ Backup saved to your Google Drive as ${fileName}`);
      return res.json();
    }
  
    document.getElementById('backupDriveBtn')?.addEventListener('click', async () => {
      try {
        const address = window.currentCapAddress;
        if (!address) return alert('Set your CAP address first.');
        const pass = await promptForPassphrase();
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
    async function encryptPrivKey({ privateKey, passphrase }) { return { scheme:'passphrase', ciphertext: btoa(privateKey), salt: 'demo', iv:'demo', tag:'demo' }; }
    async function promptForPassphrase(){ if (cachedPassphrase) return cachedPassphrase; const p = prompt('Enter passphrase to encrypt your backup:'); if (!p) throw new Error('passphrase_required'); return p; }
  
    document.getElementById('saveCurrencyBtn')?.addEventListener('click', async ()=>{
      const currency = document.getElementById('currencySelect').value;
      await fetch('/api/user/prefs/currency', { method:'POST', headers:{'Content-Type': 'application/json'}, body: JSON.stringify({ currency }) });
      alert('✅ Currency saved');
    });
  
    /* =========================================================
       FIAT / STRIPE (dev override + buttons)
       ========================================================= */
    // If you run the dev fiat server on :3001, define this in paper.html:
    // <script>window.FIAT_BASE='http://localhost:3001'</script>
    const FIAT_BASE = (typeof window !== 'undefined' && window.FIAT_BASE) ? window.FIAT_BASE : '';
  
    async function fiatInit(){
      const r = await fetch(`${FIAT_BASE}/api/fiat/init`, { method:'POST' });
      const j = await r.json().catch(()=>null);
      if (!r.ok) { alert('Fiat setup failed: ' + (j?.error || r.status)); return; }
      if (j?.userId) { window.USER_ID = j.userId; localStorage.setItem('USER_ID', j.userId); }
      await fiatRefresh();
      alert('✅ Fiat wallet ready');
    }
  
    async function fiatRefresh(){
      const r = await fetch(`${FIAT_BASE}/api/fiat/balance`);
      if (!r.ok) return;
      const j = await r.json().catch(()=>({}));
      const cur = (j.currency ? String(j.currency).toUpperCase() : 'USD');
      const cents = Number.isFinite(j.balanceCents) ? j.balanceCents : 0;
      const el = document.getElementById('fiatBalance');
      if (el) el.textContent = `${(cents/100).toFixed(2)} ${cur}`;
      // also reflect pouch → Hub NATIVE
      updateNativeFromFiat(j.balanceCents || 0);
    }
  
    async function fiatDeposit(){
      const amount = prompt('Deposit amount (USD):','10.00'); if (!amount) return;
      const r = await fetch(`${FIAT_BASE}/api/fiat/deposit-checkout`, {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ amountCents: Math.round(parseFloat(amount)*100), currency:'usd' })
      });
      const j = await r.json().catch(()=>null);
      if (!r.ok || !j?.url) { alert('Could not start Stripe Checkout'); return; }
      location.assign(j.url);
    }
  
    async function fiatWithdraw(){
      const amount = prompt('Withdraw amount (USD):','5.00'); if (!amount) return;
      const r = await fetch(`${FIAT_BASE}/api/fiat/withdraw`, {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ amountCents: Math.round(parseFloat(amount)*100) })
      });
      if (!r.ok) { alert('Withdraw failed'); return; }
      fiatRefresh();
    }
  
    // Wire Settings buttons
    document.getElementById('fiatSetupBtn')?.addEventListener('click', fiatInit);
    document.getElementById('fiatDepositBtn')?.addEventListener('click', fiatDeposit);
    document.getElementById('fiatWithdrawBtn')?.addEventListener('click', fiatWithdraw);
  
    /* =========================================================
       Quotes, balances, and Hub actions
       ========================================================= */
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
  
    // Pull wallet info; prefer fiat pouch for NATIVE if provided by server
    async function getCapBalance(capAddr){
      if (!capAddr) return { capTokens:0, native:0 };
      const tryJSON = async url => { const r = await fetch(url,{headers:authHeaders()}); if (!r.ok) throw 0; return r.json(); };
      try {
        const d = await tryJSON(`/api/wallets/info?address=${encodeURIComponent(capAddr)}`);
        const native = (d.nativeFromFiat != null) ? Number(d.nativeFromFiat) : Number(d.nativeOnChain || d.native || 0);
        return { capTokens: Number(d.capTokens||0), native };
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
          { symbol:'NATIVE', name:'Native coin (fiat pouch)', balance:capB.native||0,    valueUsd:nativeUsd },
          { symbol:'SOL',    name:'Solana (devnet)',          balance:solB.sol||0,       valueUsd:solUsd },
          { symbol:'wCAP',   name:'Wrapped CAP (devnet)',     balance:solB.wcap||0,      valueUsd:wcapUsd },
        ];
  
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
  
        const totalUsd    = items.reduce((s,x)=>s+(x.valueUsd||0),0);
        const totalNative = (capB.native||0) + capInNative + ((solB.wcap||0)*(fx.CAP_NATIVE||0.01));
  
        const usdEl = document.querySelector('#pf-total-usd');
        const natEl = document.querySelector('#pf-total-native');
        if (usdEl) usdEl.textContent = totalUsd.toLocaleString(undefined,{maximumFractionDigits:2});
        if (natEl) natEl.textContent = totalNative.toLocaleString(undefined,{maximumFractionDigits:6});
  
        // mirror mini balances
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
  
    // ===== Hub actions (buy/sell/swap) =====
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
        window.dispatchEvent(new Event('cap:swapped'));
        refreshPortfolio();
      }catch(e){ toast('Buy failed (server route not mounted?)','warning'); }
    });
  
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
        window.dispatchEvent(new Event('cap:swapped'));
        refreshPortfolio();
      }catch(e){ toast('Sell failed','warning'); }
    });
  
    $('#swap-quote')?.addEventListener('click', async ()=>{
      await fetchRates();
      const amt = Number($('#swap-cap').value||0); if (amt<=0) return;
      const q = await getQuoteOnline({ mode:'cap2sol', amount:amt });
      if (!q.ok) return toast('Quote failed','warning');
      $('#swap-quote-info').textContent = `CAP → SOL ≈ ${q.amountOut} (route: ${q.route?.join(' → ') || 'CAP → NATIVE → SOL'})`;
    });
  
    // ===== Connect tab wiring =====
    async function refreshProfileCache(){
      const t = getToken(); if (!t) return null;
      try {
        const me = await api('/api/profile/me');
        if (me?.email) localStorage.setItem('session_email', me.email);
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
    function useSavedAddresses(){
      if (state.addrs.cap) $('#bal-cap-addr').value = state.addrs.cap;
      if (state.addrs.sol) $('#bal-sol-addr').value = state.addrs.sol;
    }
    function wireConnectTab(){
      $('#btn-google')?.addEventListener('click', ()=> window.location.href='/api/oauth/google');
      $('#btn-github')?.addEventListener('click', ()=> window.location.href='/api/oauth/github');
      $('#btn-copy-token')?.addEventListener('click', async ()=> { const t=getToken(); if (!t) return; await navigator.clipboard.writeText(t); toast('Token copied','success'); });
      $('#btn-signout')?.addEventListener('click', ()=>{ localStorage.removeItem('token'); sessionStorage.removeItem('token'); setConnUI(); });
      $('#btn-save-cap')?.addEventListener('click', ()=>{ const v=$('#cap-addr-input').value.trim(); if (!/^04[a-fA-F0-9]{128}$/.test(v)) return toast('Use uncompressed CAP pubkey (04…130 chars)','warning'); state.addrs.cap=v; localStorage.setItem('cap_addr',v); toast('CAP address saved','success'); });
      $('#btn-save-sol')?.addEventListener('click', ()=>{ const v=$('#sol-addr-input').value.trim(); if (!v) return toast('Paste Solana pubkey','warning'); state.addrs.sol=v; localStorage.setItem('sol_addr',v); toast('SOL address saved','success'); });
    }
  
    // ===== Map fiat balance into the Hub's NATIVE readout =====
    async function updateNativeFromFiat(fiatCentsMaybe){
      try {
        const cents = (typeof fiatCentsMaybe === 'number') ? fiatCentsMaybe
                     : (await fetch(`${FIAT_BASE}/api/fiat/balance`).then(r=>r.json()).catch(()=>({balanceCents:0}))).balanceCents || 0;
        const native = cents / 100;
        const el = document.querySelector('[data-native-balance]');
        if (el) el.textContent = native.toLocaleString(undefined, {maximumFractionDigits: 6});
      } catch {}
    }
    window.addEventListener('load', updateNativeFromFiat);
    window.addEventListener('cap:swapped', updateNativeFromFiat);
    document.querySelectorAll('[data-action="refresh-balances"]').forEach(b =>
      b.addEventListener('click', updateNativeFromFiat)
    );
  
    // ===== First-load wiring =====
    (async function init(){
      setConnUI();
      await refreshProfileCache();
      setConnUI();
      wireConnectTab();
  
      useSavedAddresses();
      refreshPortfolio().catch(()=>{});
      // initial fiat read for Hub
      updateNativeFromFiat().catch(()=>{});
    })();
  
    // expose fiat helpers for Settings tab
    window.fiatInit = fiatInit;
    window.fiatDeposit = fiatDeposit;
    window.fiatWithdraw = fiatWithdraw;
    window.fiatRefresh = fiatRefresh;
  })();

  
  
(function () {
  // ---------- tiny API wrapper (respects dev-shim) ----------
  async function api(path, opts = {}) {
    const res = await fetch(path, {
      method: opts.method || 'GET',
      headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
      body: opts.body ? JSON.stringify(opts.body) : undefined,
      credentials: 'include',
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      const err = new Error(`HTTP ${res.status}`);
      err.status = res.status;
      err.body = text;
      throw err;
    }
    return res.json().catch(() => ({}));
  }

  // ---------- FIAT helpers ----------
  async function fiatInit() {
    try {
      return await api('/api/fiat/init', { method: 'POST' });
    } catch {
      return { ok: false };
    }
  }

  async function fiatBalance() {
    try {
      return await api('/api/fiat/balance');
    } catch {
      return { balanceCents: 0, currency: 'USD' };
    }
  }

  async function fiatDeposit(amountCents, currency = 'usd') {
    const { url } = await api('/api/fiat/deposit-checkout', {
      method: 'POST',
      body: { amountCents, currency },
    });
    if (url) location.href = url;
  }

  async function fiatWithdraw(amountCents) {
    return api('/api/fiat/withdraw', {
      method: 'POST',
      body: { amountCents },
    });
  }

  // ---------- Wire into your existing buttons ----------
  const q = (s) => document.querySelector(s);
  const byId = (id) => document.getElementById(id);

  // If you already have handlers defined, you can keep them; these are safe defaults.
  window.fiatInit = async () => {
    const r = await fiatInit();
    await refreshAll();
    return r;
  };

  window.fiatDeposit = async () => {
    const amt = Number(prompt('Amount (USD) to add to fiat wallet?')) || 0;
    if (amt <= 0) return;
    await fiatDeposit(Math.round(amt * 100), 'usd');
  };

  window.fiatWithdraw = async () => {
    const amt = Number(prompt('Withdraw amount (USD) from fiat wallet?')) || 0;
    if (amt <= 0) return;
    try {
      await fiatWithdraw(Math.round(amt * 100));
      await refreshAll();
      toast('Withdrawn from fiat wallet.');
    } catch (e) {
      toast('Withdraw failed.');
    }
  };

  // ---------- Refresh helpers ----------
  async function refreshFiatBadgeIntoNative() {
    // Pull fiat balance and reflect it in the Native section label.
    const r = await fiatBalance();
    const usd = (r.balanceCents || 0) / 100;
    // Find a place near your NATIVE readout; these selectors are conservative.
    const nativeBox = document.querySelector('.balances') || document.body;
    let tag = document.getElementById('native-fiat-mirror');
    if (!tag) {
      tag = document.createElement('div');
      tag.id = 'native-fiat-mirror';
      tag.style.cssText = 'margin-top:4px;font-size:12px;opacity:.8';
      nativeBox.appendChild(tag);
    }
    tag.textContent = `NATIVE (fiat): ${usd.toFixed(2)} USD`;
  }

  async function refreshOnchain() {
    // If you have an existing function to refresh CAP/wCAP/SOL balances, call it here.
    // Example:
    if (typeof window.refreshBalances === 'function') {
      await window.refreshBalances();
    }
  }

  async function refreshAll() {
    await Promise.all([refreshFiatBadgeIntoNative(), refreshOnchain()]);
  }

  // ---------- Swap flow glue (after successful buy/sell, resync everything) ----------
  async function onSwapSuccess() {
    await refreshAll();
    toast('Swap complete.');
  }

  // Wrap your existing Execute Buy button if present
  (function patchExecuteBuy() {
    const btn = Array.from(document.querySelectorAll('button')).find(
      (b) => /Execute Buy/i.test(b.textContent || '')
    );
    if (!btn) return;
    const original = btn.onclick;
    btn.onclick = async (e) => {
      try {
        if (original) {
          const maybePromise = original.call(btn, e);
          if (maybePromise && typeof maybePromise.then === 'function') {
            await maybePromise;
          }
        }
        await onSwapSuccess();
      } catch (err) {
        // original handler already surfaced any errors
      }
    };
  })();

  // tiny toast
  function toast(msg) {
    try {
      const el = document.createElement('div');
      el.textContent = msg;
      el.style.cssText =
        'position:fixed;left:50%;bottom:24px;transform:translateX(-50%);background:#0a0f1a;color:#bff; border:1px solid #134; padding:8px 12px;border-radius:10px;z-index:9999';
      document.body.appendChild(el);
      setTimeout(() => el.remove(), 1800);
    } catch {}
  }

  // Initial pass after DOM ready
  document.addEventListener('DOMContentLoaded', refreshAll);
})();