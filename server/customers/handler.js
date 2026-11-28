'use strict';
// HTTP layer for accounts (Stage 3A). Customer API: JSON + "Authorization: Bearer <token>" (no cookies, so it works from GitHub Pages).
// Only GET/POST are used (the CORS allow-list permits those). Admin routes reuse the Stage 2 admin session (cookie + CSRF header, same-origin).
const { AppError } = require('../errors');
const { loadAccountsConfig } = require('./config');
const { createRedis } = require('../lib/redis');
const { createLimiter } = require('./limits');
const { createMailer } = require('./mailer');
const { createService } = require('./service');
const { repo: defaultRepo } = require('./repo');

const OWNED = /^\/api\/(auth\/|me(\/|$)|health\/db$|admin\/customers(\/|$)|admin\/sandbox\/outbox$)/;

function createAccountsHandler(o = {}) {
  const env = o.env || process.env, logger = o.logger || {}, cfg = o.cfg || loadAccountsConfig(env), adminAuth = o.adminAuth || null;
  const log = (l, m, x) => { try { if (logger[l]) logger[l](m, x); } catch (_) { /* ignore */ } };
  const state = { status: 'disabled', error: '', lastTry: 0, migrations: null };
  let db = o.db || null, service = o.service || null, limiter = o.limiter || null, repo = o.repo || defaultRepo;
  const redis = o.redis !== undefined ? o.redis : createRedis(env, o.fetchImpl);

  function build() {
    limiter = limiter || createLimiter({ redis, pepper: cfg.pepper, logger });
    const mailer = o.mailer || createMailer({ cfg, repo, logger });
    service = service || createService({ db, repo, mailer, limiter, cfg, logger });
  }
  // Connects, migrates and marks the module ready. Never throws: a database problem must never stop flights, hotels, taxis or the wallet.
  async function init() {
    if (o.db && o.service) { state.status = 'ready'; return state; } // injected (tests)
    if (!cfg.configured) { state.status = 'disabled'; log('warn', 'Accounts disabled: configuration incomplete', { problems: cfg.problems }); return state; }
    state.status = 'starting'; state.lastTry = Date.now();
    try {
      if (!db) { const { createDb } = require('../db/pool'); db = createDb({ url: cfg.databaseUrl, schema: cfg.schema, ssl: cfg.databaseSsl, logger }); }
      const m = require('../db/migrate');
      if (cfg.autoMigrate) { const r = await m.runMigrations(db, { schema: cfg.schema, logger }); log('info', 'Database migrations checked', { applied_now: r.ran.length, total: r.total }); }
      state.migrations = await m.status(db, cfg.schema);
      if (state.migrations.pending.length || state.migrations.changed.length) throw new Error('Database is not up to date (run: npm run db:migrate)');
      build(); state.status = 'ready'; state.error = '';
      log('info', 'Accounts ready (sandbox)', { schema: cfg.schema, rateLimiter: limiter.mode() });
    } catch (e) {
      state.status = 'error'; state.error = String(e && e.message || e).slice(0, 200);
      log('error', 'Accounts initialisation failed', { message: state.error });
      const t = setTimeout(() => { init().catch(() => { }); }, 20000); if (t.unref) t.unref(); // keep trying: the database may still be starting
    }
    return state;
  }
  const owns = p => OWNED.test(p);

  const bearer = req => { const m = /^Bearer\s+([A-Za-z0-9_-]{20,100})$/.exec(String(req.headers.authorization || '')); return m ? m[1] : ''; };
  const needMethod = (req, m) => { if (req.method !== m) throw new AppError(405, 'METHOD_NOT_ALLOWED', 'Use ' + m + '.'); };
  const body = async (req, ctx) => { const b = await ctx.readJson(req); if (!b || typeof b !== 'object' || Array.isArray(b)) throw new AppError(400, 'INVALID_JSON', 'Expected a JSON object.'); return b; };
  const need = () => {
    if (state.status === 'disabled') throw new AppError(503, 'ACCOUNTS_NOT_CONFIGURED', 'Customer accounts are not configured on the server yet.');
    if (state.status !== 'ready') throw new AppError(503, 'ACCOUNTS_STARTING', 'The server is getting ready. Please try again in a moment.');
  };
  // Database errors never leak details to the browser.
  const wrap = async fn => { try { return await fn(); } catch (e) { if (e instanceof AppError) throw e; log('error', 'accounts request failed', { code: e && e.code, message: String(e && e.message || '').slice(0, 160) }); throw new AppError(503, 'ACCOUNTS_UNAVAILABLE', 'Accounts are temporarily unavailable. Please try again.'); } };

  async function handle(req, res, ctx) {
    const u = new URL(req.url, 'http://x'), p = u.pathname;
    if (!owns(p)) return false;
    const c = { ip: ctx.ip, ua: req.headers['user-agent'] };
    if (p === '/api/health/db') {
      needMethod(req, 'GET');
      ctx.json(res, 200, { configured: cfg.configured, status: state.status, schema: cfg.schema, environment: 'sandbox', mail: cfg.mailMode, rateLimiter: limiter ? limiter.mode() : (redis ? 'redis' : 'memory'),
        migrations: state.migrations ? { applied: state.migrations.applied, pending: state.migrations.pending.length } : null, ...(state.status === 'error' ? { error: 'initialisation failed (see server logs)' } : {}) });
      return true;
    }
    if (p.startsWith('/api/admin/')) { // same-origin admin session from Stage 2
      if (!adminAuth || !adminAuth.configured) throw new AppError(503, 'ADMIN_NOT_CONFIGURED', 'Admin login is not configured on the server.');
      const sess = adminAuth.session(req); need();
      if (p === '/api/admin/customers' && req.method === 'GET') return ctx.json(res, 200, await wrap(() => service.adminList(u.searchParams.get('q'), u.searchParams.get('limit')))), true;
      if (p === '/api/admin/customers/status') { needMethod(req, 'POST'); adminAuth.csrf(req); const b = await body(req, ctx); return ctx.json(res, 200, await wrap(() => service.adminSetStatus(c, sess.user, b))), true; }
      if (p === '/api/admin/sandbox/outbox') { needMethod(req, 'GET'); return ctx.json(res, 200, await wrap(() => service.adminOutbox(u.searchParams.get('limit')))), true; }
      throw new AppError(404, 'NOT_FOUND', 'Unknown API route.');
    }
    need();
    const send = r => { ctx.json(res, 200, r); return true; };
    switch (p) {
      case '/api/auth/register': needMethod(req, 'POST'); return send(await wrap(async () => service.register(res, c, await body(req, ctx))));
      case '/api/auth/verify-email': needMethod(req, 'POST'); return send(await wrap(async () => service.verifyEmail(res, c, await body(req, ctx))));
      case '/api/auth/resend-verification': needMethod(req, 'POST'); return send(await wrap(async () => service.resendVerification(res, c, await body(req, ctx))));
      case '/api/auth/login': needMethod(req, 'POST'); return send(await wrap(async () => service.login(res, c, await body(req, ctx))));
      case '/api/auth/forgot-password': needMethod(req, 'POST'); return send(await wrap(async () => service.forgotPassword(res, c, await body(req, ctx))));
      case '/api/auth/reset-password': needMethod(req, 'POST'); return send(await wrap(async () => service.resetPassword(res, c, await body(req, ctx))));
      default: break;
    }
    // everything below needs a valid customer session
    const auth = await wrap(() => service.authenticate(bearer(req)));
    switch (p) {
      case '/api/auth/logout': needMethod(req, 'POST'); return send(await wrap(() => service.logout(c, auth)));
      case '/api/auth/logout-all': needMethod(req, 'POST'); return send(await wrap(() => service.logoutAll(c, auth)));
      case '/api/me': needMethod(req, 'GET'); return send(service.me(auth));
      case '/api/me/update': needMethod(req, 'POST'); return send(await wrap(async () => service.updateProfile(c, auth, await body(req, ctx))));
      case '/api/me/change-password': needMethod(req, 'POST'); return send(await wrap(async () => service.changePassword(res, c, auth, await body(req, ctx))));
      default: throw new AppError(404, 'NOT_FOUND', 'Unknown API route.');
    }
  }
  return { handle, owns, init, state, cfg, get service() { return service; } };
}
module.exports = { createAccountsHandler, OWNED };
