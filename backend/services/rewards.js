// backend/services/rewards.js
const { readJson, writeJson } = require('./store');

const FILE = 'rewards.json';

// default: 1 point per 0.001 NATIVE of Penny; 100 pts = 1 CAP (configurable)
const POINTS_PER_NATIVE_PENNY = Number(process.env.REW_POINTS_PER_NATIVE || 1000);
const CAP_PER_POINT = Number(process.env.REW_CAP_PER_POINT || 0.01);

function load() {
  const db = readJson(FILE, { users: {} });
  if (!db.users) db.users = {};
  return db;
}
function save(db) { writeJson(FILE, db); }

function _user(db, userId) {
  const id = userId || 'anon';
  db.users[id] = db.users[id] || { points: 0, claimedCap: 0, history: [] };
  return { id, rec: db.users[id] };
}

function accrue({ userId, reason, pennyNative = 0, points = null, meta = {} }) {
  const db = load();
  const { id, rec } = _user(db, userId);

  let addPts = points;
  if (addPts == null) {
    // Convert Penny-native contribution to points
    addPts = (Number(pennyNative) || 0) * POINTS_PER_NATIVE_PENNY;
  }
  addPts = Math.max(0, Math.round(addPts));

  if (addPts > 0) {
    rec.points += addPts;
    rec.history.unshift({
      ts: Date.now(),
      type: 'accrue',
      reason,
      points: addPts,
      meta
    });
    save(db);
  }
  return { userId: id, added: addPts, total: rec.points };
}

function summary(userId) {
  const db = load();
  const { id, rec } = _user(db, userId);
  const claimableCap = rec.points * CAP_PER_POINT;
  return {
    userId: id,
    points: rec.points,
    claimableCap,
    claimedCap: rec.claimedCap
  };
}

function claim({ userId, amountCap }) {
  const db = load();
  const { id, rec } = _user(db, userId);

  const maxCap = rec.points * CAP_PER_POINT;
  const cap = Math.min(Number(amountCap) || 0, maxCap);
  if (cap <= 0) return { ok: false, message: 'Nothing to claim' };

  // burn points first (integer)
  const burnPoints = Math.ceil(cap / CAP_PER_POINT);
  rec.points = Math.max(0, rec.points - burnPoints);
  rec.claimedCap += cap;
  rec.history.unshift({
    ts: Date.now(),
    type: 'claim',
    cap,
    burnedPoints: burnPoints
  });
  save(db);
  return { ok: true, cap, burnedPoints: burnPoints, remainingPoints: rec.points };
}

module.exports = {
  accrue,
  summary,
  claim,
  constants: { POINTS_PER_NATIVE_PENNY, CAP_PER_POINT }
};
