'use strict';
// npm run db:migrate           -> apply pending migrations (safe to repeat)
// npm run db:status            -> show applied / pending
const { loadAccountsConfig } = require('../server/customers/config');
const { createDb } = require('../server/db/pool');
const { runMigrations, status } = require('../server/db/migrate');
(async () => {
  const cfg = loadAccountsConfig(); const missing = cfg.problems.filter(p => /DATABASE_URL|DB_SCHEMA|WALLET_ENV/.test(p));
  if (missing.length) { console.error('Cannot continue: ' + missing.join('; ')); process.exit(1); }
  const db = createDb({ url: cfg.databaseUrl, schema: cfg.schema, ssl: cfg.databaseSsl, logger: { error: m => console.error(m) } });
  try {
    if (process.argv.includes('--status')) { console.log(JSON.stringify(await status(db, cfg.schema), null, 2)); }
    else { const r = await runMigrations(db, { schema: cfg.schema, logger: { info: m => console.log(m) } }); console.log(r.ran.length ? 'Applied: ' + r.ran.join(', ') : 'Database is already up to date.'); }
  } catch (e) { console.error('Migration failed: ' + e.message); process.exitCode = 1; } finally { await db.close(); }
})();
