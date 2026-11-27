'use strict';
// Native Node.js HTTP (no Express) READ-ONLY recharge catalog:  GET /api/recharge/catalog?country=IR|IQ&operator=<id>
// No POST/PUT/DELETE, no recharge, no payment, no wallet. Credentials stay inside the adapters (server env only).
// Usage inside the existing request handler:  if (await rechargeHandler(req, res)) return;   (true = request was handled here)
const { createRegistry } = require('./registry');
const { RechargeError, validateCatalog, CURRENCY } = require('./adapters/BaseAdapter');
const PREFIX = '/api/recharge';
const OPERATOR_COUNTRY = { mci: 'IR', irancell: 'IR', rightel: 'IR', asiacell: 'IQ', zain: 'IQ', korek: 'IQ' };
const STATUS = { NOT_INTEGRATED: 501, SUPPLIER_UNAVAILABLE: 503 };

function createRechargeHandler(opts = {}) {
  const registry = opts.registry || createRegistry(), ttlMs = opts.ttlMs || 5 * 60 * 1000, cache = new Map();
  const send = (res, status, body, extra) => {
    if (res.headersSent) return;
    const data = JSON.stringify(body);
    res.writeHead(status, Object.assign({ 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(data), 'Cache-Control': 'no-store' }, extra));
    res.end(data);
  };
  return async function rechargeHandler(req, res) {
    let url;
    try { url = new URL(req.url || '/', 'http://localhost'); } catch (e) { return false; }
    const path = url.pathname.replace(/\/+$/, '');
    if (path !== PREFIX && !path.startsWith(PREFIX + '/')) return false; // not ours: existing routes keep working untouched
    if (path !== PREFIX + '/catalog') { send(res, 404, { ok: false, code: 'NOT_FOUND' }); return true; }
    if (req.method !== 'GET') { send(res, 405, { ok: false, code: 'METHOD_NOT_ALLOWED' }, { Allow: 'GET' }); return true; }
    const country = url.searchParams.get('country') || '', operator = url.searchParams.get('operator') || '';
    if (!CURRENCY[country] || OPERATOR_COUNTRY[operator] !== country) { send(res, 400, { ok: false, code: 'BAD_REQUEST' }); return true; }
    const adapter = registry.forOperator(operator);
    if (!adapter) { send(res, 501, { ok: false, code: 'NOT_INTEGRATED' }); return true; }
    const key = country + '|' + operator, hit = cache.get(key);
    try {
      let data;
      if (hit && Date.now() - hit.t < ttlMs) data = hit.data;
      else { data = validateCatalog(await adapter.getCatalog({ operator })); cache.set(key, { t: Date.now(), data }); }
      // 'source: supplier' is only ever set here, after an adapter really returned validated data.
      send(res, 200, Object.assign({ ok: true, source: 'supplier', fictional: false, country, operator, currency: CURRENCY[country] }, data));
    } catch (e) {
      const code = e instanceof RechargeError ? e.code : 'SUPPLIER_ERROR';
      console.error('[recharge] catalog failed:', adapter.id, code); // code only: no credentials, no upstream bodies
      send(res, STATUS[code] || 502, { ok: false, code: STATUS[code] ? code : 'SUPPLIER_ERROR' });
    }
    return true;
  };
}
module.exports = { createRechargeHandler, rechargeHandler: createRechargeHandler() };
