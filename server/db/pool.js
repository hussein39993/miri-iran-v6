'use strict';
// PostgreSQL access (the authoritative store for customer/financial records). Only parameterised queries are used.
// Money and sessions never live in browser storage or server memory.
const SCHEMA_RE = /^[a-z_][a-z0-9_]{0,40}$/;

// "auto": Render INTERNAL urls (host without dots, e.g. dpg-xxxx-a) and localhost need no TLS; *.render.com external urls use TLS.
function sslFor(url, mode) {
  if (mode === 'disable') return false;
  if (mode === 'require') return { rejectUnauthorized: false };
  let host = ''; try { host = new URL(url).hostname; } catch (_) { return false; }
  if (!host.includes('.') || host === 'localhost' || host === '127.0.0.1') return false;
  return host.endsWith('.render.com') ? { rejectUnauthorized: false } : { rejectUnauthorized: true };
}

function createDb({ url, schema = 'sandbox', ssl = 'auto', logger = {}, pgModule, max = 5 }) {
  if (!SCHEMA_RE.test(schema)) throw new Error('Invalid schema name');
  const pg = pgModule || require('pg');
  const log = (lvl, m, x) => { try { if (logger[lvl]) logger[lvl](m, x); } catch (_) { /* never break on logging */ } };
  const pool = new pg.Pool({ connectionString: url, max, idleTimeoutMillis: 10000, connectionTimeoutMillis: 10000, ssl: sslFor(url, ssl), application_name: 'miri-iran-v6' });
  pool.on('error', e => log('error', 'pg pool error', { message: e && e.message }));
  pool.on('connect', client => {
    client.on('error', e => log('error', 'pg client error', { message: e && e.message }));
    client.query('SET search_path TO ' + schema + ', public', err => { if (err) log('error', 'pg set search_path failed', { message: err.message }); });
    client.query('SET statement_timeout TO 15000', err => { if (err) log('error', 'pg set statement_timeout failed', { message: err.message }); });
  });
  const query = (text, params) => pool.query(text, params);
  // One atomic transaction. Serialization failures and deadlocks are retried (never partial writes).
  async function tx(fn, { retries = 2 } = {}) {
    for (let attempt = 0; ; attempt++) {
      const c = await pool.connect();
      try {
        await c.query('BEGIN');
        const out = await fn(c);
        await c.query('COMMIT');
        return out;
      } catch (e) {
        try { await c.query('ROLLBACK'); } catch (_) { /* connection may be gone */ }
        if ((e.code === '40001' || e.code === '40P01') && attempt < retries) continue;
        throw e;
      } finally { c.release(); }
    }
  }
  return { schema, query, tx, connect: () => pool.connect(), ping: () => pool.query('SELECT 1'), close: () => pool.end(), pool };
}
module.exports = { createDb, sslFor, SCHEMA_RE };
