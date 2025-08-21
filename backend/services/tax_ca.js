// backend/services/tax_ca.js

// Province rates (as of writing; for demo "Penny" use only).
// HST provinces: ON 13%, NB/NL/NS/PE 15%
// GST 5% only: AB, NT, NU, YT
// GST+PST: BC 12% (5+7), MB 12% (5+7), SK 11% (5+6)
// QC: GST 5% + QST 9.975% => 14.975%
const CA = {
    AB: { GST: 0.05 },
    BC: { GST: 0.05, PST: 0.07 },
    MB: { GST: 0.05, PST: 0.07 },
    NB: { HST: 0.15 },
    NL: { HST: 0.15 },
    NS: { HST: 0.15 },
    NT: { GST: 0.05 },
    NU: { GST: 0.05 },
    ON: { HST: 0.13 },
    PE: { HST: 0.15 },
    QC: { GST: 0.05, QST: 0.09975 },
    SK: { GST: 0.05, PST: 0.06 },
    YT: { GST: 0.05 }
  };
  
  function listCaRates() {
    return Object.entries(CA).map(([code, r]) => ({
      code,
      rates: r,
      total: (r.HST ?? 0) + (r.GST ?? 0) + (r.PST ?? 0) + (r.QST ?? 0)
    }));
  }
  
  function getCaRate(province) {
    const code = String(province || '').toUpperCase();
    const r = CA[code];
    if (!r) return { code, rates: {}, total: 0 };
    const total = (r.HST ?? 0) + (r.GST ?? 0) + (r.PST ?? 0) + (r.QST ?? 0);
    return { code, rates: r, total };
  }
  
  /**
   * Compute CAD tax for a fiat base amount.
   * @param {object} p
   * @param {string} p.province - e.g., 'ON'
   * @param {number} p.cadAmount - taxable base (CAD)
   * @param {string} [p.op] - 'SWAP' | 'TRANSFER' | 'LP_ADD' | 'LP_REMOVE' (for logs/notes)
   */
  function computeCaTaxCAD({ province, cadAmount, op }) {
    const base = Math.max(0, Number(cadAmount) || 0);
    const { code, rates, total } = getCaRate(province);
    const gst = (rates.GST ?? 0) * base;
    const pst = (rates.PST ?? 0) * base;
    const qst = (rates.QST ?? 0) * base;
    const hst = (rates.HST ?? 0) * base;
    const totalCad = gst + pst + qst + hst;
    return {
      province: code,
      op: op || '',
      ratePercent: total * 100,
      cadBase: base,
      cadTax: totalCad,
      breakdown: { gst, pst, qst, hst }
    };
  }
  
  module.exports = { listCaRates, getCaRate, computeCaTaxCAD };
  