// backend/services/rates.js
// Real-time SOL price via CoinGecko (cached ~30s). Uses Node's global fetch.

const CACHE_MS = 30_000;
const cache = new Map(); // key -> { t, v }

function now() { return Date.now(); }
function hasFresh(k) {
  const it = cache.get(k);
  return it && (now() - it.t < CACHE_MS);
}
function set(k, v) { cache.set(k, { t: now(), v }); }

async function fetchJson(url) {
  const r = await fetch(url, { headers: { 'User-Agent': 'centratech-dev/1.0' } });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

/** Price of SOL in currency (USD, CAD, EUR, …) */
async function getSolPrice(currency = 'USD') {
  const cc = String(currency || 'USD').toLowerCase();
  const key = `sol:${cc}`;
  if (hasFresh(key)) return cache.get(key).v;

  // CoinGecko simple price
  const url = `https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=${cc}`;
  const j = await fetchJson(url);
  const price = Number(j?.solana?.[cc]);
  if (!Number.isFinite(price) || price <= 0) throw new Error('Bad price');
  set(key, price);
  return price;
}

/** If 1 NATIVE == 1 unit of <currency>, then SOL_PER_NATIVE = 1 / (price of SOL in <currency>) */
async function getSolPerNative(currency = 'USD') {
  const solInFiat = await getSolPrice(currency);
  return 1 / solInFiat;
}

module.exports = { getSolPrice, getSolPerNative };
