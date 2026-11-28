'use strict';
// Plain-SQL migration runner. Files: server/db/migrations/NNNN_name.sql ("{{schema}}" is replaced by the validated schema name).
// Safe to run on every start: advisory lock (no two instances at once), one transaction per file, checksum guard (applied files must not change).
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const { SCHEMA_RE } = require('./pool');
const LOCK_ID = 727001;
const DIR = path.join(__dirname, 'migrations');

const normalize = s => s.replace(/\r\n/g, '\n'); // Windows line endings must not change the checksum
function loadMigrations(dir = DIR) {
  return fs.readdirSync(dir).filter(f => /^\d{4}_[a-z0-9_]+\.sql$/.test(f)).sort().map(f => {
    const sql = normalize(fs.readFileSync(path.join(dir, f), 'utf8'));
    return { version: Number(f.slice(0, 4)), name: f.slice(5, -4), file: f, sql, checksum: crypto.createHash('sha256').update(sql).digest('hex') };
  });
}
async function ensureTable(c, schema) {
  await c.query('CREATE SCHEMA IF NOT EXISTS ' + schema);
  await c.query('CREATE TABLE IF NOT EXISTS ' + schema + '.schema_migrations (version integer PRIMARY KEY, name text NOT NULL, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())');
}
async function status(db, schema, dir) {
  if (!SCHEMA_RE.test(schema)) throw new Error('Invalid schema name');
  const all = loadMigrations(dir), c = await db.connect();
  try {
    let applied = [];
    try { applied = (await c.query('SELECT version, checksum FROM ' + schema + '.schema_migrations ORDER BY version')).rows; } catch (e) { if (e.code !== '42P01' && e.code !== '3F000') throw e; } // table/schema not created yet
    const done = new Map(applied.map(r => [r.version, r.checksum]));
    return { applied: applied.length, pending: all.filter(m => !done.has(m.version)).map(m => m.file), changed: all.filter(m => done.has(m.version) && done.get(m.version) !== m.checksum).map(m => m.file) };
  } finally { c.release(); }
}
async function runMigrations(db, { schema = 'sandbox', dir, logger = {} } = {}) {
  if (!SCHEMA_RE.test(schema)) throw new Error('Invalid schema name');
  const log = (m, x) => { try { if (logger.info) logger.info(m, x); } catch (_) { /* ignore */ } };
  const all = loadMigrations(dir), c = await db.connect(), ran = [];
  try {
    await c.query('SELECT pg_advisory_lock($1)', [LOCK_ID]);
    try {
      await ensureTable(c, schema);
      const done = new Map((await c.query('SELECT version, checksum FROM ' + schema + '.schema_migrations')).rows.map(r => [r.version, r.checksum]));
      for (const m of all) {
        if (done.has(m.version)) { if (done.get(m.version) !== m.checksum) throw new Error('MIGRATION_CHECKSUM_MISMATCH: ' + m.file + ' was changed after it was applied. Never edit an applied migration; add a new one.'); continue; }
        await c.query('BEGIN');
        try {
          await c.query('SET LOCAL search_path TO ' + schema + ', public');
          await c.query(m.sql.replace(/\{\{schema\}\}/g, schema));
          await c.query('INSERT INTO ' + schema + '.schema_migrations (version, name, checksum) VALUES ($1, $2, $3)', [m.version, m.name, m.checksum]);
          await c.query('COMMIT');
        } catch (e) { try { await c.query('ROLLBACK'); } catch (_) { /* ignore */ } throw new Error('Migration ' + m.file + ' failed: ' + e.message); }
        ran.push(m.file); log('migration applied', { file: m.file });
      }
    } finally { try { await c.query('SELECT pg_advisory_unlock($1)', [LOCK_ID]); } catch (_) { /* connection closing releases it anyway */ } }
  } finally { c.release(); }
  return { ran, total: all.length };
}
module.exports = { runMigrations, status, loadMigrations, normalize, DIR };
