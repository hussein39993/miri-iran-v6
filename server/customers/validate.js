'use strict';
const { AppError } = require('../errors');
const S = require('./security');
const LANGS = ['ar', 'fa', 'en'];
const clean = s => String(s == null ? '' : s).normalize('NFKC').replace(/[\u0000-\u001F\u007F<>]/g, '').replace(/\s+/g, ' ').trim();

// Each validator returns { value } or throws AppError(400, VALIDATION, ..., { field: code }).
const fail = fields => { throw new AppError(400, 'VALIDATION', 'Some values are not valid.', fields); };
function fullName(v) { const s = clean(v); return s.length >= 2 && s.length <= 100 ? s : null; }
function phone(v) {
  if (v == null || String(v).trim() === '') return { value: null };
  const s = String(v).trim().replace(/[\s()-]/g, '');
  return /^\+?\d{7,15}$/.test(s) ? { value: s } : { error: 'invalid' };
}
function lang(v, fallback = 'ar') { return v == null || v === '' ? fallback : LANGS.includes(v) ? v : null; }

function register(b) {
  const f = {}, name = fullName(b.fullName), email = S.normalizeEmail(b.email), ph = phone(b.phone), l = lang(b.lang);
  if (!name) f.fullName = 'invalid'; if (!S.validEmail(email)) f.email = 'invalid'; if (ph.error) f.phone = 'invalid'; if (!l) f.lang = 'invalid';
  const pw = S.passwordProblem(b.password, email); if (pw) f.password = pw;
  if (Object.keys(f).length) fail(f);
  return { fullName: name, email, phone: ph.value, lang: l, password: b.password };
}
function email(b) { const e = S.normalizeEmail(b.email); if (!S.validEmail(e)) fail({ email: 'invalid' }); return e; }
function loginInput(b) { const e = S.normalizeEmail(b.email); if (!S.validEmail(e) || typeof b.password !== 'string' || !b.password || b.password.length > 128) throw new AppError(401, 'INVALID_CREDENTIALS', 'Wrong e-mail or password.'); return { email: e, password: b.password }; }
function token(b) { const t = String(b.token || ''); if (!S.TOKEN_RE.test(t)) throw new AppError(400, 'INVALID_OR_EXPIRED_TOKEN', 'This link is not valid or has expired.'); return t; }
function profile(b) {
  const f = {}, out = {};
  if ('fullName' in b) { const n = fullName(b.fullName); if (!n) f.fullName = 'invalid'; else out.fullName = n; }
  if ('phone' in b) { const p = phone(b.phone); if (p.error) f.phone = 'invalid'; else out.phone = p.value; }
  if ('lang' in b) { const l = lang(b.lang); if (!l) f.lang = 'invalid'; else out.lang = l; }
  if (Object.keys(f).length) fail(f);
  if (!Object.keys(out).length) fail({ form: 'empty' });
  return out;
}
function newPassword(pw, email) { const p = S.passwordProblem(pw, email); if (p) fail({ password: p }); return pw; }
const STATUSES = ['active', 'restricted', 'suspended', 'closed'];
function adminStatus(b) {
  const f = {}; const id = String(b.customerId || '');
  if (!/^[0-9a-f-]{36}$/i.test(id)) f.customerId = 'invalid';
  if (!STATUSES.includes(b.status)) f.status = 'invalid';
  const reason = clean(b.reason).slice(0, 300); if (b.status !== 'active' && reason.length < 3) f.reason = 'required';
  if (Object.keys(f).length) fail(f);
  return { id, status: b.status, reason: reason || null };
}
module.exports = { register, email, loginInput, token, profile, newPassword, adminStatus, clean, STATUSES };
