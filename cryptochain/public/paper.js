/* ============================
   CAP Paper Wallet — front end
   ============================ */

/* ---- platform helpers (auth + fetch wrappers) --------------------------- */
(function () {
  // Always-available auth header builder
  window.authHeaders = function authHeaders () {
    const h = { 'Content-Type': 'application/json' };

    // Bearer (if you store a JWT/session token)
    const token = localStorage.getItem('auth_token')
              ||  localStorage.getItem('token')
              ||  sessionStorage.getItem('token');
    if (token) h['Authorization'] = `Bearer ${token}`;

    // Local dev safety net: let backend accept a fixed user without OAuth
    try {
      if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') {
        h['x-user-id'] = localStorage.getItem('x_user_id') || 'dev:local';
      }
    } catch {}

    return h;
  };

  // GET/anything helper – DOES NOT stringify body
  window.api = async function api (path, opts = {}) {
    const url = path.startsWith('http') ? path
      : `/api${path.startsWith('/') ? path : '/' + path}`;

    const res = await fetch(url, {
      credentials: 'include',
      headers: { ...authHeaders(), ...(opts.headers || {}) },
      ...opts
    });

    if (!res.ok) {
      let body = '';
      try { body = await res.text(); } catch {}
      const err = new Error(`${res.status} ${res.statusText}${body ? ` — ${body.slice(0, 200)}` : ''}`);
      err.status = res.status;
      err.body = body;
      throw err;
    }

    const ct = res.headers.get('content-type') || '';
    return ct.includes('application/json') ? res.json() : res.text();
  };

  // POST JSON helper – STRINGIFIES body (fixes 400 "not valid JSON")
  window.json = async function json(path, body, method = 'POST') {
    const url = path.startsWith('http') ? path
      : `/api${path.startsWith('/') ? path : '/' + path}`;

    const res = await fetch(url, {
      method,
      credentials: 'include',                          // keep cookies/session
      headers: { ...(window.authHeaders?.() || {}), 'Content-Type': 'application/json' },
      body: JSON.stringify(body ?? {})
    });

    if (!res.ok) {
      let t = '';
      try { t = await res.text(); } catch {}
      const err = new Error(`${res.status} ${res.statusText}${t ? ` — ${t.slice(0,200)}` : ''}`);
      err.status = res.status; err.body = t;
      throw err;
    }

    const ct = res.headers.get('content-type') || '';
    return ct.includes('application/json') ? res.json() : res.text();
  };
})();

// Optimistic UI bump for the portfolio pane
function optimisticCapCredit(toCapAddress, deltaCap = 0, deltaNative = 0) {
  try {
    const capAddrInput = document.querySelector('#bal-cap-addr');
    const watchingSame = capAddrInput && capAddrInput.value.trim() === (toCapAddress || '').trim();

    // If the portfolio is currently showing this address, bump the CAP cell
    if (watchingSame) {
      const capCell = document.querySelector('#bal-cap-cap');
      if (capCell) {
        const cur = parseFloat(String(capCell.textContent || '0').replace(/,/g, '')) || 0;
        capCell.textContent = (cur + Number(deltaCap || 0))
          .toLocaleString(undefined, { maximumFractionDigits: 6 });
      }
    }

    // Lightly adjust the "NATIVE (fiat)" mirror text if present
    if (typeof deltaNative === 'number') {
      const tag = document.getElementById('native-fiat-mirror');
      if (tag) {
        const m = /([\d.]+)/.exec(tag.textContent || '');
        const cur = m ? parseFloat(m[1]) : 0;
        const next = Math.max(0, cur - deltaNative);
        tag.textContent = `NATIVE (fiat): ${next.toFixed(2)} USD`;
      }
    }
  } catch {}
}


/* ---- small DOM helpers -------------------------------------------------- */
const $  = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

/* ---- app state ---------------------------------------------------------- */
const state = {
  rates: null,  // { NATIVE_USD, CAP_NATIVE, SOL_USD, ... }
  addrs: {
    cap: localStorage.getItem('cap_addr') || '',
    sol: localStorage.getItem('sol_addr') || ''
  }
};
const getToken = () =>
  localStorage.getItem('token') || sessionStorage.getItem('token') || '';

/* ---- toasts ------------------------------------------------------------- */
function toast(msg, kind='info', ms=2200){
  const n = document.createElement('div');
  n.className = `toast-lite ${kind}`;
  n.textContent = msg;
  Object.assign(n.style, {
    position:'fixed', right:'16px', bottom:'16px',
    background: kind==='success'?'#16a34a':kind==='warning'?'#a16207':'#334155',
    color:'#fff', padding:'10px 12px', borderRadius:'10px',
    boxShadow:'0 10px 30px rgba(0,0,0,.25)', zIndex:9999
  });
  document.body.appendChild(n);
  setTimeout(()=>n.remove(), ms);
}

