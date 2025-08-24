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
    function toast(msg, kind='info', ms=2200){
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
  
    /* =========================================================
       FIAT / STRIPE  (single-server; no :3001 override)
       ========================================================= */
    async function fiatInit(){
      try{
        const r = await fetch(`/api/fiat/init`, { method:'POST' });
        if (!r.ok) throw new Error('init failed');
        const j = await r.json().catch(()=>null);
        if (j?.userId) { window.USER_ID = j.userId; localStorage.setItem('USER_ID', j.userId); }
        await fiatRefresh();
        toast('Fiat wallet ready','success');
      } catch { toast('Fiat setup failed','warning'); }
    }
    async function fiatRefresh(){
      try{
        const r = await fetch(`/api/fiat/balance`);
        if (!r.ok) return;
        const j = await r.json().catch(()=>({}));
        const cur = (j.currency ? String(j.currency).toUpperCase() : 'USD');
        const cents = Number.isFinite(j.balanceCents) ? j.balanceCents : 0;
        const el = document.getElementById('fiatBalance');
        if (el) el.textContent = `${(cents/100).toFixed(2)} ${cur}`;
        // mirror pouch → Hub NATIVE
        updateNativeFromFiat(j.balanceCents || 0);
      } catch {}
    }
    async function fiatDeposit(){
      const amount = prompt('Deposit amount (USD):','10.00'); if (!amount) return;
      try{
        const r = await fetch(`/api/fiat/deposit-checkout`, {
          method:'POST',
          headers:{'Content-Type':'application/json'},
          body: JSON.stringify({ amountCents: Math.round(parseFloat(amount)*100), currency:'usd' })
        });
        const j = await r.json().catch(()=>null);
        if (!r.ok || !j?.url) return toast('Could not start Stripe Checkout','warning');
        location.assign(j.url);
      } catch { toast('Could not start Stripe Checkout','warning'); }
    }
    async function fiatWithdraw(){
      const amount = prompt('Withdraw amount (USD):','5.00'); if (!amount) return;
      try{
        const r = await fetch(`/api/fiat/withdraw`, {
          method:'POST',
          headers:{'Content-Type':'application/json'},
          body: JSON.stringify({ amountCents: Math.round(parseFloat(amount)*100) })
        });
        if (!r.ok) throw 0;
        fiatRefresh();
      } catch { toast('Withdraw failed','warning'); }
    }
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
  
    // Pull wallet info; prefer fiat pouch for NATIVE if server provides it
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
  
    // When Stripe confirm completes (server redirects back), refresh balances
    window.addEventListener('fiat:confirmed', () => {
      try { window.fiatRefresh && window.fiatRefresh(); } catch(e) {}
      try { refreshPortfolio(); } catch(e) {}
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
  
    // ===== Map fiat balance into the Hub’s NATIVE readout =====
    async function updateNativeFromFiat(fiatCentsMaybe){
      try {
        const cents = (typeof fiatCentsMaybe === 'number') ? fiatCentsMaybe
                     : (await fetch(`/api/fiat/balance`).then(r=>r.json()).catch(()=>({balanceCents:0}))).balanceCents || 0;
        const native = cents / 100;
        const el = document.querySelector('[data-native-balance]');
        if (el) el.textContent = native.toLocaleString(undefined, {maximumFractionDigits: 6});
        // footer tag for visibility
        let tag = document.getElementById('native-fiat-mirror');
        if (!tag) {
          const holder = document.querySelector('.balances') || document.body;
          tag = document.createElement('div');
          tag.id = 'native-fiat-mirror';
          tag.style.cssText = 'margin:6px 0 0 4px;font-size:12px;opacity:.85';
          holder.appendChild(tag);
        }
        tag.textContent = `NATIVE (fiat): ${native.toFixed(2)} USD`;
      } catch {}
    }
    window.addEventListener('load',            () => updateNativeFromFiat().catch(()=>{}));
    window.addEventListener('cap:swapped',     () => updateNativeFromFiat().catch(()=>{}));
    window.addEventListener('fiat:credited',   () => updateNativeFromFiat().catch(()=>{}));
    document.querySelectorAll('[data-action="refresh-balances"]')
      .forEach(b => b.addEventListener('click', () => updateNativeFromFiat().catch(()=>{})));
  
    // ===== First-load wiring =====
    (async function init(){
      setConnUI();
      await refreshProfileCache();
      setConnUI();
      wireConnectTab();
  
      useSavedAddresses();
      refreshPortfolio().catch(()=>{});
      updateNativeFromFiat().catch(()=>{});
    })();
  
    // expose fiat helpers for Settings tab
    window.fiatInit     = fiatInit;
    window.fiatDeposit  = fiatDeposit;
    window.fiatWithdraw = fiatWithdraw;
    window.fiatRefresh  = fiatRefresh;
  })();
  
  // ==== Rewards front-end glue (small, additive) ================================
  (function(){
    const H = { 'Content-Type': 'application/json' };
    if (!H['x-user-id'] && (window.DEV_FAKE_AUTH === '1' || true)) {
      H['x-user-id'] = 'dev:local';
    }
    async function rwApi(path, opts) {
      const res = await fetch(`/api/rewards${path}`, Object.assign({ headers: H }, opts || {}));
      if (!res.ok) throw new Error(`rewards ${path} ${res.status}`);
      return res.json();
    }
    async function rwRefresh() {
      try {
        const s = await rwApi('/state');
        const pt = document.getElementById('rwPoints');
        const st = document.getElementById('rwStreak');
        if (pt) pt.textContent = s.points ?? 0;
        if (st) st.textContent = s.streak ?? 0;
      } catch {}
    }
    async function rwCheckin() {
      try {
        await rwApi('/checkin', { method:'POST' });
        toast('Checked in! +10 points', 'success');
      } catch (e) {
        // 409 means you’ve already checked in today — treat as info
        toast('Already checked in today', 'info');
      } finally {
        rwRefresh();
      }
    }
    
    async function rwClaim() {
      try {
        await rwApi('/claim', { method:'POST' });
        toast('Bonus claimed! +100 points', 'success');
      } catch (e) {
        toast('Could not claim right now', 'warning');
      } finally {
        rwRefresh();
      }
    }
    
  
    window.rwRefresh = rwRefresh; window.rwCheckin = rwCheckin; window.rwClaim = rwClaim;
    document.addEventListener('DOMContentLoaded', () => {
      document.getElementById('rwCheckinBtn')?.addEventListener('click', rwCheckin);
      document.getElementById('rwClaimBtn')?.addEventListener('click', rwClaim);
      rwRefresh();
    });
    document.addEventListener('click', (e) => {
      const t = e.target;
      if (t && t.matches('[data-tab="#tab-rewards"], #rewards-tab')) setTimeout(rwRefresh, 0);
    });
  })();
  