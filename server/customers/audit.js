'use strict';
// Append-only, hash-chained audit log. Must be called with a client that is INSIDE a transaction
// (the advisory lock serialises writers so the chain has no forks and is released at COMMIT/ROLLBACK).
const crypto = require('crypto');
const SECRET_KEY = /pass(word)?|secret|token|authorization|api[-_]?key|cookie|hash|pepper/i;
const LOCK = 727002;

function stable(v) {
  if (Array.isArray(v)) return '[' + v.map(stable).join(',') + ']';
  if (v && typeof v === 'object') return '{' + Object.keys(v).sort().map(k => JSON.stringify(k) + ':' + stable(v[k])).join(',') + '}';
  return JSON.stringify(v === undefined ? null : v);
}
const clean = m => { const o = {}; for (const [k, v] of Object.entries(m || {})) if (!SECRET_KEY.test(k)) o[k] = v; return o; };
const chainHash = (prev, row) => crypto.createHash('sha256').update((prev ? prev.toString('hex') : '') + '|' + stable([row.at, row.actor_type, row.actor_id, row.action, row.entity_type, row.entity_id, row.ip_hash, row.meta])).digest();

async function writeAudit(c, e, now = () => new Date()) {
  await c.query('SELECT pg_advisory_xact_lock($1)', [LOCK]);
  const last = (await c.query('SELECT hash FROM audit_logs ORDER BY id DESC LIMIT 1')).rows[0];
  const row = { at: now().toISOString(), actor_type: e.actorType, actor_id: e.actorId == null ? null : String(e.actorId), action: e.action, entity_type: e.entityType || null, entity_id: e.entityId == null ? null : String(e.entityId), ip_hash: e.ipHash || null, meta: clean(e.meta) };
  const prev = last ? last.hash : null, hash = chainHash(prev, row);
  await c.query('INSERT INTO audit_logs (at, actor_type, actor_id, action, entity_type, entity_id, ip_hash, meta, prev_hash, hash) VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10)',
    [row.at, row.actor_type, row.actor_id, row.action, row.entity_type, row.entity_id, row.ip_hash, JSON.stringify(row.meta), prev, hash]);
}
// Recomputes the whole chain. Returns { ok, checked, brokenAtId }.
async function verifyChain(db, batch = 500) {
  let prev = null, checked = 0, after = 0;
  for (;;) {
    const rows = (await db.query('SELECT id, at, actor_type, actor_id, action, entity_type, entity_id, ip_hash, meta, prev_hash, hash FROM audit_logs WHERE id > $1 ORDER BY id LIMIT $2', [after, batch])).rows;
    if (!rows.length) return { ok: true, checked };
    for (const r of rows) {
      const row = { at: new Date(r.at).toISOString(), actor_type: r.actor_type, actor_id: r.actor_id, action: r.action, entity_type: r.entity_type, entity_id: r.entity_id, ip_hash: r.ip_hash, meta: r.meta };
      const prevOk = (prev === null && r.prev_hash === null) || (prev !== null && r.prev_hash && Buffer.compare(prev, r.prev_hash) === 0);
      if (!prevOk || Buffer.compare(chainHash(prev, row), r.hash) !== 0) return { ok: false, checked, brokenAtId: Number(r.id) };
      prev = r.hash; checked++; after = r.id;
    }
  }
}
module.exports = { writeAudit, verifyChain, chainHash, stable };
