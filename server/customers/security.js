'use strict';
const crypto = require('crypto');
const { hashPassword, verifyPassword } = require('../wallet/auth');

const randomToken = (bytes = 32) => crypto.randomBytes(bytes).toString('base64url');
const hmac = (pepper, v) => crypto.createHmac('sha256', pepper).update(String(v)).digest();            // session token -> stored fingerprint (Buffer)
const sha256 = v => crypto.createHash('sha256').update(String(v)).digest();                              // e-mail/reset token fingerprint (tokens are 256-bit random)
const hashIp = (pepper, ip) => crypto.createHmac('sha256', pepper).update('ip|' + String(ip || '')).digest('hex').slice(0, 32); // IPs are never stored in clear
const hashKey = (pepper, v) => crypto.createHmac('sha256', pepper).update('rl|' + String(v)).digest('hex').slice(0, 32);
const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;                                                                  // 32 random bytes, base64url

const CUSTOMER_ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function newCustomerNo() { const b = crypto.randomBytes(8); let s = 'MI-'; for (const x of b) s += CUSTOMER_ALPHA[x % 32]; return s; }

const normalizeEmail = e => String(e == null ? '' : e).normalize('NFKC').trim().toLowerCase();
const EMAIL_RE = /^[^\s@<>()[\]\\,;:"]{1,64}@[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/;
const validEmail = e => e.length <= 254 && EMAIL_RE.test(e);

const COMMON = new Set(['password', 'password1', '123456789', '1234567890', 'qwertyuiop', 'iloveyou12', '12345678910', 'abcdefghij', 'letmein123', 'admin12345', 'welcome123', 'passw0rd12', '0123456789', '1q2w3e4r5t', 'qazwsxedcr']);
// Returns a field error code or null. Codes: too_short, too_long, common, same_as_email.
function passwordProblem(pw, email) {
  if (typeof pw !== 'string') return 'too_short';
  if (pw.length < 10) return 'too_short';
  if (pw.length > 128) return 'too_long';
  const low = pw.toLowerCase();
  if (COMMON.has(low) || /^(.)\1+$/.test(pw)) return 'common';
  if (email && (low === email || low === String(email).split('@')[0])) return 'same_as_email';
  return null;
}
module.exports = { randomToken, hmac, sha256, hashIp, hashKey, TOKEN_RE, newCustomerNo, normalizeEmail, validEmail, passwordProblem, hashPassword, verifyPassword };
