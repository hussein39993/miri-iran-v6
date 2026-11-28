'use strict';
// Stage 3A MOCKED tests: account logic, HTTP layer, migration runner and audit chain run against an in-memory fake repository / fake pg client.
// They prove the LOGIC. They do NOT execute the SQL text: that is covered by tests/live/test_accounts_live.js (needs a real PostgreSQL).
const http = require('http'), crypto = require('crypto'), fs = require('fs'), path = require('path');
const { AppError, toBody } = require('../server/errors');
const { createService } = require('../server/customers/service');
const { createLimiter } = require('../server/customers/limits');
const { createMailer, TEMPLATES } = require('../server/customers/mailer');
const { createAccountsHandler } = require('../server/customers/handler');
const { loadAccountsConfig } = require('../server/customers/config');
const S = require('../server/customers/security');
const V = require('../server/customers/validate');
const audit = require('../server/customers/audit');
const mig = require('../server/db/migrate');
const { sslFor } = require('../server/db/pool');
const { createRedis } = require('../server/lib/redis');
let fails = 0, n = 0; const ok = (name, c, x) => { n++; if (!c) { fails++; console.log('FAIL', name, x === undefined ? '' : x); } };
const rejects = async (p, status, code) => { try { await p; return false; } catch (e) { return e.status === status && (!code || e.code === code); } };

