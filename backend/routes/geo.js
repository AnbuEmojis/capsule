// backend/routes/geo.js
const express = require('express');
const router = express.Router();

/** crude country→currency defaults (dev only; override in .env if needed) */
const COUNTRY_TO_CCY = {
  CA: 'CAD',
  US: 'USD',
  GB: 'GBP',
  EU: 'EUR',
  AU: 'AUD',
  JP: 'JPY'
};

function pickCountry(req) {
  // 1) explicit ?country=XX
  const q = (req.query.country || '').toUpperCase();
  if (COUNTRY_TO_CCY[q]) return q;

  // 2) x-country header (you can set this behind a load balancer)
  const h = (req.header('x-country') || '').toUpperCase();
  if (COUNTRY_TO_CCY[h]) return h;

  // 3) Accept-Language → region (en-CA, fr-CA, en-US, en-GB, …)
  const al = req.header('accept-language') || '';
  const m = al.match(/[-_]([A-Z]{2})/);
  if (m && COUNTRY_TO_CCY[m[1]]) return m[1];

  // 4) default
  return process.env.DEFAULT_COUNTRY || 'CA';
}

router.get('/currency', (req, res) => {
  const country = pickCountry(req);
  const currency =
    (process.env.DEFAULT_CURRENCY || COUNTRY_TO_CCY[country] || 'USD').toUpperCase();

  res.json({ country, currency });
});

module.exports = router;
