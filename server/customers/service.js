'use strict';
// Account flows (registration, verification, login, sessions, password recovery, profile, admin status).
// Rules: no account enumeration (register / resend / forgot always answer the same), single-use tokens, scrypt passwords,
// sessions are opaque random tokens (only an HMAC fingerprint is stored), every state change is audited in the SAME transaction.
const { AppError } = require('../errors');
const S = require('./security');
const V = require('./validate');
const { writeAudit } = require('./audit');

const publicCustomer = r => ({ customerNo: r.customer_no, email: r.email, emailVerified: !!r.email_verified_at, fullName: r.full_name, phone: r.phone || null, preferredLang: r.preferred_lang, status: r.status, createdAt: r.created_at, lastLoginAt: r.last_login_at || null });
const adminCustomer = r => ({ id: r.id, ...publicCustomer(r), statusReason: r.status_reason || null, failedLogins: r.failed_logins === undefined ? undefined : r.failed_logins });
const VERIFY_TTL_MIN = 24 * 60, RESET_TTL_MIN = 60;
const LOGIN_OK = new Set(['active', 'restricted']);

function createService({ db, repo, mailer, limiter, cfg, logger = {}, now = () => new Date() }) {
  const log = (l, m, x) => { try { if (logger[l]) logger[l](m, x); } catch (_) { /* ignore */ } };
  const ipHash = ctx => S.hashIp(cfg.pepper, ctx.ip);
  const audit = (c, ctx, e) => writeAudit(c, { ipHash: ipHash(ctx), ...e }, now);
  let dummyHash = null; // used so that unknown e-mails cost the same time as known ones
  const getDummy = async () => dummyHash || (dummyHash = await S.hashPassword('dummy-password-for-timing-only'));
  const isUnique = (e, what) => e && e.code === '23505' && String(e.constraint || '').includes(what);

  async function issueToken(c, customerId, purpose, ttlMin) {
    await repo.invalidateTokens(c, customerId, purpose);
    const token = S.randomToken(); await repo.insertAuthToken(c, { customerId, purpose, tokenHash: S.sha256(token), ttlMin });
    return token;
  }

  async function register(res, ctx, body) {
    const v = V.register(body);
    await limiter.hit(res, 'register-ip', ctx.ip, 10, 3600);
    const passwordHash = await S.hashPassword(v.password); // always hashed first: same cost whether the e-mail exists or not
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        await db.tx(async c => {
          const existing = await repo.findByEmail(c, v.email);
          if (existing) {
            await mailer.send(c, { to: existing.email, lang: existing.preferred_lang, template: 'exists' });
            await audit(c, ctx, { actorType: 'system', action: 'register_duplicate', entityType: 'customer', entityId: existing.id });
            return;
          }
          const cust = await repo.insertCustomer(c, { customerNo: S.newCustomerNo(), email: v.email, passwordHash, fullName: v.fullName, phone: v.phone, lang: v.lang });
          const token = await issueToken(c, cust.id, 'verify_email', VERIFY_TTL_MIN);
          await mailer.send(c, { to: cust.email, lang: cust.preferred_lang, template: 'verify', token });
          await audit(c, ctx, { actorType: 'customer', actorId: cust.id, action: 'register', entityType: 'customer', entityId: cust.id, meta: { lang: v.lang } });
        });
        return { ok: true };
      } catch (e) { if (isUnique(e, 'customer_no') || isUnique(e, 'email_norm')) continue; throw e; } // id collision or a concurrent registration: retry
    }
    throw new AppError(503, 'TRY_AGAIN', 'Please try again.');
  }

  async function verifyEmail(res, ctx, body) {
    const token = V.token(body);
    await limiter.hit(res, 'verify-ip', ctx.ip, 30, 900);
    await db.tx(async c => {
      const id = await repo.consumeAuthToken(c, S.sha256(token), 'verify_email');
      if (!id) throw new AppError(400, 'INVALID_OR_EXPIRED_TOKEN', 'This link is not valid or has expired.');
      await repo.markVerified(c, id);
      await audit(c, ctx, { actorType: 'customer', actorId: id, action: 'email_verified', entityType: 'customer', entityId: id });
    });
    return { ok: true };
  }

  async function resendVerification(res, ctx, body) {
    const email = V.email(body);
    await limiter.hit(res, 'resend-ip', ctx.ip, 10, 3600); await limiter.hit(res, 'resend-email', email, 3, 3600);
    await db.tx(async c => {
      const cust = await repo.findByEmail(c, email);
      if (!cust || cust.status !== 'pending_verification') return; // same answer either way
      const token = await issueToken(c, cust.id, 'verify_email', VERIFY_TTL_MIN);
      await mailer.send(c, { to: cust.email, lang: cust.preferred_lang, template: 'verify', token });
      await audit(c, ctx, { actorType: 'customer', actorId: cust.id, action: 'verification_resent', entityType: 'customer', entityId: cust.id });
    });
    return { ok: true };
  }

  async function login(res, ctx, body) {
    const v = V.loginInput(body);
    await limiter.hit(res, 'login-ip', ctx.ip, 30, 900); await limiter.hit(res, 'login-email', v.email, 10, 900);
    const cust = await repo.findByEmail(db, v.email);
    const okPw = await S.verifyPassword(v.password, cust ? cust.password_hash : await getDummy());
    if (!cust || !okPw) {
      if (cust) await db.tx(async c => { await repo.bumpFailed(c, cust.id); await audit(c, ctx, { actorType: 'customer', actorId: cust.id, action: 'login_failed', entityType: 'customer', entityId: cust.id }); });
      throw new AppError(401, 'INVALID_CREDENTIALS', 'Wrong e-mail or password.');
    }
    if (!LOGIN_OK.has(cust.status)) {
      await db.tx(c => audit(c, ctx, { actorType: 'customer', actorId: cust.id, action: 'login_blocked', entityType: 'customer', entityId: cust.id, meta: { status: cust.status } }));
      throw cust.status === 'pending_verification' ? new AppError(403, 'EMAIL_NOT_VERIFIED', 'Please verify your e-mail first.') : new AppError(403, 'ACCOUNT_SUSPENDED', 'This account cannot sign in. Contact support.');
    }
    const token = S.randomToken();
    const sess = await db.tx(async c => {
      const s = await repo.insertSession(c, { customerId: cust.id, tokenHash: S.hmac(cfg.pepper, token), idleMin: cfg.idleMin, absDays: cfg.absDays, ipHash: ipHash(ctx), userAgent: String(ctx.ua || '').slice(0, 200) || null });
      await repo.recordLogin(c, cust.id);
      await audit(c, ctx, { actorType: 'customer', actorId: cust.id, action: 'login_success', entityType: 'customer', entityId: cust.id, meta: { sessionId: s.id } });
      return s;
    });
    await limiter.reset('login-email', v.email);
    return { token, idleExpiresAt: sess.idle_expires_at, absoluteExpiresAt: sess.abs_expires_at, customer: publicCustomer(cust) };
  }

  // Returns { customer(row), sessionId }. Throws 401 for any invalid / expired / revoked token or a blocked account.
  async function authenticate(bearer) {
    const t = String(bearer || '');
    if (!S.TOKEN_RE.test(t)) throw new AppError(401, 'SESSION_INVALID', 'Please sign in.');
    const row = await repo.findSession(db, S.hmac(cfg.pepper, t));
    if (!row || !LOGIN_OK.has(row.status)) throw new AppError(401, 'SESSION_INVALID', 'Please sign in.');
    repo.touchSession(db, row.session_id, cfg.idleMin).catch(e => log('warn', 'touchSession failed', { message: e && e.message })); // best effort, never blocks
    return { customer: row, sessionId: row.session_id };
  }
  const me = a => ({ customer: publicCustomer(a.customer) });

  async function logout(ctx, a) { await db.tx(async c => { await repo.revokeSession(c, a.sessionId, 'logout'); await audit(c, ctx, { actorType: 'customer', actorId: a.customer.customer_id, action: 'logout', entityType: 'customer', entityId: a.customer.customer_id }); }); return { ok: true }; }
  async function logoutAll(ctx, a) { const n = await db.tx(async c => { const k = await repo.revokeAll(c, a.customer.customer_id, null, 'logout_all'); await audit(c, ctx, { actorType: 'customer', actorId: a.customer.customer_id, action: 'logout_all', entityType: 'customer', entityId: a.customer.customer_id, meta: { revoked: k } }); return k; }); return { ok: true, revoked: n }; }

  async function updateProfile(ctx, a, body) {
    const p = V.profile(body), id = a.customer.customer_id;
    const row = await db.tx(async c => { const r = await repo.updateProfile(c, id, p); await audit(c, ctx, { actorType: 'customer', actorId: id, action: 'profile_updated', entityType: 'customer', entityId: id, meta: { fields: Object.keys(p) } }); return r; });
    return { customer: publicCustomer(row) };
  }

  async function changePassword(res, ctx, a, body) {
    const id = a.customer.customer_id;
    await limiter.hit(res, 'chpw', id, 10, 3600);
    if (typeof body.currentPassword !== 'string' || !body.currentPassword) throw new AppError(403, 'INVALID_CREDENTIALS', 'The current password is wrong.');
    const full = await repo.findByIdWithHash(db, id);
    if (!full || !(await S.verifyPassword(body.currentPassword, full.password_hash))) throw new AppError(403, 'INVALID_CREDENTIALS', 'The current password is wrong.');
    V.newPassword(body.newPassword, full.email);
    const hash = await S.hashPassword(body.newPassword);
    await db.tx(async c => {
      await repo.setPassword(c, id, hash);
      const n = await repo.revokeAll(c, id, a.sessionId, 'password_changed'); // other devices are signed out, this one stays
      await mailer.send(c, { to: full.email, lang: full.preferred_lang, template: 'changed' });
      await audit(c, ctx, { actorType: 'customer', actorId: id, action: 'password_changed', entityType: 'customer', entityId: id, meta: { revoked: n } });
    });
    return { ok: true };
  }

  async function forgotPassword(res, ctx, body) {
    const email = V.email(body);
    await limiter.hit(res, 'forgot-ip', ctx.ip, 10, 3600); await limiter.hit(res, 'forgot-email', email, 3, 3600);
    await db.tx(async c => {
      const cust = await repo.findByEmail(c, email);
      if (!cust || cust.status === 'suspended' || cust.status === 'closed') return; // same answer either way
      const token = await issueToken(c, cust.id, 'reset_password', RESET_TTL_MIN);
      await mailer.send(c, { to: cust.email, lang: cust.preferred_lang, template: 'reset', token });
      await audit(c, ctx, { actorType: 'customer', actorId: cust.id, action: 'password_reset_requested', entityType: 'customer', entityId: cust.id });
    });
    return { ok: true };
  }

  async function resetPassword(res, ctx, body) {
    const token = V.token(body);
    await limiter.hit(res, 'reset-ip', ctx.ip, 20, 3600);
    V.newPassword(body.password, null);
    const hash = await S.hashPassword(body.password);
    await db.tx(async c => {
      const id = await repo.consumeAuthToken(c, S.sha256(token), 'reset_password');
      if (!id) throw new AppError(400, 'INVALID_OR_EXPIRED_TOKEN', 'This link is not valid or has expired.');
      await repo.setPassword(c, id, hash);
      await repo.markVerified(c, id); // the link was delivered to the owner's mailbox
      const n = await repo.revokeAll(c, id, null, 'password_reset');
      await audit(c, ctx, { actorType: 'customer', actorId: id, action: 'password_reset', entityType: 'customer', entityId: id, meta: { revoked: n } });
    });
    return { ok: true };
  }

  // ---- administration (called only after the admin session + CSRF checks in the handler) ----
  async function adminList(q, limit) {
    const term = String(q || '').trim().slice(0, 100) || null;
    return { customers: (await repo.listCustomers(db, { q: term, limit: Math.min(100, Math.max(1, Number(limit) || 25)) })).map(adminCustomer) };
  }
  async function adminSetStatus(ctx, admin, body) {
    const v = V.adminStatus(body);
    const row = await db.tx(async c => {
      const r = await repo.setStatus(c, v.id, v.status, v.reason, admin);
      if (!r) throw new AppError(404, 'NOT_FOUND', 'Customer not found.');
      let revoked = 0; if (v.status === 'suspended' || v.status === 'closed') revoked = await repo.revokeAll(c, v.id, null, 'status_' + v.status);
      await audit(c, ctx, { actorType: 'admin', actorId: admin, action: 'customer_status_changed', entityType: 'customer', entityId: v.id, meta: { status: v.status, reason: v.reason, revoked } });
      return r;
    });
    return { customer: adminCustomer(row) };
  }
  async function adminOutbox(limit) { return { messages: await repo.listOutbox(db, Math.min(50, Math.max(1, Number(limit) || 20))) }; }

  return { register, verifyEmail, resendVerification, login, authenticate, me, logout, logoutAll, updateProfile, changePassword, forgotPassword, resetPassword, adminList, adminSetStatus, adminOutbox };
}
module.exports = { createService, publicCustomer };
