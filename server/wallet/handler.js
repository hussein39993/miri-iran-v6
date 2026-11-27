'use strict';
// Wallet API (Stage 2). Public: GET /api/wallet/rates. Admin (cookie session + CSRF header, same-origin only):
//   POST /api/admin/login | logout, GET /api/admin/me | rates | history, POST /api/admin/preview | rates
// Rates are stored on the backend only. Nothing here credits balances, converts money or talks to a payment provider.
const fs = require('fs'), path = require('path');
const MIW = require('../../js/wallet-core.js');
const { AppError } = require('../errors');
const { createAuth } = require('./auth');
const { createStore } = require('./store');

const UI_DIR = path.join(__dirname, 'ui');
const UI_FILES = { '/admin': ['admin.html', 'text/html; charset=utf-8'], '/admin/': ['admin.html', 'text/html; charset=utf-8'], '/admin/app.js': ['admin.js', 'text/javascript; charset=utf-8'], '/admin/admin.css': ['admin.css', 'text/css; charset=utf-8'] };
const UI_HEADERS = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY', 'Referrer-Policy': 'no-referrer', 'X-Robots-Tag': 'noindex, nofollow',
  'Content-Security-Policy': "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'" };

function createWalletHandler(o = {}) {
  const env = o.env || process.env, now = o.now || Date.now, logger = o.logger || {};
  const log = (lvl, msg, meta) => { try { if (logger[lvl]) logger[lvl](msg, meta); } catch (_) { /* logging must never break a request */ } };
  const store = o.store || createStore(env, { fetchImpl: o.fetchImpl });
  const auth = o.auth || createAuth(env, { now });
  let cache = null, chain = Promise.resolve();
  const lock = fn => { const run = chain.then(fn, fn); chain = run.catch(() => { }); return run; }; // one write at a time

  async function readState(force) {
    if (!force && cache && now() - cache.at < 10000) return cache.state;
    try { const state = await store.read(); cache = { at: now(), state }; return state; }
    catch (e) {
      log('error', 'wallet store read failed', { message: e && e.message });
      if (!force && cache && now() - cache.at < 120000) return cache.state; // expiry is computed from the document, so a short-lived cache can never extend a rate
      throw new AppError(503, 'RATES_UNAVAILABLE', 'Exchange rates are temporarily unavailable.');
    }
  }
  const secondsLeft = doc => Math.floor((Date.parse(doc.validUntil) - now()) / 1000);
  // Customers never receive an expired or missing rate.
  function publicView(doc) {
    const base = { serverTime: new Date(now()).toISOString() };
    if (!doc) return { status: 'unavailable', ...base };
    const left = secondsLeft(doc);
    if (!(left > 0)) return { status: 'expired', version: doc.version, updatedAt: doc.updatedAt, validUntil: doc.validUntil, ...base };
    return { status: 'ok', version: doc.version, updatedAt: doc.updatedAt, validUntil: doc.validUntil, secondsLeft: left, per: doc.per, buy: doc.buy, sell: doc.sell, fees: doc.fees, limits: doc.limits, source: 'admin', ...base };
  }
  function adminView(doc) {
    const left = doc ? secondsLeft(doc) : 0;
    return { status: !doc ? 'unavailable' : left > 0 ? 'ok' : 'expired', secondsLeft: Math.max(0, left), current: doc || null, derived: doc ? MIW.derivedTable(doc) : [],
      storage: { ...store.info, warning: store.info.durable ? '' : 'NOT_DURABLE' } };
  }
  const bodyOf = async (req, ctx) => { const b = await ctx.readJson(req); if (!b || typeof b !== 'object' || Array.isArray(b)) throw new AppError(400, 'INVALID_JSON', 'Expected a JSON object.'); return b; };
  const needMethod = (req, m) => { if (req.method !== m) throw new AppError(405, 'METHOD_NOT_ALLOWED', 'Use ' + m + '.'); };
  const validation = (ctx, res, errors) => ctx.json(res, 400, { error: { code: 'VALIDATION', message: 'Some values are not valid.', fields: errors } });

  // Returns true when the request was handled.
  async function handle(req, res, ctx) {
    const p = new URL(req.url, 'http://x').pathname;
    if (p === '/api/wallet/rates') { needMethod(req, 'GET'); ctx.json(res, 200, publicView((await readState()).current)); return true; }
    if (!p.startsWith('/api/admin/')) return false;
    if (!auth.configured) throw new AppError(503, 'ADMIN_NOT_CONFIGURED', 'Admin login is not configured on the server.');
    const route = p.slice('/api/admin/'.length);
    if (route === 'login') {
      needMethod(req, 'POST'); auth.csrf(req); const b = await bodyOf(req, ctx);
      const s = await auth.login(b.username, b.password, ctx.ip);
      res.setHeader('Set-Cookie', auth.setCookie(req, s.token, s.exp)); log('info', 'wallet admin login', { user: s.user });
      ctx.json(res, 200, { ok: true, user: s.user, expiresAt: new Date(s.exp).toISOString() }); return true;
    }
    if (route === 'logout') { needMethod(req, 'POST'); auth.csrf(req); res.setHeader('Set-Cookie', auth.clearCookie(req)); ctx.json(res, 200, { ok: true }); return true; }
    const sess = auth.session(req); // every route below needs a valid admin session (checked on the server)
    if (route === 'me') { needMethod(req, 'GET'); ctx.json(res, 200, { user: sess.user, expiresAt: new Date(sess.exp).toISOString() }); return true; }
    if (route === 'rates' && req.method === 'GET') { ctx.json(res, 200, adminView((await readState(true)).current)); return true; }
    if (route === 'history') {
      needMethod(req, 'GET'); const lim = Math.min(100, Math.max(1, Number(new URL(req.url, 'http://x').searchParams.get('limit')) || 50));
      ctx.json(res, 200, { history: (await readState(true)).history.slice(0, lim) }); return true;
    }
    if (route === 'preview') { // validation + calculated cross rates, nothing is saved
      needMethod(req, 'POST'); auth.csrf(req); const b = await bodyOf(req, ctx), st = await readState(true);
      const ok = MIW.validateRatesInput({ ...b, confirmLargeChange: true }, st.current, now(), sess.user);
      const warn = MIW.validateRatesInput({ ...b, confirmLargeChange: false }, st.current, now(), sess.user).errors.filter(e => e.code === 'largeChange');
      ctx.json(res, 200, { ok: ok.ok, errors: ok.errors, warnings: warn, derived: ok.ok ? MIW.derivedTable(ok.doc) : [], roundTripFactor: ok.ok ? MIW.roundTripFactor(ok.doc) : null }); return true;
    }
    if (route === 'rates' && req.method === 'POST') {
      auth.csrf(req); const b = await bodyOf(req, ctx);
      return lock(async () => {
        const st = await readState(true), v = MIW.validateRatesInput(b, st.current, now(), sess.user);
        if (!v.ok) { validation(ctx, res, v.errors); return true; }
        const doc = { ...v.doc, version: (st.current ? st.current.version : 0) + 1 };
        const entry = { id: (st.history[0] ? st.history[0].id : 0) + 1, at: doc.updatedAt, by: sess.user, action: 'publish', ip: ctx.ip, before: st.current, after: doc };
        const next = { version: (st.version || 0) + 1, current: doc, history: [entry, ...st.history].slice(0, 500) };
        try { await store.write(next); } catch (e) { log('error', 'wallet store write failed', { message: e && e.message }); throw new AppError(503, 'STORAGE_ERROR', 'Could not save. Nothing was published.'); }
        cache = { at: now(), state: next }; log('info', 'wallet rates published', { version: doc.version, by: sess.user });
        ctx.json(res, 200, { ok: true, ...adminView(doc) }); return true;
      });
    }
    throw new AppError(404, 'NOT_FOUND', 'Unknown API route.');
  }
  // Serves the admin page (fixed allowlist of 3 files, always, independent of the static-file setting).
  function serveUi(p, res) {
    const f = UI_FILES[p]; if (!f) return false;
    let data; try { data = fs.readFileSync(path.join(UI_DIR, f[0])); } catch (_) { return false; }
    res.writeHead(200, { 'Content-Type': f[1], ...UI_HEADERS }); res.end(data); return true;
  }
  return { handle, serveUi, publicView, store, auth };
}
module.exports = { createWalletHandler };
