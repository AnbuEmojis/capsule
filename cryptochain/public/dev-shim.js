/* dev-shim.js — DEV ONLY
   - Reroute /api/fiat/* and /api/swaps/* to http://localhost:3001
   - Add x-user-id so backend can resolve the wallet
   - Confirm Stripe session once per ?session_id=... and emit an event
*/
(() => {
  const originalFetch = window.fetch.bind(window);

  const PATHS_TO_REROUTE = ['/api/fiat', '/api/swaps'];
  const DEV_BASE = 'http://localhost:3001';

  function toURL(input) {
    if (input instanceof URL) return input;
    try {
      // relative -> use current origin
      return new URL(input, window.location.origin);
    } catch {
      // non-string Request object?
      if (typeof input === 'object' && input && input.url) {
        return new URL(input.url, window.location.origin);
      }
      throw new Error('Unsupported fetch input');
    }
  }

  function needsReroute(u) {
    return PATHS_TO_REROUTE.some(p => u.pathname.startsWith(p));
  }

  function rewriteTo3001(u) {
    const out = new URL(DEV_BASE + u.pathname + u.search);
    return out;
  }

  window.fetch = async function patchedFetch(input, init = {}) {
    let url = toURL(input);
    let finalUrl = url;

    // Reroute fiat/swaps from :3000 (or same origin) to :3001
    if (needsReroute(url) && (url.origin === location.origin || url.host.endsWith(':3000'))) {
      finalUrl = rewriteTo3001(url);
    }

    // Compose headers, inject user id in dev for fiat/swaps
    const headers = new Headers(init.headers || {});
    if (needsReroute(url)) {
      const userKey = localStorage.getItem('userKey') || 'dev:local';
      headers.set('x-user-id', userKey);
      if (init.body && !headers.has('content-type')) {
        headers.set('content-type', 'application/json');
      }
    }

    const finalInit = Object.assign({}, init, { headers });
    return originalFetch(finalUrl.toString(), finalInit);
  };

  // Confirm Stripe session once and notify the app
  async function confirmFromUrlOnce() {
    const params = new URLSearchParams(location.search);
    const sid = params.get('session_id');
    if (!sid) return;
    const guard = `fiat:confirmed:${sid}`;
    if (localStorage.getItem(guard)) return;

    try {
      await fetch(`/api/fiat/confirm?session_id=${encodeURIComponent(sid)}`, { credentials: 'include' });
      localStorage.setItem(guard, '1');
      window.dispatchEvent(new CustomEvent('fiat:confirmed'));
    } catch (err) {
      console.error('fiat confirm failed', err);
    }
  }

  confirmFromUrlOnce();
})();
