/* cryptochain/public/dev-shim.js */
(() => {
  const FIAT_BASE = 'http://localhost:3001';
  const mapFiat = (url) => url.replace(/^\/?api\/fiat\//, `${FIAT_BASE}/api/fiat/`);

  const origFetch = window.fetch.bind(window);
  window.fetch = (input, init) => {
    try {
      const u = typeof input === 'string' ? input : input.url;
      if (/^\/?api\/fiat\//.test(u)) {
        return origFetch(mapFiat(u), init);
      }
    } catch {}
    return origFetch(input, init);
  };

  // Confirm Stripe checkout once, then clean URL
  window.addEventListener('load', async () => {
    const sp = new URLSearchParams(location.search);
    const sid = sp.get('session_id');
    if (!sid) return;
    try { await fetch('/api/fiat/confirm?session_id=' + encodeURIComponent(sid)); }
    catch {}
    history.replaceState({}, '', location.pathname); // avoid double-confirm on refresh
  });
})();
