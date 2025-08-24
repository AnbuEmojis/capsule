// cryptochain/public/dev-shim.js
// - Routes *only* /api/fiat/* to http://localhost:3001
// - Adds x-user-id header (stable across reloads)
// - Calls /api/fiat/confirm once when ?session_id=… is present

(() => {
  const DEV_FIAT = 'http://localhost:3001';

  // Stable browser-local user id for the dev fiat server (since cookies on :3000 don't flow to :3001).
  const LS_KEY = 'fiat_local_user_id';
  let LOCAL_UID = localStorage.getItem(LS_KEY);
  if (!LOCAL_UID) {
    LOCAL_UID = `dev:${crypto?.randomUUID?.() || Date.now()}`;
    localStorage.setItem(LS_KEY, LOCAL_UID);
  }

  function isFiat(url) {
    try {
      if (typeof url === 'string') return url.startsWith('/api/fiat/');
      // Request object
      return typeof url?.url === 'string' && url.url.startsWith('/api/fiat/');
    } catch {
      return false;
    }
  }

  function toDevReq(input, init = {}) {
    // Normalize to string URL + init
    let url = typeof input === 'string' ? input : input.url;
    url = DEV_FIAT + url; // keep path/query as-is, only swap origin

    const headers = new Headers(init.headers || {});
    headers.set('x-user-id', LOCAL_UID);

    return [url, { ...init, headers, credentials: 'include' }];
  }

  const _fetch = window.fetch.bind(window);
  window.fetch = function devFetch(input, init) {
    if (isFiat(input)) {
      const [url, opts] = toDevReq(input, init || {});
      return _fetch(url, opts);
    }
    return _fetch(input, init);
  };

  // One-shot confirm handler (no console spam)
  const url = new URL(window.location.href);
  const sessionId = url.searchParams.get('session_id');
  const already = sessionStorage.getItem('fiat_confirm_done');

  async function runConfirmOnce() {
    if (!sessionId || already) return;
    try {
      const res = await fetch(`/api/fiat/confirm?session_id=${encodeURIComponent(sessionId)}`, {
        method: 'GET',
      });
      // Ignore body; we only care about letting the backend credit & dedupe
      sessionStorage.setItem('fiat_confirm_done', '1');
    } catch (e) {
      // keep silent to avoid noisy console; user can refresh once more if needed
    } finally {
      // Clean URL
      url.searchParams.delete('session_id');
      url.searchParams.delete('fiat');
      history.replaceState(null, '', url.toString());
    }
  }

  runConfirmOnce();

  // Small helper to expose the local id (useful if frontend wants to show "dev mode")
  window.__FIAT_DEV__ = { userId: LOCAL_UID };
})();
