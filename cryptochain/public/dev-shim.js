(function(){
  const BASE = (typeof window !== 'undefined' && window.FIAT_BASE) ? window.FIAT_BASE : 'http://localhost:3001';

  async function jfetch(path, opts){
    const r = await fetch(`${BASE}${path}`, { credentials:'include', ...opts });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const ct = r.headers.get('content-type') || '';
    return ct.includes('application/json') ? r.json() : r.text();
  }

  window.fiatInit = async function(){ try { await jfetch('/api/fiat/init',{method:'POST'}); } catch(_){ } if (window.fiatRefresh) window.fiatRefresh(); };

  window.fiatRefresh = async function(){
    try{
      const j = await jfetch('/api/fiat/balance',{method:'GET'});
      const cur = (j?.currency||'USD').toUpperCase();
      const cents = Number.isFinite(j?.balanceCents) ? j.balanceCents : 0;
      const el = document.getElementById('fiatBalance');
      if (el) el.textContent = `${(cents/100).toFixed(2)} ${cur}`;
    }catch(_){}
  };

  window.fiatDeposit = async function(amountCents){
    const amt = Number(amountCents); if (!Number.isFinite(amt)||amt<=0) return;
    const data = await jfetch('/api/fiat/deposit-checkout',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({amountCents:amt,currency:'usd'})});
    if (data?.url) location.href = data.url;
  };

  window.fiatWithdraw = async function(amountCents){
    const amt = Number(amountCents); if (!Number.isFinite(amt)||amt<=0) return;
    await jfetch('/api/fiat/withdraw',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({amountCents:amt})});
    if (window.fiatRefresh) window.fiatRefresh();
  };

  async function syncOnchainBalances(){
    try{
      const addr = (window.currentWallet)||localStorage.getItem('walletAddress')||document.getElementById('address')?.textContent?.trim()||'';
      if (!addr) return;
      const res = await fetch(`${location.origin}/api/wallets/info?address=${encodeURIComponent(addr)}`,{credentials:'include'});
      if (!res.ok) return;
      const info = await res.json();
      const n = Number(info?.balances?.NATIVE ?? info?.native ?? 0);
      const c = Number(info?.balances?.CAP    ?? info?.cap    ?? 0);
      const nb = document.getElementById('nativeBalance');
      const cb = document.getElementById('capBalance');
      if (nb) nb.textContent = (Number.isFinite(n)?n.toFixed(6):'0.000000');
      if (cb) cb.textContent = (Number.isFinite(c)?c.toFixed(6):'0.000000');
    }catch(_){}
  }

  const _fetch = window.fetch;
  window.fetch = async function(url, opts){
    const u = typeof url==='string' ? url : (url?.url||'');
    const method = (opts?.method||'GET').toUpperCase();
    const p = _fetch.apply(this, arguments);
    try{
      const r = await p;
      const isApi = (typeof u==='string') && u.includes('/api/');
      const mutates = method==='POST' && (u.includes('/fiat/')||u.match(/\/(swap|trade|exchange|pool)\b/));
      if (isApi && mutates) setTimeout(()=>{ syncOnchainBalances(); if (window.fiatRefresh) window.fiatRefresh(); }, 400);
      return r;
    }catch(e){ throw e; }
  };

  (function(){ // Stripe success auto-confirm
    try{
      const q=new URLSearchParams(location.search); const sid=q.get('session_id'); if(!sid) return;
      fetch(`${BASE}/api/fiat/confirm?session_id=${encodeURIComponent(sid)}`)
        .then(()=>{ setTimeout(()=>{ if (window.fiatRefresh) window.fiatRefresh(); syncOnchainBalances(); }, 500); })
        .catch(()=>{});
    }catch(_){}
  })();

  setTimeout(()=>{ syncOnchainBalances(); if (window.fiatRefresh) window.fiatRefresh(); }, 300);
})();