/* =========================================================
   FIAT / STRIPE (single-server)
   ========================================================= */
async function fiatInit(){
  try{
    const j = await api(`/fiat/init`, { method:'POST' });
    if (j?.userId) { window.USER_ID = j.userId; localStorage.setItem('USER_ID', j.userId); }
    await fiatRefresh();
    toast('Fiat wallet ready','success');
  } catch { toast('Fiat setup failed','warning'); }
}
async function fiatRefresh(){
  try{
    const j = await api(`/fiat/balance`);
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
    const j = await json(`/fiat/deposit-checkout`, {
      amountCents: Math.round(parseFloat(amount)*100), currency:'usd'
    });
    if (!j?.url) return toast('Could not start Stripe Checkout','warning');
    location.assign(j.url);
  } catch { toast('Could not start Stripe Checkout','warning'); }
}
async function fiatWithdraw(){
  const amount = prompt('Withdraw amount (USD):','5.00'); if (!amount) return;
  try{
    await json(`/fiat/withdraw`, { amountCents: Math.round(parseFloat(amount)*100) });
    fiatRefresh();
  } catch { toast('Withdraw failed','warning'); }
}
document.getElementById('fiatSetupBtn')?.addEventListener('click', fiatInit);
document.getElementById('fiatDepositBtn')?.addEventListener('click', fiatDeposit);
document.getElementById('fiatWithdrawBtn')?.addEventListener('click', fiatWithdraw);

/* =========================================================
   Quotes, balances, portfolio
   ========================================================= */
async function fetchRates(){
  try {
    const r = await api('/prices/latest');
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
      const q = await api(`/swaps/quote?fromToken=${fromToken}&toToken=${toToken}&amount=${encodeURIComponent(amount)}`);
      if (q?.amountOut != null) return { ok:true, route:[fromToken,toToken], amountOut:q.amountOut };
    }
  } catch {}
  return localQuote({ mode, amount });
}
// Pull wallet info; prefer fiat pouch for NATIVE if server provides it
async function getCapBalance(capAddr){
  if (!capAddr) return { capTokens: 0, native: 0 };

  try {
    const d = await api(`/wallets/info?address=${encodeURIComponent(capAddr)}`);

    // Be tolerant to different server field names
    const pickNum = (...candidates) => {
      for (const v of candidates) {
        const n = Number(v);
        if (Number.isFinite(n)) return n;
      }
      return 0;
    };

    const capTokens = pickNum(
      d.capTokens, d.cap, d.cap_balance, d.capOnChain,
      d?.balances?.cap, d?.tokenBalances?.cap
    );

    const native = pickNum(
      d.nativeFromFiat, d.nativeOnChain, d.native,
      d?.balances?.native
    );

    return { capTokens, native };
  } catch {
    return { capTokens: 0, native: 0 };
  }
}

