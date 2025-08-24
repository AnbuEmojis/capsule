/* dev-shim.js v10 — route all /api/fiat/* requests to http://localhost:3001 */
(() => {
  const REAL_FETCH = window.fetch.bind(window);
  const DEV_FIAT_ORIGIN = 'http://localhost:3001';

  function toURL(input) {
    if (input instanceof Request) return new URL(input.url, window.location.origin);
    if (typeof input === 'string') return new URL(input, window.location.origin);
    return null;
  }

  async function devFetch(input, init = {}) {
    try {
      const url = toURL(input);
      if (url && url.pathname.startsWith('/api/fiat/')) {
        // Force to :3001
        const routed = new URL(url.toString());
        routed.protocol = 'http:';       // keep local
        routed.hostname = 'localhost';
        routed.port = '3001';

        // Always no-store + include creds
        const headers = new Headers(init && init.headers || (input instanceof Request ? input.headers : undefined));
        if (!headers.has('cache-control')) headers.set('cache-control', 'no-store');
        if (!headers.has('content-type') && init && init.body && typeof init.body === 'string') {
          headers.set('content-type', 'application/json');
        }
        const opts = { ...init, credentials: 'include', headers };

        if (input instanceof Request) {
          const req = new Request(routed.toString(), { ...opts, method: input.method, body: opts.body ?? input.body });
          return REAL_FETCH(req);
        }
        return REAL_FETCH(routed.toString(), opts);
      }
    } catch (e) {
      console.warn('[dev-shim] fallback due to error:', e);
    }
    return REAL_FETCH(input, init);
  }

  // Provide a tiny helper the page can call to re-pull CAP/NATIVE after fiat changes
  window.syncOnchainBalances = async (capAddr) => {
    try {
      const r = await devFetch('/api/wallets/info?address=' + encodeURIComponent(capAddr));
      if (!r.ok) return;
      const data = await r.json();
      // Update the two lines if they exist (IDs are already in paper.html)
      const capLine = document.querySelector('#cap-balance-line');
      const natLine = document.querySelector('#native-balance-line');
      if (capLine) capLine.textContent = `CAP tokens: ${(+data.capTokenBalance).toLocaleString()} (≈ NATIVE)`;
      if (natLine) natLine.textContent = `NATIVE: ${(+data.balance).toLocaleString()}`;
    } catch {}
  };

  window.fetch = devFetch;
})();
