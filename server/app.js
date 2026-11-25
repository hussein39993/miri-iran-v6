'use strict';
const fs = require('fs'), path = require('path');
const { AppError, toBody } = require('./errors');
const { liveProblems } = require('./config');
const { validateFlightSearch, todayIn } = require('./validate');
const { createLogger } = require('./redact');
const mock = require('./providers/mock');
const { Charter724Adapter } = require('./charter724/adapter');
const ROOT = path.resolve(__dirname, '..');
const STATIC_OK = /^\/(index\.html|styles\.css|js\/[A-Za-z0-9_.-]+\.js)$/; // allowlist: nothing else is ever served
const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8' };
const SEC = { 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY', 'Referrer-Policy': 'no-referrer' };

function createApp(cfg, deps = {}) {
  const logger = deps.logger || createLogger(), mapping = deps.mapping || JSON.parse(fs.readFileSync(path.join(__dirname, 'charter724', 'mapping.json'), 'utf8'));
  const c724 = deps.charter724 || new Charter724Adapter({ cfg, mapping, fetchImpl: deps.fetchImpl, logger, now: deps.now });
  const problems = liveProblems(cfg, c724.isConfigured()), liveReady = cfg.mode === 'live' && problems.length === 0;
  const hits = new Map();
  const json = (res, status, obj) => { const b = JSON.stringify(obj); res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...SEC }); res.end(b); };
  const limited = ip => { const n = Date.now(), h = hits.get(ip); if (!h || n > h.reset) { hits.set(ip, { count: 1, reset: n + 60000 }); return false; } return ++h.count > cfg.rateLimitPerMin; };
  const readJson = req => new Promise((ok, bad) => {
    let size = 0; const chunks = [];
    req.on('data', d => { size += d.length; if (size > 10240) { bad(new AppError(413, 'PAYLOAD_TOO_LARGE', 'Request body is too large.')); req.destroy(); } else chunks.push(d); });
    req.on('end', () => { try { ok(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {}); } catch (_) { bad(new AppError(400, 'INVALID_JSON', 'Request body is not valid JSON.')); } });
    req.on('error', () => bad(new AppError(400, 'BAD_REQUEST', 'Could not read the request.')));
  });
  function txGuard() {
    if (cfg.mode !== 'live') throw new AppError(403, 'DEMO_MODE', 'Real bookings, ticketing, payments and refunds are disabled in demo mode.');
    if (!cfg.allowLiveTransactions) throw new AppError(403, 'TRANSACTIONS_DISABLED', 'Live transactions are switched off (ALLOW_LIVE_TRANSACTIONS is not true).');
    if (String(cfg.charter724.username).toLowerCase() === 'demo' && !cfg.charter724.sandboxConfirmed) throw new AppError(403, 'SANDBOX_NOT_CONFIRMED', 'The demo account may not run real transactions unless the provider confirms a sandbox.');
    throw new AppError(501, 'NOT_IMPLEMENTED', 'This operation is intentionally not implemented yet (reservation, payment, ticketing and refunds are disabled).');
  }
  async function route(req, res) {
    const u = new URL(req.url, 'http://x'), p = u.pathname, m = req.method;
    if (p.startsWith('/api/')) {
      if (limited(req.socket.remoteAddress || 'unknown')) throw new AppError(429, 'RATE_LIMITED', 'Too many requests. Try again in a minute.');
      if (p === '/api/health' && m === 'GET') return json(res, 200, { ok: true, mode: cfg.mode, liveFlights: liveReady, providerConfigured: c724.isConfigured() });
      if (p === '/api/config' && m === 'GET') return json(res, 200, { mode: cfg.mode, liveFlights: liveReady, notice: liveReady ? 'live' : 'demo', ...(cfg.mode === 'live' && !liveReady ? { liveUnavailableReasons: problems.map(x => x.replace(/=.*/, '')) } : {}) });
      if (p === '/api/flights/search') {
        if (m !== 'POST') throw new AppError(405, 'METHOD_NOT_ALLOWED', 'Use POST.');
        const q = validateFlightSearch(await readJson(req), todayIn(cfg.timezone));
        if (cfg.mode !== 'live') return json(res, 200, { source: 'demo', fictional: true, results: await mock.searchFlights(q) });
        if (!liveReady) throw new AppError(503, 'PROVIDER_NOT_CONFIGURED', 'Live flight search is not configured.');
        const r = await c724.searchFlights(q), round = q.trip === 'round';
        return json(res, 200, { source: 'charter724', fictional: false, trip: q.trip, results: r.outbound, ...(round ? { returnResults: r.inbound } : {}), empty: r.outbound.length === 0 || (round && r.inbound.length === 0), meta: r.meta });
      }
      if (p === '/api/airports') {
        if (m !== 'GET') throw new AppError(405, 'METHOD_NOT_ALLOWED', 'Use GET.');
        if (cfg.mode !== 'live') return json(res, 200, { source: 'demo', fictional: true, airports: await mock.airports() });
        if (!liveReady || !c724.isAirportsConfigured()) throw new AppError(503, 'PROVIDER_NOT_CONFIGURED', 'Live airport list is not configured.');
        return json(res, 200, { source: 'charter724', fictional: false, airports: await c724.getAirports() });
      }
      if (['/api/bookings', '/api/tickets/issue', '/api/refunds'].includes(p)) { if (m !== 'POST') throw new AppError(405, 'METHOD_NOT_ALLOWED', 'Use POST.'); return txGuard(); }
      throw new AppError(404, 'NOT_FOUND', 'Unknown API route.');
    }
    if (cfg.serveStatic && m === 'GET') {
      const rel = p === '/' ? '/index.html' : p;
      if (STATIC_OK.test(rel)) { const f = path.join(ROOT, rel); if (f.startsWith(ROOT) && fs.existsSync(f)) { res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream', ...SEC }); return fs.createReadStream(f).pipe(res); } }
    }
    throw new AppError(404, 'NOT_FOUND', 'Not found.');
  }
  const handler = (req, res) => route(req, res).catch(e => {
    const err = e instanceof AppError ? e : new AppError(500, 'INTERNAL_ERROR', 'Unexpected server error.');
    if (!(e instanceof AppError)) logger.error('unhandled error', { name: e && e.name, message: e && e.message });
    if (!res.headersSent) json(res, err.status, toBody(err));
  });
  return { handler, state: { liveReady, problems } };
}
module.exports = { createApp };
