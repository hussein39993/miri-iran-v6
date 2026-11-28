'use strict';
// Fixed-window rate limiter. Redis (Upstash) when available, otherwise in-memory (single instance; flagged "memory").
// Keys are HMAC fingerprints, so neither e-mail addresses nor IPs are stored in Redis.
const { AppError } = require('../errors');
const S = require('./security');

function createLimiter({ redis, pepper, logger = {}, now = Date.now }) {
  const mem = new Map(); let degraded = false;
  const log = (l, m, x) => { try { if (logger[l]) logger[l](m, x); } catch (_) { /* ignore */ } };
  function memHit(key, windowSec) {
    const t = now(); if (mem.size > 5000) for (const [k, v] of mem) if (t > v.reset) mem.delete(k);
    const h = mem.get(key); if (!h || t > h.reset) { mem.set(key, { count: 1, reset: t + windowSec * 1000 }); return 1; } return ++h.count;
  }
  async function count(key, windowSec) {
    if (redis) {
      try { const n = Number(await redis.cmd(['INCR', key])); if (n === 1) await redis.cmd(['EXPIRE', key, String(windowSec)]); degraded = false; return n; }
      catch (e) { if (!degraded) log('warn', 'rate limiter: Redis unavailable, using memory fallback', { message: e && e.message }); degraded = true; }
    }
    return memHit(key, windowSec);
  }
  // Throws 429 when the limit is exceeded. Same answer for existing and non-existing accounts.
  async function hit(res, name, id, limit, windowSec) {
    const n = await count('rl:' + name + ':' + S.hashKey(pepper, id), windowSec);
    if (n > limit) { try { if (res && res.setHeader) res.setHeader('Retry-After', String(windowSec)); } catch (_) { /* ignore */ } throw new AppError(429, 'RATE_LIMITED', 'Too many attempts. Please wait and try again.'); }
  }
  async function reset(name, id) { const key = 'rl:' + name + ':' + S.hashKey(pepper, id); mem.delete(key); if (redis) { try { await redis.cmd(['DEL', key]); } catch (_) { /* best effort */ } } }
  return { hit, reset, mode: () => (redis ? (degraded ? 'memory-fallback' : 'redis') : 'memory') };
}
module.exports = { createLimiter };
