'use strict';
// LIVE integration test: runs the real migrations and the real SQL against a real PostgreSQL.
// Needs DATABASE_URL (use the EXTERNAL url from a Windows PC, or the internal one from the Render Shell). Not part of "npm test".
// It creates a throw-away schema "sandbox_test_<random>" and drops it at the end. It never touches the "sandbox" schema.
//   Windows PowerShell:   $env:DATABASE_URL="postgres://..." ; $env:DATABASE_SSL="require" ; npm run test:live
const crypto = require('crypto');
if (!process.env.DATABASE_URL) { console.log('SKIPPED: DATABASE_URL is not set (this is a live test; nothing was verified).'); process.exit(2); }
const { createDb } = require('../../server/db/pool');
const { runMigrations, status } = require('../../server/db/migrate');
const { repo } = require('../../server/customers/repo');
const { createService } = require('../../server/customers/service');
const { createLimiter } = require('../../server/customers/limits');
const { createMailer } = require('../../server/customers/mailer');
const { loadAccountsConfig } = require('../../server/customers/config');
const { verifyChain } = require('../../server/customers/audit');
const { AppError } = require('../../server/errors');

let fails = 0, n = 0; const ok = (name, c, x) => { n++; console.log((c ? 'PASS ' : 'FAIL ') + name + (c || x === undefined ? '' : ' -> ' + x)); if (!c) fails++; };
const code = async p => { try { await p; return 'none'; } catch (e) { return e.code || e.message; } };
const schema = 'sandbox_test_' + crypto.randomBytes(4).toString('hex'), PEPPER = crypto.randomBytes(32).toString('hex');
const res0 = { setHeader() { } };