async function getSolBalance(solPubkey){
  if (!solPubkey) return { sol:0, wcap:0 };
  try { return await api(`/bridge/solana/balances?pubkey=${encodeURIComponent(solPubkey)}`); } catch {}
  try { return await api(`/solana/balances?pubkey=${encodeURIComponent(solPubkey)}`); } catch {}
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

/* =========================================================
   HUB actions (keep your DOM IDs)
   ========================================================= */
$('#buy-quote')?.addEventListener('click', async ()=>{
  await fetchRates();
  const amt = Number($('#buy-native')?.value||0); if (amt<=0) return;
  const q = await getQuoteOnline({ mode:'native2cap', amount:amt });
  if (!q.ok) return toast('Quote failed','warning');
  $('#buy-cap-out').value = q.amountOut;
  $('#buy-quote-info').textContent = `Route: ${q.route?.join(' → ') || 'NATIVE → CAP'}`;
});

$('#buy-exec')?.addEventListener('click', async ()=>{
  try{
    const amountIn = Number($('#buy-native')?.value||0);
    const toCap    = ($('#buy-dst-cap')?.value||'').trim();
    if (!(amountIn>0) || !toCap) return toast('Amount + destination required','warning');

    const r = await json('/swaps/execute', {
      fromToken:'NATIVE',
      toToken:'CAP',
      amountIn,
      autoTax:true,
      toCapAddress: toCap
    });

    toast(`Bought ~${Number(r.amountOut||0).toFixed(6)} CAP • Penny ${Number(r.pennyApplied||0).toFixed(6)}`,'success');

    // 🔹 NEW: optimistic bump so the CAP balance moves instantly
    optimisticCapCredit(toCap, Number(r.amountOut || 0), amountIn);

    // keep existing events/refresh
    window.dispatchEvent(new Event('cap:swapped'));

    // immediate + delayed refreshes to settle to server truth
    await fiatRefresh();
    refreshPortfolio();
    setTimeout(refreshPortfolio, 800);
    setTimeout(refreshPortfolio, 2500);
  }catch(e){
    console.warn('buy exec error', e);
    toast('Buy failed','warning');
  }
});


// (You can wire sell/swap the same way – json('/swaps/execute', {...}))

/* =========================================================
   Connect tab helpers
   ========================================================= */
async function refreshProfileCache(){
  const t = getToken(); if (!t) return null;
  try {
    const me = await api('/profile/me');
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
  $('#btn-save-cap')?.addEventListener('click', ()=>{
    const v=$('#cap-addr-input')?.value.trim();
    if (!/^04[a-fA-F0-9]{128}$/.test(v)) return toast('Use uncompressed CAP pubkey (04…130 chars)','warning');
    state.addrs.cap=v; localStorage.setItem('cap_addr',v); toast('CAP address saved','success');
  });
  $('#btn-save-sol')?.addEventListener('click', ()=>{ const v=$('#sol-addr-input')?.value.trim(); if (!v) return toast('Paste Solana pubkey','warning'); state.addrs.sol=v; localStorage.setItem('sol_addr',v); toast('SOL address saved','success'); });
}

/* =========================================================
   Map fiat balance into the Hub’s NATIVE readout
   ========================================================= */
async function updateNativeFromFiat(fiatCentsMaybe){
  try {
    const cents = (typeof fiatCentsMaybe === 'number') ? fiatCentsMaybe
                 : (await api(`/fiat/balance`).catch(()=>({balanceCents:0}))).balanceCents || 0;
    const native = cents / 100;

    const el = document.querySelector('[data-native-balance]');
    if (el) el.textContent = native.toLocaleString(undefined, {maximumFractionDigits: 6});

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

/* =========================================================
   Rewards (small, additive; uses same headers/cookies)
   ========================================================= */
(function(){
  const H = authHeaders ? authHeaders({'Content-Type':'application/json'}) : { 'Content-Type':'application/json' };
  async function rwApi(path, opts) {
    const res = await fetch(`/api/rewards${path}`, Object.assign({ headers: H, credentials:'include' }, opts || {}));
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
      await rwApi('/checkin', { method:'POST' });         // POST JSON via fetch; server ignores body
      toast('Checked in! +10 points', 'success');
    } catch {
      toast('Already checked in today', 'info');
    } finally { rwRefresh(); }
  }
  async function rwClaim() {
    try {
      await rwApi('/claim', { method:'POST' });
      toast('Bonus claimed! +100 points', 'success');
    } catch { toast('Could not claim right now','warning'); }
    finally { rwRefresh(); }
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

/* =========================================================
   Stripe return (confirm & refresh, then clean URL)
   ========================================================= */
(async function handleStripeReturn() {
  const q = new URLSearchParams(location.search);
  if (q.get('fiat') !== 'success') return;

  const sessionId = q.get('session_id');
  if (!sessionId) {
    console.warn('Stripe success missing session_id');
    window.fiatRefresh?.();
    return;
  }

  async function runConfirmOnce() {
    const r = await fetch(`/api/fiat/confirm?session_id=${encodeURIComponent(sessionId)}`, { credentials: 'include' });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
      if (r.status === 409) return { ok: true, credited: true }; // already credited
      console.warn('fiat/confirm error', r.status, j);
      return { ok: false, retry: true };
    }
    return j; // { ok:true, credited:true|false, status:'paid'|'unpaid' }
  }

  let attempts = 0;
  while (attempts < 10) {
    const res = await runConfirmOnce();
    if (res?.ok && (res.credited || res.status === 'paid')) break;
    await new Promise(r => setTimeout(r, 1000));
    attempts++;
  }

  if (typeof window.fiatRefresh === 'function') await window.fiatRefresh();
  try {
    const url = new URL(location.href);
    url.searchParams.delete('fiat');
    url.searchParams.delete('session_id');
    history.replaceState({}, '', url.toString());
  } catch {}
})();

/* =========================================================
   First-load wiring
   ========================================================= */
(async function init(){
  setConnUI();
  await refreshProfileCache();
  setConnUI();

  useSavedAddresses();
  refreshPortfolio().catch(()=>{});
  updateNativeFromFiat().catch(()=>{});
})();
