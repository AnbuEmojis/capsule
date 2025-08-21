// backend/services/penny.js
const { readJson, writeJson } = require('./store');

const FILE = 'penny_ledger.json';

function load() {
  const data = readJson(FILE, { entries: [], totals: {} });
  if (!data.entries) data.entries = [];
  if (!data.totals) data.totals = {};
  return data;
}

function save(db) { writeJson(FILE, db); }

function record({ type, asset = 'NATIVE', amount = 0, userId = null, address = null, txRef = null, meta = {} }) {
  const db = load();
  const ts = Date.now();
  const entry = { ts, type, asset, amount: Number(amount) || 0, userId, address, txRef, meta };
  db.entries.unshift(entry); // newest first
  db.totals[asset] = Number(db.totals[asset] || 0) + entry.amount;
  save(db);
  return entry;
}

function getTotals() {
  const { totals } = load();
  return totals;
}

function getLedger({ offset = 0, limit = 50 } = {}) {
  const { entries } = load();
  return entries.slice(offset, offset + limit);
}

module.exports = { record, getTotals, getLedger };