(async () => {
  const db = createDb({ url: process.env.DATABASE_URL, schema, ssl: process.env.DATABASE_SSL || 'auto', logger: { error: m => console.log('  db error:', m) } });
  try {
    const r1 = await runMigrations(db, { schema }); ok('migrations apply on an empty schema', r1.ran.length >= 2, JSON.stringify(r1));
    const r2 = await runMigrations(db, { schema }); ok('migrations are idempotent (second run applies nothing)', r2.ran.length === 0);
    const st = await status(db, schema); ok('status: nothing pending', st.pending.length === 0 && st.changed.length === 0 && st.applied >= 2);
    // two instances starting at the same time must not break each other
    const db2 = createDb({ url: process.env.DATABASE_URL, schema, ssl: process.env.DATABASE_SSL || 'auto' });
    const both = await Promise.all([runMigrations(db, { schema }), runMigrations(db2, { schema })]); ok('concurrent migration runs are safe', both.every(x => x.ran.length === 0)); await db2.close();

    const cfg = loadAccountsConfig({ DATABASE_URL: process.env.DATABASE_URL, SESSION_PEPPER: PEPPER, DB_SCHEMA: schema });
    const limiter = createLimiter({ redis: null, pepper: PEPPER }), mailer = createMailer({ cfg, repo });
    const svc = createService({ db, repo, mailer, limiter, cfg });
    const mail = async tpl => { const m = (await repo.listOutbox(db, 20)).find(x => x.template === tpl); return m && m.body.match(/#\/[a-z]+\/([A-Za-z0-9_-]{43})/)[1]; };
    const EMAIL = 'live.' + crypto.randomBytes(3).toString('hex') + '@example.com', PW = 'live-test-password-1';

    await svc.register(res0, { ip: '10.0.0.1' }, { fullName: 'Live Tester', email: EMAIL, password: PW, lang: 'en' });
    ok('register stores a customer in PostgreSQL', (await db.query('SELECT count(*)::int AS n FROM customers WHERE email_norm = $1', [EMAIL])).rows[0].n === 1);
    ok('customer_no format and default status', (await db.query("SELECT customer_no ~ '^MI-[A-Z2-9]{8}$' AS f, status FROM customers WHERE email_norm = $1", [EMAIL])).rows.every(r => r.f && r.status === 'pending_verification'));
    ok('password stored only as scrypt hash', (await db.query('SELECT password_hash FROM customers WHERE email_norm = $1', [EMAIL])).rows[0].password_hash.startsWith('scrypt.'));
    ok('duplicate e-mail rejected by the unique index (23505)', await code(db.query("INSERT INTO customers (customer_no, email, email_norm, password_hash, full_name) VALUES ('MI-DUPLICATE', 'x', $1, 'h', 'Dup User')", [EMAIL])) === '23505');
    ok('CHECK: environment must be sandbox', await code(db.query("INSERT INTO customers (customer_no, email, email_norm, password_hash, full_name, environment) VALUES ('MI-PRODUCTX', 'p@x.com', 'p@x.com', 'h', 'Prod User', 'production')")) === '23514');
    ok('CHECK: invalid status rejected', await code(db.query("UPDATE customers SET status = 'vip' WHERE email_norm = $1", [EMAIL])) === '23514');

    // concurrency: the same registration sent 8 times at once -> exactly one customer
    const E2 = 'race.' + crypto.randomBytes(3).toString('hex') + '@example.com';
    await Promise.all(Array.from({ length: 8 }, (_, i) => svc.register(res0, { ip: '10.0.1.' + i }, { fullName: 'Race User', email: E2, password: PW }).catch(e => e)));
    ok('8 parallel registrations of one e-mail create exactly one customer', (await db.query('SELECT count(*)::int AS n FROM customers WHERE email_norm = $1', [E2])).rows[0].n === 1);

    const tok = await mail('verify'); ok('sandbox outbox received the verification mail', !!tok);
    // single-use token under concurrency: 10 parallel verifications -> exactly one success
    const out = await Promise.all(Array.from({ length: 10 }, () => svc.verifyEmail(res0, { ip: '10.0.2.1' }, { token: tok }).then(() => 'ok', e => e.code)));
    ok('10 parallel uses of one verification link: exactly one succeeds', out.filter(x => x === 'ok').length === 1, JSON.stringify(out));
    ok('account is active and verified', (await db.query('SELECT status, email_verified_at IS NOT NULL AS v FROM customers WHERE email_norm = $1', [EMAIL])).rows.every(r => r.status === 'active' && r.v));

    const L = await svc.login(res0, { ip: '10.0.3.1', ua: 'live-test' }, { email: EMAIL, password: PW });
    ok('login creates a session row holding only an HMAC fingerprint', (await db.query('SELECT count(*)::int AS n, bool_or(encode(token_hash, \'escape\') = $1) AS leaked FROM customer_sessions', [L.token])).rows[0].leaked === false);
    const A = await svc.authenticate(L.token); ok('authenticate finds the session through the join', A.customer.email === EMAIL);
    await svc.updateProfile({ ip: '10.0.3.1' }, A, { fullName: 'Live Renamed', phone: '+9647701234567', lang: 'fa' }); ok('profile update persisted (COALESCE / phone CASE SQL)', (await db.query('SELECT full_name, phone, preferred_lang FROM customers WHERE email_norm = $1', [EMAIL])).rows[0].preferred_lang === 'fa');
    await svc.updateProfile({ ip: '10.0.3.1' }, A, { phone: '' }); ok('phone can be cleared', (await db.query('SELECT phone FROM customers WHERE email_norm = $1', [EMAIL])).rows[0].phone === null);
    const L2 = await svc.login(res0, { ip: '10.0.3.2' }, { email: EMAIL, password: PW });
    await svc.changePassword(res0, { ip: '10.0.3.1' }, A, { currentPassword: PW, newPassword: 'live-test-password-2' });
    ok('password change keeps this session and revokes the other (uuid exclusion SQL)', !!(await svc.authenticate(L.token)) && await svc.authenticate(L2.token).then(() => false, e => e.code === 'SESSION_INVALID'));
    // expiry is decided by the database clock
    await db.query("UPDATE customer_sessions SET idle_expires_at = now() - interval '1 second' WHERE revoked_at IS NULL"); ok('idle expiry enforced by SQL', await svc.authenticate(L.token).then(() => false, e => e.code === 'SESSION_INVALID'));

    // password reset flow
    await svc.forgotPassword(res0, { ip: '10.0.4.1' }, { email: EMAIL }); const rt = await mail('reset');
    await svc.resetPassword(res0, { ip: '10.0.4.1' }, { token: rt, password: 'live-test-password-3' }); ok('reset works and the link is single use', await svc.resetPassword(res0, { ip: '10.0.4.1' }, { token: rt, password: 'live-test-password-4' }).then(() => false, e => e.code === 'INVALID_OR_EXPIRED_TOKEN'));
    ok('login with the reset password', !!(await svc.login(res0, { ip: '10.0.4.2' }, { email: EMAIL, password: 'live-test-password-3' })));
    await db.query("UPDATE auth_tokens SET expires_at = now() - interval '1 second'"); await svc.forgotPassword(res0, { ip: '10.0.4.3' }, { email: EMAIL }); const rt2 = await mail('reset'); await db.query("UPDATE auth_tokens SET expires_at = now() - interval '1 second' WHERE used_at IS NULL");
    ok('expired reset link refused (database clock)', await svc.resetPassword(res0, { ip: '10.0.4.4' }, { token: rt2, password: 'live-test-password-5' }).then(() => false, e => e.code === 'INVALID_OR_EXPIRED_TOKEN'));

    // admin status control + search SQL
    const cid = (await db.query('SELECT id FROM customers WHERE email_norm = $1', [EMAIL])).rows[0].id;
    ok('admin search by e-mail fragment, name and customer number', (await svc.adminList(EMAIL.slice(0, 8), 10)).customers.length === 1 && (await svc.adminList('live renamed', 10)).customers.length === 1 && (await svc.adminList((await db.query('SELECT customer_no FROM customers WHERE id = $1', [cid])).rows[0].customer_no.toLowerCase(), 10)).customers.length === 1);
    ok('LIKE wildcards in the search box are escaped', (await svc.adminList('%', 10)).customers.length === 0);
    const sess = await svc.login(res0, { ip: '10.0.5.1' }, { email: EMAIL, password: 'live-test-password-3' });
    await svc.adminSetStatus({ ip: '10.0.5.2' }, 'live-admin', { customerId: cid, status: 'suspended', reason: 'live test' });
    ok('suspension revokes sessions and blocks login', await svc.authenticate(sess.token).then(() => false, e => e.code === 'SESSION_INVALID') && await svc.login(res0, { ip: '10.0.5.3' }, { email: EMAIL, password: 'live-test-password-3' }).then(() => false, e => e.code === 'ACCOUNT_SUSPENDED'));

    // audit log
    const chain = await verifyChain(db); ok('audit hash chain verifies (' + chain.checked + ' rows)', chain.ok && chain.checked >= 10, JSON.stringify(chain));
    ok('audit log is append-only: UPDATE refused', await code(db.query("UPDATE audit_logs SET action = 'x'")) === 'P0001');
    ok('audit log is append-only: DELETE refused', await code(db.query('DELETE FROM audit_logs')) === 'P0001');
    ok('audit log is append-only: TRUNCATE refused', await code(db.query('TRUNCATE audit_logs')) === 'P0001');
    ok('audit rows hold no raw IP address or password', (await db.query("SELECT count(*)::int AS n FROM audit_logs WHERE meta::text ~* 'password|token' OR ip_hash ~ '\\.'")).rows[0].n === 0);
    // concurrent audit writers keep one linear chain
    await Promise.all(Array.from({ length: 12 }, (_, i) => svc.forgotPassword(res0, { ip: '10.9.9.' + i }, { email: 'chain' + i + '@example.com' }).catch(() => { })));
    await Promise.all(Array.from({ length: 12 }, (_, i) => db.tx(c => require('../../server/customers/audit').writeAudit(c, { actorType: 'system', action: 'live_parallel', meta: { i } }))));
    ok('parallel audit writers keep the chain intact', (await verifyChain(db)).ok);
    ok('transaction rollback leaves nothing behind', await (async () => { try { await db.tx(async c => { await repo.insertCustomer(c, { customerNo: 'MI-ROLLBACK', email: 'rb@x.com', passwordHash: 'h', fullName: 'Rollback', phone: null, lang: 'en' }); throw new Error('boom'); }); } catch (_) { /* expected */ } return (await db.query("SELECT count(*)::int AS n FROM customers WHERE customer_no = 'MI-ROLLBACK'")).rows[0].n === 0; })());
  } catch (e) { console.log('FAIL unexpected error: ' + (e && e.stack || e)); fails++; }
  finally { try { await db.query('DROP SCHEMA IF EXISTS ' + schema + ' CASCADE'); console.log('cleanup: dropped schema ' + schema); } catch (e) { console.log('cleanup failed: ' + e.message); } await db.close(); }
  console.log(fails ? 'LIVE TESTS FAILED: ' + fails + ' of ' + n : 'ALL ' + n + ' LIVE TESTS PASSED'); process.exit(fails ? 1 : 0);
})();
