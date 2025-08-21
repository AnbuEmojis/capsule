// backend/services/tax.js
// Simple, demo tax table. Extend as needed or load from DB.
const TAX_TABLE = {
    CA: { // Canada (example ON HST 13%)
      type: 'HST',
      rate: 0.13
    },
    US: { // USA — demo 0% federal; handle state elsewhere
      type: 'SALES',
      rate: 0.00
    },
    AU: { type: 'GST', rate: 0.10 },
    GB: { type: 'VAT', rate: 0.20 },
    EU: { type: 'VAT', rate: 0.20 },
    DEFAULT: { type: 'NONE', rate: 0.00 }
  };
  
  function getTaxFor(countryCode) {
    if (!countryCode) return TAX_TABLE.DEFAULT;
    const cc = countryCode.toUpperCase();
    return TAX_TABLE[cc] || TAX_TABLE.DEFAULT;
  }
  
  /**
   * Tax applies when interacting with NATIVE (treated as fiat).
   * If CAP→NATIVE: tax is taken out of user's NATIVE output.
   * If NATIVE→CAP: user pays tax in addition to amountIn.
   */
  function computeTax({ country, direction, nativeAmount }) {
    const t = getTaxFor(country);
    const base = Math.max(0, Number(nativeAmount) || 0);
    const taxDue = +(base * t.rate).toFixed(8);
    return { ...t, amount: taxDue };
  }
  
  module.exports = { computeTax, getTaxFor };
  