'use strict';
// Minimal Upstash Redis REST client (cache + rate limiting). Returns null when not configured. Never throws secrets.
function createRedis(env = process.env, fetchImpl) {
  const url = String(env.UPSTASH_REDIS_REST_URL || '').replace(/\/+$/, ''), token = String(env.UPSTASH_REDIS_REST_TOKEN || '');
  if (!url || !token) return null;
  const f = fetchImpl || fetch;
  async function cmd(args, timeoutMs = 3000) {
    const ctl = new AbortController(), tm = setTimeout(() => ctl.abort(), timeoutMs);
    try {
      const r = await f(url, { method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }, body: JSON.stringify(args), signal: ctl.signal });
      const j = await r.json(); if (!r.ok || j.error) throw new Error('REDIS_ERROR');
      return j.result;
    } finally { clearTimeout(tm); }
  }
  return { cmd };
}
module.exports = { createRedis };
