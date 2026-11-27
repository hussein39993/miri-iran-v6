'use strict';
// Admin authentication for the wallet admin panel. Secrets come ONLY from environment variables (Render), never from GitHub.
//   WALLET_ADMIN_USER           admin user name (default "admin")
//   WALLET_ADMIN_PASSWORD_HASH  made with: node tools/make-admin-hash.js
//   WALLET_ADMIN_SECRET         random string (32+ chars) used to sign session cookies
//   WALLET_ADMIN_SESSION_MIN    session length in minutes (default 120, 10..720)
const crypto = require('crypto');
const { AppError } = require('../errors');

const b64u = b => Buffer.from(b).toString('base64url');
const scrypt = (pw, salt, N) => new Promise((ok, bad) => crypto.scrypt(pw, salt, 64, { N, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }, (e, k) => (e ? bad(e) : ok(k))));
async function hashPassword(pw) { const salt = crypto.randomBytes(16), N = 16384; return ['scrypt', N, b64u(salt), b64u(await scrypt(String(pw), salt, N))].join('.'); }
function parseHash(s) {
  const p = String(s || '').split('.'); if (p.length !== 4 || p[0] !== 'scrypt') return null;
  const N = Number(p[1]); if (N !== 16384 && N !== 32768) return null;
  try { const salt = Buffer.from(p[2], 'base64url'), key = Buffer.from(p[3], 'base64url'); return salt.length >= 16 && key.length === 64 ? { N, salt, key } : null; } catch (_) { return null; }
}
async function verifyPassword(pw, stored) { const h = parseHash(stored); if (!h) return false; return crypto.timingSafeEqual(await scrypt(String(pw), h.salt, h.N), h.key); }
const digest = s => crypto.createHash('sha256').update(String(s)).digest();

function createAuth(env = process.env, o = {}) {
  const now = o.now || Date.now;
  const user = String(env.WALLET_ADMIN_USER || 'admin').slice(0, 40), hash = String(env.WALLET_ADMIN_PASSWORD_HASH || ''), secret = String(env.WALLET_ADMIN_SECRET || '');
  const configured = !!parseHash(hash) && secret.length >= 32;
  const sessMs = Math.min(720, Math.max(10, Number(env.WALLET_ADMIN_SESSION_MIN) || 120)) * 60000;
  const sv = crypto.createHash('sha256').update(hash).digest('base64url').slice(0, 10); // changing the password invalidates old sessions
  const sign = s => crypto.createHmac('sha256', secret).update(s).digest('base64url');
  const fails = new Map(), WINDOW = 15 * 60000, MAX_FAILS = 5;

  function throttle(ip) {
    const f = fails.get(ip);
    if (f && now() - f.first >= WINDOW) fails.delete(ip);
    else if (f && f.count >= MAX_FAILS) throw new AppError(429, 'LOGIN_LOCKED', 'Too many failed attempts. Try again in 15 minutes.');
  }
  function fail(ip) {
    if (fails.size > 1000) for (const [k, v] of fails) if (now() - v.first >= WINDOW) fails.delete(k);
    const f = fails.get(ip); if (f && now() - f.first < WINDOW) f.count++; else fails.set(ip, { count: 1, first: now() });
  }
  async function login(username, password, ip) {
    if (!configured) throw new AppError(503, 'ADMIN_NOT_CONFIGURED', 'Admin login is not configured on the server.');
    throttle(ip);
    const userOk = crypto.timingSafeEqual(digest(String(username || '').slice(0, 100)), digest(user));
    const passOk = await verifyPassword(String(password || '').slice(0, 200), hash); // always computed, so timing does not reveal the user name
    if (!(userOk && passOk)) { fail(ip); throw new AppError(401, 'INVALID_CREDENTIALS', 'Wrong username or password.'); }
    fails.delete(ip);
    const exp = now() + sessMs, body = b64u(JSON.stringify({ u: user, exp, sv, r: 'rates_admin' }));
    return { token: body + '.' + sign(body), exp, user };
  }
  function verify(token) {
    if (!configured || typeof token !== 'string') return null;
    const i = token.indexOf('.'); if (i < 1) return null;
    const body = token.slice(0, i), sig = Buffer.from(token.slice(i + 1)), want = Buffer.from(sign(body));
    if (sig.length !== want.length || !crypto.timingSafeEqual(sig, want)) return null;
    try { const p = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')); return p && p.exp > now() && p.sv === sv && p.r === 'rates_admin' ? { user: p.u, role: p.r, exp: p.exp } : null; } catch (_) { return null; }
  }
  const cookie = req => { const m = /(?:^|;\s*)mi_admin=([A-Za-z0-9_.-]+)/.exec(String(req.headers.cookie || '')); return m ? m[1] : ''; };
  const isHttps = req => !!(req.socket && req.socket.encrypted) || String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim() === 'https';
  const setCookie = (req, token, exp) => 'mi_admin=' + token + '; HttpOnly; SameSite=Strict; Path=/api/admin; Max-Age=' + Math.max(1, Math.floor((exp - now()) / 1000)) + (isHttps(req) ? '; Secure' : '');
  const clearCookie = req => 'mi_admin=; HttpOnly; SameSite=Strict; Path=/api/admin; Max-Age=0' + (isHttps(req) ? '; Secure' : '');
  function session(req) { const s = verify(cookie(req)); if (!s) throw new AppError(401, 'NOT_LOGGED_IN', 'Please log in.'); return s; }
  // Extra CSRF protection for every state-changing request: custom header + same-origin check (on top of SameSite=Strict).
  function csrf(req) {
    if (req.headers['x-miri-admin'] !== '1') throw new AppError(403, 'CSRF_BLOCKED', 'Missing admin header.');
    const sf = req.headers['sec-fetch-site']; if (sf && sf !== 'same-origin') throw new AppError(403, 'CSRF_BLOCKED', 'Cross-site request refused.');
    const o = req.headers.origin; if (o) { let h = ''; try { h = new URL(o).host; } catch (_) { /* invalid */ } if (h !== req.headers.host) throw new AppError(403, 'CSRF_BLOCKED', 'Cross-origin request refused.'); }
  }
  return { configured, user, login, session, csrf, setCookie, clearCookie };
}
module.exports = { createAuth, hashPassword, verifyPassword, parseHash };
