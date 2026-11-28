'use strict';
// Accounts configuration. Problems are reported by NAME only; secret values are never echoed.
const { SCHEMA_RE } = require('../db/pool');
function loadAccountsConfig(env = process.env) {
  const problems = [];
  const databaseUrl = String(env.DATABASE_URL || ''), schema = String(env.DB_SCHEMA || 'sandbox'), walletEnv = String(env.WALLET_ENV || 'sandbox');
  const pepper = String(env.SESSION_PEPPER || ''), mailMode = String(env.MAIL_MODE || 'sandbox');
  let frontendUrl = String(env.FRONTEND_URL || 'https://hussein39993.github.io/miri-iran-v6/').trim(); if (!frontendUrl.endsWith('/')) frontendUrl += '/';
  if (!databaseUrl) problems.push('DATABASE_URL is missing');
  if (!SCHEMA_RE.test(schema)) problems.push('DB_SCHEMA is not a valid schema name');
  if (walletEnv !== 'sandbox') problems.push('WALLET_ENV must be "sandbox" in Stage 3 (production is not enabled)');
  if (pepper.length < 32) problems.push('SESSION_PEPPER must be at least 32 characters');
  if (mailMode !== 'sandbox') problems.push('MAIL_MODE "' + mailMode.slice(0, 20) + '" is not available yet (only "sandbox")');
  if (!/^https:\/\//.test(frontendUrl) && !/^http:\/\/(localhost|127\.0\.0\.1)/.test(frontendUrl)) problems.push('FRONTEND_URL must start with https://');
  const n = (v, d, lo, hi) => Math.min(hi, Math.max(lo, Number(v) || d));
  return { configured: problems.length === 0, problems, databaseUrl, schema, walletEnv, pepper, mailMode, frontendUrl, databaseSsl: String(env.DATABASE_SSL || 'auto'),
    logLinks: String(env.MAIL_LOG_LINKS) === 'true', autoMigrate: String(env.DB_AUTO_MIGRATE) !== 'false',
    idleMin: n(env.SESSION_IDLE_MIN, 30, 5, 240), absDays: n(env.SESSION_ABSOLUTE_DAYS, 7, 1, 30) };
}
module.exports = { loadAccountsConfig };
