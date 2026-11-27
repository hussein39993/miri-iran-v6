'use strict';
// Persistent storage for exchange rates + the change history. One JSON document: { version, current, history[] }.
// Choose with environment variables on Render:
//   UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN  -> Upstash Redis (free plan, survives restarts/redeploys)  [recommended]
//   WALLET_DATA_FILE (+ WALLET_STORE_DURABLE=true)      -> JSON file; durable ONLY if the path is on a Render Persistent Disk (paid)
//   nothing set                                         -> JSON file in server/data/ = NOT durable on Render (admin page shows a warning)
const fs = require('fs'), path = require('path');
const EMPTY = () => ({ version: 0, current: null, history: [] });
const shape = s => { if (!s || typeof s !== 'object' || !Array.isArray(s.history)) throw new Error('STORE_CORRUPT'); return { version: Number(s.version) || 0, current: s.current || null, history: s.history }; };

function fileStore(file, durable) {
  return {
    info: { kind: 'file', durable: !!durable },
    async read() { try { return shape(JSON.parse(fs.readFileSync(file, 'utf8'))); } catch (e) { if (e && e.code === 'ENOENT') return EMPTY(); throw e; } },
    async write(state) { fs.mkdirSync(path.dirname(file), { recursive: true }); const tmp = file + '.tmp'; fs.writeFileSync(tmp, JSON.stringify(state)); fs.renameSync(tmp, file); }
  };
}
function memoryStore() { let s = EMPTY(); return { info: { kind: 'memory', durable: false }, async read() { return JSON.parse(JSON.stringify(s)); }, async write(n) { s = JSON.parse(JSON.stringify(n)); } }; }
function upstashStore(url, token, fetchImpl, key = 'miri:wallet:rates:v1') {
  const f = fetchImpl || fetch;
  async function cmd(args) {
    const ctl = new AbortController(), tm = setTimeout(() => ctl.abort(), 6000);
    try {
      const r = await f(url, { method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }, body: JSON.stringify(args), signal: ctl.signal });
      const j = await r.json(); if (!r.ok || j.error) throw new Error('UPSTASH_ERROR');
      return j.result;
    } finally { clearTimeout(tm); }
  }
  return {
    info: { kind: 'upstash', durable: true },
    async read() { const v = await cmd(['GET', key]); return v == null ? EMPTY() : shape(JSON.parse(v)); },
    async write(state) { if ((await cmd(['SET', key, JSON.stringify(state)])) !== 'OK') throw new Error('UPSTASH_WRITE_FAILED'); }
  };
}
function createStore(env = process.env, o = {}) {
  if (env.UPSTASH_REDIS_REST_URL && env.UPSTASH_REDIS_REST_TOKEN) return upstashStore(String(env.UPSTASH_REDIS_REST_URL).replace(/\/+$/, ''), env.UPSTASH_REDIS_REST_TOKEN, o.fetchImpl);
  if (env.WALLET_DATA_FILE) return fileStore(path.resolve(env.WALLET_DATA_FILE), env.WALLET_STORE_DURABLE === 'true');
  return fileStore(path.join(__dirname, '..', 'data', 'wallet-rates.json'), false);
}
module.exports = { createStore, fileStore, memoryStore, upstashStore };