const { fakeRepo, fakeDb } = require('./helpers/fake_accounts');
const PEPPER = 'p'.repeat(40);
function rig(extra = {}) {
  const clock = { t: Date.UTC(2026, 10, 28, 10, 0, 0) }; const repo = fakeRepo(clock), db = fakeDb(repo);
  const cfg = loadAccountsConfig({ DATABASE_URL: 'postgres://x', SESSION_PEPPER: PEPPER, FRONTEND_URL: 'https://hussein39993.github.io/miri-iran-v6/', ...extra });
  const limiter = createLimiter({ redis: null, pepper: PEPPER, now: () => clock.t }); const mailer = createMailer({ cfg, repo });
  const svc = createService({ db, repo, mailer, limiter, cfg, now: () => new Date(clock.t) });
  return { clock, repo, db, cfg, limiter, svc, mailer };
}
const res0 = { setHeader() { } }, ctx0 = { ip: '1.2.3.4', ua: 'test' };
const lastToken = (rg, kind) => { const m = [...rg.repo.st.outbox].reverse().find(x => x.template === kind); return m ? m.body.match(/#\/[a-z]+\/([A-Za-z0-9_-]{43})/)[1] : null; };
const REG = { fullName: 'Test User', email: 'Test.User@Example.com', phone: '+9647701234567', password: 'long-enough-password', lang: 'ar' };

(async () => {
  // ---------- config ----------
  ok('config: nothing set => not configured, names only', (c => !c.configured && c.problems.includes('DATABASE_URL is missing') && !JSON.stringify(c.problems).includes('postgres'))(loadAccountsConfig({})));
  ok('config: WALLET_ENV=production refused in Stage 3', loadAccountsConfig({ DATABASE_URL: 'x', SESSION_PEPPER: PEPPER, WALLET_ENV: 'production' }).problems.some(p => /sandbox/.test(p)));
  ok('config: MAIL_MODE other than sandbox refused', loadAccountsConfig({ DATABASE_URL: 'x', SESSION_PEPPER: PEPPER, MAIL_MODE: 'resend' }).problems.some(p => /MAIL_MODE/.test(p)));
  ok('config: bad schema name refused (SQL-injection guard)', loadAccountsConfig({ DATABASE_URL: 'x', SESSION_PEPPER: PEPPER, DB_SCHEMA: 'a;drop table x' }).problems.some(p => /DB_SCHEMA/.test(p)));
  ok('config: complete', loadAccountsConfig({ DATABASE_URL: 'x', SESSION_PEPPER: PEPPER }).configured);
  ok('ssl auto: internal host no TLS, render external TLS', sslFor('postgres://u:p@dpg-abc-a/db', 'auto') === false && !!sslFor('postgres://u:p@dpg-abc-a.oregon-postgres.render.com/db', 'auto'));

  // ---------- security helpers ----------
  ok('password policy', S.passwordProblem('short') === 'too_short' && S.passwordProblem('password1') === 'too_short' && S.passwordProblem('aaaaaaaaaaaa') === 'common' && S.passwordProblem('x'.repeat(129)) === 'too_long' && S.passwordProblem('a-good-long-pass') === null);
  ok('email normalisation and validation', S.normalizeEmail('  A@B.COM ') === 'a@b.com' && S.validEmail('a@b.co') && !S.validEmail('a@b') && !S.validEmail('a b@c.com') && !S.validEmail('<x>@c.com'));
  ok('customer numbers look like MI-XXXXXXXX and differ', /^MI-[A-HJ-NP-Z2-9]{8}$/.test(S.newCustomerNo()) && S.newCustomerNo() !== S.newCustomerNo());
  ok('input cleaning strips tags/control chars', V.clean('  <b>Ali\u0000  Reza</b> ') === 'bAli Reza/b');

  // ---------- register / verify / login ----------
  let R = rig();
  ok('register ok (generic answer)', (await R.svc.register(res0, ctx0, REG)).ok === true && R.repo.st.customers.length === 1);
  const c1 = R.repo.st.customers[0];
  ok('new account: pending, e-mail lowercased, scrypt hash, no plain password stored', c1.status === 'pending_verification' && c1.email_norm === 'test.user@example.com' && c1.password_hash.startsWith('scrypt.') && !JSON.stringify(R.repo.st).includes('long-enough-password'));
  ok('verification mail in sandbox outbox with working link (arabic)', R.repo.st.outbox.length === 1 && /^https:\/\/hussein39993\.github\.io\/miri-iran-v6\/#\/verify\//.test(R.repo.st.outbox[0].body.split('\n').find(l => l.startsWith('http'))) && R.repo.st.outbox[0].subject === TEMPLATES.verify.ar[0]);
  ok('only a fingerprint of the e-mail token is stored', R.repo.st.tokens.length === 1 && !R.repo.st.tokens[0].hash.includes(lastToken(R, 'verify')) && R.repo.st.tokens[0].hash === S.sha256(lastToken(R, 'verify')).toString('hex'));
  ok('register again with same e-mail: same answer, no second account, "exists" mail', (await R.svc.register(res0, { ...ctx0, ip: '9.9.9.9' }, { ...REG, email: 'test.user@EXAMPLE.com' })).ok && R.repo.st.customers.length === 1 && R.repo.st.outbox.at(-1).template === 'exists');
  ok('register validation: weak password / bad e-mail / bad phone', await rejects(R.svc.register(res0, { ip: '2.2.2.2' }, { ...REG, password: 'short' }), 400, 'VALIDATION') && await rejects(R.svc.register(res0, { ip: '2.2.2.3' }, { ...REG, email: 'nope' }), 400, 'VALIDATION') && await rejects(R.svc.register(res0, { ip: '2.2.2.4' }, { ...REG, phone: 'abc' }), 400, 'VALIDATION'));
  ok('login before verification refused (403 EMAIL_NOT_VERIFIED)', await rejects(R.svc.login(res0, ctx0, { email: REG.email, password: REG.password }), 403, 'EMAIL_NOT_VERIFIED'));
  ok('wrong / unknown credentials give the SAME 401', await rejects(R.svc.login(res0, ctx0, { email: REG.email, password: 'wrong-password-1' }), 401, 'INVALID_CREDENTIALS') && await rejects(R.svc.login(res0, ctx0, { email: 'nobody@example.com', password: 'wrong-password-1' }), 401, 'INVALID_CREDENTIALS'));
  const tok = lastToken(R, 'verify');
  ok('verify with garbage token rejected', await rejects(R.svc.verifyEmail(res0, ctx0, { token: 'x' }), 400, 'INVALID_OR_EXPIRED_TOKEN'));
  ok('verify activates the account', (await R.svc.verifyEmail(res0, ctx0, { token: tok })).ok && c1.status === 'active' && !!c1.email_verified_at);
  ok('verification token is single use', await rejects(R.svc.verifyEmail(res0, ctx0, { token: tok }), 400, 'INVALID_OR_EXPIRED_TOKEN'));
  R.clock.t += 1000; const L = await R.svc.login(res0, ctx0, { email: ' TEST.user@example.com ', password: REG.password });
  ok('login ok: opaque token, only HMAC fingerprint stored, customer shape has no hash', /^[A-Za-z0-9_-]{43}$/.test(L.token) && R.repo.st.sessions.length === 1 && R.repo.st.sessions[0].token_hash === S.hmac(PEPPER, L.token).toString('hex') && !JSON.stringify(R.repo.st.sessions).includes(L.token) && L.customer.customerNo === c1.customer_no && !('password_hash' in L.customer) && !('passwordHash' in L.customer));
  const A = await R.svc.authenticate(L.token); ok('authenticate returns the customer', A.customer.customer_id === c1.id && R.svc.me(A).customer.email === 'test.user@example.com');
  ok('bad / missing bearer rejected', await rejects(R.svc.authenticate(''), 401, 'SESSION_INVALID') && await rejects(R.svc.authenticate('a'.repeat(43)), 401, 'SESSION_INVALID'));
  // idle + absolute expiry, sliding window
  R.clock.t += 29 * 60000; await R.svc.authenticate(L.token); R.clock.t += 29 * 60000; ok('idle window slides while the user is active', !!(await R.svc.authenticate(L.token)));
  R.clock.t += 31 * 60000; ok('idle timeout expires the session', await rejects(R.svc.authenticate(L.token), 401, 'SESSION_INVALID'));
  const L2 = await R.svc.login(res0, ctx0, { email: REG.email, password: REG.password }); R.clock.t += 8 * 86400000; ok('absolute lifetime (7 days) expires the session', await rejects(R.svc.authenticate(L2.token), 401, 'SESSION_INVALID'));

  // ---------- profile / password / revocation ----------
  R = rig(); await R.svc.register(res0, ctx0, REG); await R.svc.verifyEmail(res0, ctx0, { token: lastToken(R, 'verify') });
  const s1 = await R.svc.login(res0, ctx0, REG), s2 = await R.svc.login(res0, ctx0, REG), a1 = await R.svc.authenticate(s1.token), a2 = await R.svc.authenticate(s2.token);
  ok('profile update (name, phone, language)', (await R.svc.updateProfile(ctx0, a1, { fullName: 'New Name', phone: '', lang: 'fa' })).customer.fullName === 'New Name' && R.repo.st.customers[0].phone === null && R.repo.st.customers[0].preferred_lang === 'fa');
  ok('profile update validation', await rejects(R.svc.updateProfile(ctx0, a1, { lang: 'xx' }), 400, 'VALIDATION') && await rejects(R.svc.updateProfile(ctx0, a1, {}), 400, 'VALIDATION'));
  ok('change password: wrong current refused', await rejects(R.svc.changePassword(res0, ctx0, a1, { currentPassword: 'nope-nope-nope', newPassword: 'another-long-pass' }), 403, 'INVALID_CREDENTIALS'));
  ok('change password: weak new refused', await rejects(R.svc.changePassword(res0, ctx0, a1, { currentPassword: REG.password, newPassword: 'short' }), 400, 'VALIDATION'));
  await R.svc.changePassword(res0, ctx0, a1, { currentPassword: REG.password, newPassword: 'another-long-pass' });
  ok('change password: other devices signed out, this one stays', !!(await R.svc.authenticate(s1.token)) && await rejects(R.svc.authenticate(s2.token), 401, 'SESSION_INVALID') && R.repo.st.outbox.at(-1).template === 'changed');
  ok('old password no longer works, new one does', await rejects(R.svc.login(res0, ctx0, REG), 401, 'INVALID_CREDENTIALS') && !!(await R.svc.login(res0, ctx0, { email: REG.email, password: 'another-long-pass' })));
  const s3 = await R.svc.login(res0, ctx0, { email: REG.email, password: 'another-long-pass' }); const a3 = await R.svc.authenticate(s3.token);
  await R.svc.logout(ctx0, a3); ok('logout revokes the session', await rejects(R.svc.authenticate(s3.token), 401, 'SESSION_INVALID'));
  const s4 = await R.svc.login(res0, ctx0, { email: REG.email, password: 'another-long-pass' }); await R.svc.logoutAll(ctx0, await R.svc.authenticate(s4.token)); ok('logout-all revokes every session', await rejects(R.svc.authenticate(s1.token), 401, 'SESSION_INVALID') && await rejects(R.svc.authenticate(s4.token), 401, 'SESSION_INVALID'));

  // ---------- password recovery ----------
  R = rig(); await R.svc.register(res0, ctx0, REG); await R.svc.verifyEmail(res0, ctx0, { token: lastToken(R, 'verify') }); const sx = await R.svc.login(res0, ctx0, REG);
  const before = R.repo.st.outbox.length; await R.svc.forgotPassword(res0, ctx0, { email: 'unknown@example.com' }); ok('forgot: unknown e-mail => same answer, no mail', R.repo.st.outbox.length === before);
  ok('forgot: known e-mail => reset mail', (await R.svc.forgotPassword(res0, ctx0, { email: REG.email })).ok && R.repo.st.outbox.at(-1).template === 'reset');
  const rt = lastToken(R, 'reset'); R.clock.t += 61 * 60000; ok('reset link expires after 1 hour', await rejects(R.svc.resetPassword(res0, ctx0, { token: rt, password: 'brand-new-password' }), 400, 'INVALID_OR_EXPIRED_TOKEN'));
  await R.svc.forgotPassword(res0, { ...ctx0, ip: '4.4.4.4' }, { email: REG.email }); const rt2 = lastToken(R, 'reset');
  ok('reset rejects weak password and keeps the token usable', await rejects(R.svc.resetPassword(res0, ctx0, { token: rt2, password: 'short' }), 400, 'VALIDATION'));
  ok('reset ok', (await R.svc.resetPassword(res0, ctx0, { token: rt2, password: 'brand-new-password' })).ok);
  ok('reset link is single use', await rejects(R.svc.resetPassword(res0, ctx0, { token: rt2, password: 'brand-new-password2' }), 400, 'INVALID_OR_EXPIRED_TOKEN'));
  ok('reset signs out every session and the new password works', await rejects(R.svc.authenticate(sx.token), 401, 'SESSION_INVALID') && !!(await R.svc.login(res0, ctx0, { email: REG.email, password: 'brand-new-password' })));
  await R.svc.forgotPassword(res0, { ...ctx0, ip: '5.5.5.5' }, { email: REG.email }); await R.svc.forgotPassword(res0, { ...ctx0, ip: '6.6.6.6' }, { email: REG.email }); const lt = lastToken(R, 'reset'); R.repo.st.tokens.forEach(t => { if (t.hash !== S.sha256(lt).toString('hex')) ok('a newer reset link invalidates older ones', t.used === true); });

  // ---------- admin status control ----------
  R = rig(); await R.svc.register(res0, ctx0, REG); await R.svc.verifyEmail(res0, ctx0, { token: lastToken(R, 'verify') }); const sa = await R.svc.login(res0, ctx0, REG); const cid = R.repo.st.customers[0].id;
  ok('admin list / search', (await R.svc.adminList('test.user', 10)).customers.length === 1 && (await R.svc.adminList('nobody', 10)).customers.length === 0 && (await R.svc.adminList(R.repo.st.customers[0].customer_no.toLowerCase(), 10)).customers.length === 1);
  ok('restriction needs a reason', await rejects(R.svc.adminSetStatus(ctx0, 'boss', { customerId: cid, status: 'restricted', reason: '' }), 400, 'VALIDATION'));
  ok('restricted account can still sign in (view only)', (await R.svc.adminSetStatus(ctx0, 'boss', { customerId: cid, status: 'restricted', reason: 'review' })).customer.status === 'restricted' && !!(await R.svc.authenticate(sa.token)));
  ok('suspension revokes sessions and blocks login (403)', (await R.svc.adminSetStatus(ctx0, 'boss', { customerId: cid, status: 'suspended', reason: 'fraud check' })).customer.status === 'suspended' && await rejects(R.svc.authenticate(sa.token), 401, 'SESSION_INVALID') && await rejects(R.svc.login(res0, ctx0, REG), 403, 'ACCOUNT_SUSPENDED'));
  ok('suspended accounts get no reset mail', await (async () => { const k = R.repo.st.outbox.length; await R.svc.forgotPassword(res0, ctx0, { email: REG.email }); return R.repo.st.outbox.length === k; })());
  ok('reactivation works', (await R.svc.adminSetStatus(ctx0, 'boss', { customerId: cid, status: 'active', reason: '' })).customer.status === 'active' && !!(await R.svc.login(res0, ctx0, REG)));
  ok('unknown customer 404 / bad status 400', await rejects(R.svc.adminSetStatus(ctx0, 'boss', { customerId: '00000000-0000-0000-0000-000000000000', status: 'active' }), 404) && await rejects(R.svc.adminSetStatus(ctx0, 'boss', { customerId: cid, status: 'god' }), 400, 'VALIDATION'));
  ok('audit rows written for every action, with admin actor and hashed IP only', R.repo.st.audit.length >= 8 && R.repo.st.audit.some(a => a.actor_type === 'admin' && a.actor_id === 'boss' && a.action === 'customer_status_changed') && R.repo.st.audit.every(a => !a.ip_hash || a.ip_hash.length === 32 && !a.ip_hash.includes('.')));
  ok('audit meta never contains secrets', !JSON.stringify(R.repo.st.audit).match(/password|token/i) || R.repo.st.audit.every(a => !Object.keys(a.meta).some(k => /pass|token/i.test(k))));
  // transaction rollback: if the mail step fails, the customer must not exist
  const R2 = rig(); R2.svc = createService({ db: R2.db, repo: R2.repo, mailer: { send: async () => { throw new Error('mail down'); } }, limiter: R2.limiter, cfg: R2.cfg, now: () => new Date(R2.clock.t) });
  ok('register is atomic: failure after insert rolls everything back', await rejects(R2.svc.register(res0, ctx0, REG), 500) === false && R2.repo.st.customers.length === 0 && R2.repo.st.audit.length === 0);

  // ---------- rate limiting ----------
  R = rig(); const L5 = { ip: '7.7.7.7' };
  for (let i = 0; i < 10; i++) await rejects(R.svc.login(res0, L5, { email: 'victim@example.com', password: 'wrong-password-1' }), 401);
  let hdr = ''; const resH = { setHeader: (k, v) => { hdr = k + v; } };
  ok('login: 11th attempt for one e-mail => 429 (even though the account does not exist)', await rejects(R.svc.login(resH, { ip: '8.8.8.8' }, { email: 'victim@example.com', password: 'x1234567890' }), 429, 'RATE_LIMITED') && hdr === 'Retry-After900');
  R.clock.t += 16 * 60000; ok('limit window resets', await rejects(R.svc.login(res0, { ip: '8.8.8.8' }, { email: 'victim@example.com', password: 'x1234567890' }), 401, 'INVALID_CREDENTIALS'));
  R = rig(); for (let i = 0; i < 3; i++) await R.svc.forgotPassword(res0, { ip: '3.3.3.' + i }, { email: 'a@example.com' });
  ok('forgot-password: 4th request per e-mail per hour => 429', await rejects(R.svc.forgotPassword(res0, { ip: '3.3.3.9' }, { email: 'a@example.com' }), 429));
  // Redis path + fallback
  const calls = []; const store = new Map(); const fakeFetch = async (u, o) => { const [c, k, v] = JSON.parse(o.body); calls.push(c); if (o.headers.Authorization !== 'Bearer RT') return { ok: false, json: async () => ({ error: 'x' }) }; if (c === 'INCR') { store.set(k, (store.get(k) || 0) + 1); return { ok: true, json: async () => ({ result: store.get(k) }) }; } return { ok: true, json: async () => ({ result: 1 }) }; };
  const lim = createLimiter({ redis: createRedis({ UPSTASH_REDIS_REST_URL: 'https://r.upstash.io', UPSTASH_REDIS_REST_TOKEN: 'RT' }, fakeFetch), pepper: PEPPER });
  await lim.hit(res0, 't', 'a@b.c', 2, 60); await lim.hit(res0, 't', 'a@b.c', 2, 60); ok('limiter uses Redis (INCR + EXPIRE) and hashes the key', lim.mode() === 'redis' && calls.includes('EXPIRE') && ![...store.keys()].some(k => k.includes('a@b.c')) && await rejects(lim.hit(res0, 't', 'a@b.c', 2, 60), 429));
  const lim2 = createLimiter({ redis: createRedis({ UPSTASH_REDIS_REST_URL: 'https://r.upstash.io', UPSTASH_REDIS_REST_TOKEN: 'BAD' }, fakeFetch), pepper: PEPPER }); await lim2.hit(res0, 't', 'z', 5, 60); ok('Redis down => memory fallback (still limits)', lim2.mode() === 'memory-fallback');

  // ---------- HTTP layer ----------
  R = rig(); const adminOk = { configured: true, session: req => { if (req.headers.cookie !== 'admin=1') throw new AppError(401, 'NOT_LOGGED_IN', 'x'); return { user: 'boss' }; }, csrf: req => { if (req.headers['x-miri-admin'] !== '1') throw new AppError(403, 'CSRF_BLOCKED', 'x'); } };
  const ah = createAccountsHandler({ cfg: R.cfg, db: R.db, repo: R.repo, service: R.svc, limiter: R.limiter, redis: null, adminAuth: adminOk }); await ah.init();
  const srv = http.createServer((req, res) => {
    const json = (rs, st, o) => { rs.writeHead(st, { 'Content-Type': 'application/json' }); rs.end(JSON.stringify(o)); };
    const readJson = rq => new Promise((okk, no) => { const c = []; rq.on('data', d => c.push(d)); rq.on('end', () => { try { okk(c.length ? JSON.parse(Buffer.concat(c)) : {}); } catch (_) { no(new AppError(400, 'INVALID_JSON', 'bad')); } }); });
    Promise.resolve().then(async () => { if (!(await ah.handle(req, res, { json, readJson, ip: '5.5.5.5' }))) throw new AppError(404, 'NOT_FOUND', 'x'); }).catch(e => { const err = e instanceof AppError ? e : new AppError(500, 'INTERNAL_ERROR', 'x'); json(res, err.status, toBody(err)); });
  });
  await new Promise(r => srv.listen(0, r)); const port = srv.address().port;
  const call = (method, p, body, hdr = {}) => new Promise(r => { const rq = http.request({ port, method, path: p, headers: { 'Content-Type': 'application/json', ...hdr } }, res => { let d = ''; res.on('data', c => d += c); res.on('end', () => { let j = {}; try { j = JSON.parse(d); } catch (_) { } r({ status: res.statusCode, j }); }); }); if (body) rq.write(JSON.stringify(body)); rq.end(); });
  let r = await call('POST', '/api/auth/register', REG); ok('HTTP register 200', r.status === 200 && r.j.ok === true);
  r = await call('POST', '/api/auth/register', { ...REG, password: 'x' }); ok('HTTP validation 400 with field codes', r.status === 400 && r.j.error.code === 'VALIDATION' && r.j.error.fields.password === 'too_short');
  r = await call('GET', '/api/auth/register'); ok('HTTP wrong method 405', r.status === 405);
  r = await call('GET', '/api/me'); ok('HTTP /api/me without token 401', r.status === 401 && r.j.error.code === 'SESSION_INVALID');
  r = await call('POST', '/api/auth/verify-email', { token: lastToken(R, 'verify') }); ok('HTTP verify', r.status === 200);
  r = await call('POST', '/api/auth/login', { email: REG.email, password: REG.password }); const T = r.j.token; ok('HTTP login returns token + expiries', r.status === 200 && !!T && !!r.j.idleExpiresAt && !!r.j.absoluteExpiresAt);
  r = await call('GET', '/api/me', null, { Authorization: 'Bearer ' + T }); ok('HTTP /api/me with token', r.status === 200 && r.j.customer.email === 'test.user@example.com' && !JSON.stringify(r.j).includes('hash'));
  r = await call('GET', '/api/me', null, { Authorization: 'Bearer ' + T.slice(0, -1) + (T.endsWith('A') ? 'B' : 'A') }); ok('HTTP tampered token 401', r.status === 401);
  r = await call('POST', '/api/me/update', { fullName: 'Via Http' }, { Authorization: 'Bearer ' + T }); ok('HTTP profile update (POST, CORS-safe)', r.status === 200 && r.j.customer.fullName === 'Via Http');
  r = await call('POST', '/api/auth/logout', {}, { Authorization: 'Bearer ' + T }); r = await call('GET', '/api/me', null, { Authorization: 'Bearer ' + T }); ok('HTTP logout invalidates the token', r.status === 401);
  r = await call('GET', '/api/health/db'); ok('HTTP health/db: no secrets', r.status === 200 && r.j.status === 'ready' && r.j.environment === 'sandbox' && !JSON.stringify(r.j).match(/postgres|pepper|password/i));
  r = await call('GET', '/api/admin/customers?q=test'); ok('admin API needs admin session (401)', r.status === 401);
  r = await call('GET', '/api/admin/customers?q=test', null, { cookie: 'admin=1' }); ok('admin list with session', r.status === 200 && r.j.customers.length === 1);
  r = await call('POST', '/api/admin/customers/status', { customerId: R.repo.st.customers[0].id, status: 'suspended', reason: 'because' }, { cookie: 'admin=1' }); ok('admin status change needs CSRF header', r.status === 403);
  r = await call('POST', '/api/admin/customers/status', { customerId: R.repo.st.customers[0].id, status: 'suspended', reason: 'because' }, { cookie: 'admin=1', 'X-Miri-Admin': '1' }); ok('admin status change ok', r.status === 200 && r.j.customer.status === 'suspended');
  r = await call('GET', '/api/admin/sandbox/outbox', null, { cookie: 'admin=1' }); ok('admin sandbox mailbox', r.status === 200 && r.j.messages.length >= 1);
  r = await call('POST', '/api/auth/login', '{bad'); ok('HTTP malformed JSON handled', r.status === 400 || r.status === 401);
  srv.close();
  const off = createAccountsHandler({ env: {}, logger: {} }); await off.init(); const sink = { json: (rs, st, o) => { sink.last = [st, o]; } };
  ok('not configured => owns routes, answers 503 ACCOUNTS_NOT_CONFIGURED, other services untouched', off.state.status === 'disabled' && await rejects(off.handle({ url: '/api/auth/login', method: 'POST', headers: {} }, {}, { ...sink, readJson: async () => ({}) }), 503, 'ACCOUNTS_NOT_CONFIGURED') && !off.owns('/api/flights/search') && !off.owns('/api/wallet/rates') && !off.owns('/api/admin/rates') && off.owns('/api/admin/customers') && !off.owns('/api/health'));

  // ---------- audit hash chain ----------
  const rows = []; let prev = null; const mk = (action, meta) => { const row = { at: new Date(Date.UTC(2026, 10, 28, 10, 0, rows.length)).toISOString(), actor_type: 'system', actor_id: null, action, entity_type: null, entity_id: null, ip_hash: null, meta }; const h = audit.chainHash(prev, row); rows.push({ id: rows.length + 1, ...row, at: row.at, prev_hash: prev, hash: h }); prev = h; };
  mk('a', {}); mk('b', { z: 1, a: [1, 2] }); mk('c', {});
  const dbA = rid => ({ query: async (sql, p) => ({ rows: rows.filter(x => x.id > p[0]).slice(0, p[1]) }) });
  ok('audit chain verifies', (await audit.verifyChain(dbA())).ok === true && (await audit.verifyChain(dbA())).checked === 3);
  rows[1].meta = { z: 2 }; ok('audit chain detects a changed row', (await audit.verifyChain(dbA())).brokenAtId === 2);
  rows[1].meta = { z: 1, a: [1, 2] }; rows.splice(1, 1); ok('audit chain detects a deleted row', (await audit.verifyChain(dbA())).ok === false);
  ok('audit canonical form ignores key order', audit.stable({ b: 1, a: 2 }) === audit.stable({ a: 2, b: 1 }));

  // ---------- migration runner (fake pg client) ----------
  const tmp = fs.mkdtempSync(path.join(require('os').tmpdir(), 'mig-')); fs.writeFileSync(path.join(tmp, '0001_a.sql'), 'CREATE TABLE {{schema}}.a (id int);\r\n'); fs.writeFileSync(path.join(tmp, '0002_b.sql'), 'CREATE TABLE {{schema}}.b (id int);\n'); fs.writeFileSync(path.join(tmp, 'notes.txt'), 'x');
  const applied = new Map(), log = []; const mkClient = () => ({ async query(sql, p) { log.push(sql.slice(0, 50)); if (/FROM sandbox\.schema_migrations/.test(sql)) return { rows: [...applied].map(([version, checksum]) => ({ version, checksum })) }; if (/INSERT INTO sandbox\.schema_migrations/.test(sql)) applied.set(p[0], p[2]); return { rows: [] }; }, release() { log.push('release'); } });
  const mdb = { connect: async () => mkClient() };
  const r1 = await mig.runMigrations(mdb, { schema: 'sandbox', dir: tmp }); ok('migrations: applies new files in order, in transactions, under advisory lock', r1.ran.join() === '0001_a.sql,0002_b.sql' && log.includes('BEGIN') && log.includes('COMMIT') && log[0].startsWith('SELECT pg_advisory_lock') && log.some(l => l.startsWith('SELECT pg_advisory_unlock')) && log.at(-1) === 'release');
  ok('migrations: {{schema}} replaced; CRLF files get the same checksum as LF', mig.loadMigrations(tmp)[0].sql.includes('sandbox') === false && mig.normalize('a\r\nb') === 'a\nb' && applied.get(1) === mig.loadMigrations(tmp)[0].checksum);
  const r2 = await mig.runMigrations(mdb, { schema: 'sandbox', dir: tmp }); ok('migrations: second run is a no-op', r2.ran.length === 0);
  fs.writeFileSync(path.join(tmp, '0001_a.sql'), 'CREATE TABLE {{schema}}.a (id int, x int);\n'); ok('migrations: editing an applied file is refused', await mig.runMigrations(mdb, { schema: 'sandbox', dir: tmp }).then(() => false, e => /CHECKSUM_MISMATCH/.test(e.message)));
  ok('migrations: invalid schema name refused', await mig.runMigrations(mdb, { schema: 'x;drop', dir: tmp }).then(() => false, e => /Invalid schema/.test(e.message)));
  const real = mig.loadMigrations(); ok('repository migrations: numbered, unique, no unfinished placeholders, schema-qualified', real.length >= 2 && real.every((m, i) => m.version === i + 1) && real.every(m => !/TODO|FIXME/.test(m.sql)) && real.every(m => (m.sql.match(/CREATE (TABLE|INDEX|UNIQUE INDEX|FUNCTION|TRIGGER)/g) || []).length > 0) && real.every(m => !/CREATE TABLE (?!\{\{schema\}\}\.)/.test(m.sql)));
  ok('sandbox isolation enforced in the schema (environment CHECK)', /environment\s+text NOT NULL DEFAULT 'sandbox' CHECK \(environment = 'sandbox'\)/.test(real[0].sql));
  ok('audit table is append-only in SQL (update/delete/truncate triggers)', /BEFORE UPDATE OR DELETE/.test(real[1].sql) && /BEFORE TRUNCATE/.test(real[1].sql));
  console.log(fails ? 'FAILED ' + fails + ' of ' + n : 'ALL ' + n + ' MOCKED ACCOUNT TESTS PASSED (SQL not executed: see tests/live)'); process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
