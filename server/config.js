'use strict';
const fs = require('fs'), path = require('path');
function parseEnv(text) {
  const o = {};
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim() || line.trim().startsWith('#')) continue;
    const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*?)\s*$/); if (!m) continue;
    let v = m[2]; if (/^(".*"|'.*')$/.test(v)) v = v.slice(1, -1); o[m[1]] = v;
  }
  return o;
}
function loadConfig(env = process.env, file = path.join(__dirname, '..', '.env')) {
  const fileEnv = file && fs.existsSync(file) ? parseEnv(fs.readFileSync(file, 'utf8')) : {};
  const e = { ...fileEnv, ...env }, bool = v => String(v || '').toLowerCase() === 'true';
  return {
    port: Number(e.PORT || 3000), host: e.HOST || '127.0.0.1',
    mode: e.APP_MODE === 'live' ? 'live' : 'demo', // anything except the exact value "live" means demo
    timezone: e.TIMEZONE || 'Asia/Tehran', serveStatic: e.SERVE_STATIC !== 'false', rateLimitPerMin: Number(e.RATE_LIMIT_PER_MIN || 30),
    allowLiveTransactions: bool(e.ALLOW_LIVE_TRANSACTIONS),
    charter724: { baseUrl: (e.CHARTER724_BASE_URL || '').replace(/\/+$/, ''), username: e.CHARTER724_USERNAME || '', password: e.CHARTER724_PASSWORD || '', timeoutMs: Number(e.CHARTER724_TIMEOUT_MS || 15000), sandboxConfirmed: bool(e.CHARTER724_SANDBOX_CONFIRMED) }
  };
}
// Returns a list of reasons why live mode cannot be used. Empty list = configuration is complete.
function liveProblems(cfg, adapterConfigured) {
  const p = [], c = cfg.charter724;
  if (!c.baseUrl) p.push('CHARTER724_BASE_URL is missing'); else if (!/^https:\/\//.test(c.baseUrl) && !/^http:\/\/(localhost|127\.0\.0\.1)/.test(c.baseUrl)) p.push('CHARTER724_BASE_URL must use https');
  if (!c.username) p.push('CHARTER724_USERNAME is missing'); if (!c.password) p.push('CHARTER724_PASSWORD is missing');
  if (!adapterConfigured) p.push('server/charter724/mapping.json is not filled from the Swagger specification');
  return p;
}
module.exports = { loadConfig, parseEnv, liveProblems };
