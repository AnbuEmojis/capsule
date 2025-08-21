// backend/services/oracle.js

/** Base FX helpers
 * You can steer these with env:
 *   NATIVE_USD, SOL_USD  (or direct NATIVE_CAD, SOL_CAD)
 * If *_CAD is provided, it takes precedence for CAD quotes.
 */

function usdTo(target) {
  const fx = {
    USD: 1,
    CAD: 1.35,
    EUR: 0.92,
    GBP: 0.78,
    AUD: 1.48
  };
  return fx[(target || 'USD').toUpperCase()] ?? 1;
}

/** Price of 1 NATIVE in a target fiat */
function nativeToFiat(vs = 'USD') {
  vs = (vs || 'USD').toUpperCase();
  // Direct override
  if (vs === 'CAD' && process.env.NATIVE_CAD) return Number(process.env.NATIVE_CAD);
  // Otherwise derive from USD base
  const nativeUsd = Number(process.env.NATIVE_USD || 1); // default: 1 NATIVE = $1
  return nativeUsd * usdTo(vs);
}

/** Price of 1 SOL in NATIVE (mid) */
function solInNative() {
  // Prefer USD ratio (SOL_USD / NATIVE_USD)
  const solUsd = Number(process.env.SOL_USD || 150);
  const nativeUsd = Number(process.env.NATIVE_USD || 1);
  if (nativeUsd <= 0) return 0;
  return solUsd / nativeUsd;
}

/** Convert amount of asset to fiat (string code) */
function toFiat({ pool, asset = 'NATIVE', amount = 0, vs = 'USD' }) {
  asset = String(asset || 'NATIVE').toUpperCase();
  vs = (vs || 'USD').toUpperCase();
  const amt = Number(amount) || 0;
  if (amt <= 0) return { value: 0, rate: 0 };

  if (asset === 'NATIVE') {
    const rate = nativeToFiat(vs);
    return { value: amt * rate, rate };
  }
  if (asset === 'SOL') {
    // Optionally support direct *_CAD for SOL
    if (vs === 'CAD' && process.env.SOL_CAD) {
      const rate = Number(process.env.SOL_CAD);
      return { value: amt * rate, rate };
    }
    const solPerNative = 1 / solInNative(); // SOL per 1 NATIVE
    const nativePerSol = 1 / (solPerNative || 1e-12);
    const nativeAmt = amt * nativePerSol;
    const rateNative = nativeToFiat(vs);
    return { value: nativeAmt * rateNative, rate: (nativePerSol * rateNative) };
  }
  if (asset === 'CAP') {
    const capInNative = capInNativeFromPool(pool);
    if (!capInNative) return { value: 0, rate: 0 };
    const nativeAmt = amt * capInNative;
    const rateNative = nativeToFiat(vs);
    return { value: nativeAmt * rateNative, rate: (capInNative * rateNative) };
  }
  return { value: 0, rate: 0 };
}

/** Quick helper for CAP price in NATIVE using pool reserves (constant product mid price) */
function capInNativeFromPool(pool) {
  if (!pool?.getReserves) return null;
  const { CAP, NATIVE } = pool.getReserves();
  if (!Number.isFinite(CAP) || !Number.isFinite(NATIVE) || CAP <= 0) return null;
  // Mid: NATIVE per 1 CAP
  return NATIVE / CAP;
}

/** Reverse: convert fiat → NATIVE for “Penny” computations if needed */
function fiatToNative({ fiatAmount = 0, vs = 'USD' }) {
  const rate = nativeToFiat(vs);
  if (!rate) return 0;
  return Number(fiatAmount) / rate;
}

function rateTable(vs = 'USD', pool) {
  vs = (vs || 'USD').toUpperCase();
  const rNative = nativeToFiat(vs);
  const rCap = (capInNativeFromPool(pool) || 0) * rNative;
  const solPerNative = 1 / solInNative();
  const nativePerSol = 1 / (solPerNative || 1e-12);
  const rSol = nativePerSol * rNative;
  return {
    vs,
    ONE_NATIVE: rNative,
    ONE_CAP: rCap,
    ONE_SOL: rSol
  };
}

module.exports = {
  nativeToFiat,
  solInNative,
  capInNativeFromPool,
  toFiat,
  fiatToNative,
  rateTable
};
