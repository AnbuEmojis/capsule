// backend/services/bridge_history.js
const { readJson, writeJson } = require('./store');
const FILE = 'bridge_history.json';

function load() {
  const db = readJson(FILE, { items: [] });
  if (!db.items) db.items = [];
  return db;
}
function save(db) { writeJson(FILE, db); }

function add({ userId = null, direction, inAmount = 0, outAmount = 0, pennyNative = 0, tx = {}, note = '' }) {
  const db = load();
  const rec = {
    ts: Date.now(),
    userId,
    direction,          // 'sol2cap' | 'cap2sol'
    inAmount: Number(inAmount) || 0,
    outAmount: Number(outAmount) || 0,
    pennyNative: Number(pennyNative) || 0,
    tx,                 // { sig?, lockTx?, mintSig?, solSig? }
    note
  };
  db.items.unshift(rec);
  save(db);
  return rec;
}

function list({ userId = null, limit = 20 }) {
  const db = load();
  const items = (userId ? db.items.filter(i => i.userId === userId) : db.items).slice(0, limit);
  return items;
}

module.exports = { add, list };
