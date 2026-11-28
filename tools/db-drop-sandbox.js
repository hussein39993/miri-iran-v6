'use strict';
// DESTRUCTIVE (sandbox only): deletes the whole sandbox schema (all test customers, sessions, audit rows).
// Use it to reset testing or to roll back Stage 3A completely.   npm run db:drop-sandbox -- --yes-delete-sandbox-data
const { loadAccountsConfig } = require('../server/customers/config');
const { createDb } = require('../server/db/pool');
(async () => {
  const cfg = loadAccountsConfig();
  if (cfg.walletEnv !== 'sandbox' || !/^sandbox/.test(cfg.schema)) { console.error('Refused: only a schema whose name starts with "sandbox" can be dropped.'); process.exit(1); }
  if (!cfg.databaseUrl) { console.error('DATABASE_URL is not set.'); process.exit(1); }
  if (!process.argv.includes('--yes-delete-sandbox-data')) { console.error('This deletes ALL data in schema "' + cfg.schema + '".\nRun again with:  npm run db:drop-sandbox -- --yes-delete-sandbox-data'); process.exit(1); }
  const db = createDb({ url: cfg.databaseUrl, schema: cfg.schema, ssl: cfg.databaseSsl });
  try { await db.query('DROP SCHEMA IF EXISTS ' + cfg.schema + ' CASCADE'); console.log('Schema "' + cfg.schema + '" deleted. Redeploy (or run npm run db:migrate) to create it again.'); }
  catch (e) { console.error('Failed: ' + e.message); process.exitCode = 1; } finally { await db.close(); }
})();
