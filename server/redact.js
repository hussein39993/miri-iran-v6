'use strict';
// Removes secrets from anything that may be logged. Matching is by key name, case-insensitive.
const SECRET = /pass(word)?|secret|token|authorization|api[-_]?key|cookie|jwt|bearer/i;
function redact(v, depth = 0) {
  if (depth > 6) return '[depth]';
  if (Array.isArray(v)) return v.map(x => redact(x, depth + 1));
  if (v && typeof v === 'object') { const o = {}; for (const [k, x] of Object.entries(v)) o[k] = SECRET.test(k) ? '[REDACTED]' : redact(x, depth + 1); return o; }
  if (typeof v === 'string') return v.replace(/Bearer\s+[A-Za-z0-9._~+\/=-]+/gi, 'Bearer [REDACTED]');
  return v;
}
function createLogger(write = (s) => process.stdout.write(s + '\n')) {
  const log = (level, msg, meta) => write(JSON.stringify({ t: new Date().toISOString(), level, msg: redact(msg), ...(meta ? { meta: redact(meta) } : {}) }));
  return { info: (m, x) => log('info', m, x), warn: (m, x) => log('warn', m, x), error: (m, x) => log('error', m, x) };
}
module.exports = { redact, createLogger };
