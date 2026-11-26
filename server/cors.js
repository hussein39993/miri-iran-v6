'use strict';
// CORS for the browser front end (GitHub Pages) talking to this API (Render).
// - Exact-match allowlist of origins (never "*"), echoed back with "Vary: Origin".
// - OPTIONS preflight answered here, before routing and rate limiting.
// - Headers are set at the very start of every request, so they are also on error answers (400/403/404/405/429/500/501/503).
// - No cookies/credentials are used, so Access-Control-Allow-Credentials is never sent.
const DEFAULT_ORIGINS = ['https://hussein39993.github.io', 'https://miri-iran-v6.onrender.com'];
const METHODS = 'GET, POST, OPTIONS';
const DEFAULT_HEADERS = 'Content-Type, Accept';

// "https://host" or "http://host:port" only (no path, no wildcard). Anything else is ignored.
function normalizeOrigin(s) {
  const v = String(s || '').trim().replace(/\/+$/, '').toLowerCase();
  return /^https?:\/\/[a-z0-9]([a-z0-9.-]*[a-z0-9])?(:\d{1,5})?$/.test(v) ? v : null;
}
function parseOrigins(extra) {
  const set = new Set(DEFAULT_ORIGINS.map(normalizeOrigin)); const ignored = [];
  for (const raw of Array.isArray(extra) ? extra : String(extra || '').split(',')) { if (!String(raw).trim()) continue; const n = normalizeOrigin(raw); if (n) set.add(n); else ignored.push(String(raw).trim()); }
  return { set, ignored };
}
function createCors({ origins, env = process.env } = {}) {
  const { set, ignored } = parseOrigins(origins !== undefined ? origins : env.CORS_ORIGINS);
  const sameHost = (origin, req) => { try { return new URL(origin).host.toLowerCase() === String(req.headers.host || '').toLowerCase(); } catch (_) { return false; } };
  const allowedFor = (origin, req) => { const o = normalizeOrigin(origin); return !!o && (set.has(o) || sameHost(o, req)); };
  const requestedHeaders = req => { const raw = String(req.headers['access-control-request-headers'] || ''); const t = raw.split(',').map(x => x.trim()).filter(Boolean); return t.length && t.length <= 12 && t.every(x => /^[A-Za-z0-9-]{1,60}$/.test(x)) ? t.join(', ') : DEFAULT_HEADERS; };
  // Returns true when the request was fully answered here (an OPTIONS request).
  function apply(req, res) {
    const origin = req.headers.origin, allowed = origin ? allowedFor(origin, req) : false;
    res.setHeader('Vary', 'Origin');
    if (origin && allowed) { res.setHeader('Access-Control-Allow-Origin', normalizeOrigin(origin) ? origin : ''); res.setHeader('Access-Control-Expose-Headers', 'Retry-After'); }
    if (req.method !== 'OPTIONS') return false;
    const base = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };
    if (!origin) { res.writeHead(204, { ...base, Allow: METHODS, 'Content-Length': '0' }); res.end(); return true; }
    if (!allowed) { const b = JSON.stringify({ error: { code: 'CORS_ORIGIN_NOT_ALLOWED', message: 'This website address is not allowed to call this API.' } }); res.writeHead(403, { ...base, 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(b) }); res.end(b); return true; }
    res.writeHead(204, { ...base, 'Access-Control-Allow-Methods': METHODS, 'Access-Control-Allow-Headers': requestedHeaders(req), 'Access-Control-Max-Age': '600', 'Content-Length': '0' }); res.end(); return true;
  }
  return { apply, origins: [...set], ignored };
}
module.exports = { createCors, normalizeOrigin, DEFAULT_ORIGINS };
