'use strict';
const fs = require('fs'), path = require('path');
const { AppError, toBody } = require('./errors');
const { liveProblems } = require('./config');
const { validateFlightSearch, todayIn } = require('./validate');
const { createLogger } = require('./redact');
const mock = require('./providers/mock');
const { Charter724Adapter } = require('./charter724/adapter');
const { createCors } = require('./cors');
const { createRechargeHandler } = require('./recharge/handler'); // read-only recharge catalog (no recharge, payment or wallet)
const BUILD = '2026-11-26-cors-1'; // shown by /api/health so you can confirm which version Render is running
const ROOT = path.resolve(__dirname, '..');
const STATIC_OK = /^\/(index\.html|styles\.css|js\/[A-Za-z0-9_.-]+\.js)$/; // allowlist: nothing else is ever served
const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8' };
const SEC = { 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY', 'Referrer-Policy': 'no-referrer' };

function createApp(cfg, deps = {}) {
  const logger = deps.logger || createLogger(), mapping = deps.mapping || JSON.parse(fs.readFileSync(path.join(__dirname, 'charter724', 'mapping.json'), 'utf8'));
  const c724 = deps.charter724 || new Charter724Adapter({ cfg, mapping, fetchImpl: deps.fetchImpl, logger, now: deps.now });
  const problems = liveProblems(cfg, c724.isConfigured()), liveReady = cfg.mode === 'live' && problems.length === 0;
  const cors = createCors({ origins: deps.corsOrigins });
  const recharge = deps.rechargeHandler || createRechargeHandler();
  // Behind Render's proxy every visitor shares the proxy's IP, so the rate limit would be shared by ALL visitors. On Render (or TRUST_PROXY=true) use the visitor IP from X-Forwarded-For.
  const trustProxy = deps.trustProxy !== undefined ? deps.trustProxy : (process.env.TRUST_PROXY === 'true' || process.env.RENDER === 'true');
  const clientIp = req => { if (trustProxy) { const x = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim(); if (/^[0-9a-fA-F:.]{3,45}$/.test(x)) return x; } return req.socket.remoteAddress || 'unknown'; };
  const hits = new Map();
  const json = (res, status, obj) => { const b = JSON.stringify(obj); res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...SEC }); res.end(b); };
  const limited = ip => { const n = Date.now(); if (hits.size > 2000) for (const [k, v] of hits) if (n > v.reset) hits.delete(k); const h = hits.get(ip); if (!h || n > h.reset) { hits.set(ip, { count: 1, reset: n + 60000 }); return false; } return ++h.count > cfg.rateLimitPerMin; };
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
      if (limited(clientIp(req))) { res.setHeader('Retry-After', '60'); throw new AppError(429, 'RATE_LIMITED', 'Too many requests. Try again in a minute.'); }
      if (p === '/api/health' && m === 'GET') return json(res, 200, { ok: true, build: BUILD, cors: true, mode: cfg.mode, liveFlights: liveReady, providerConfigured: c724.isConfigured() });
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
      if (p === '/api/recharge' || p.startsWith('/api/recharge/')) { // GET /api/recharge/catalog only; runs after the rate limit, CORS was applied in handler()
        for (const k in SEC) res.setHeader(k, SEC[k]);
        if (await recharge(req, res)) return;
      }
      throw new AppError(404, 'NOT_FOUND', 'Unknown API route.');
    }
    if (cfg.serveStatic && m === 'GET') {
      const rel = p === '/' ? '/index.html' : p;
      if (STATIC_OK.test(rel)) { const f = path.join(ROOT, rel); if (f.startsWith(ROOT) && fs.existsSync(f)) { res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream', ...SEC }); return fs.createReadStream(f).pipe(res); } }
    }
    throw new AppError(404, 'NOT_FOUND', 'Not found.');
  }
  const handler = (req, res) => { if (cors.apply(req, res)) return; route(req, res).catch(e => {
    const err = e instanceof AppError ? e : new AppError(500, 'INTERNAL_ERROR', 'Unexpected server error.');
    if (!(e instanceof AppError)) logger.error('unhandled error', { name: e && e.name, message: e && e.message });
    if (!res.headersSent) json(res, err.status, toBody(err));
  }); };
  return { handler, state: { liveReady, problems, corsOrigins: cors.origins, corsIgnored: cors.ignored } };
}
module.exports = { createApp };
