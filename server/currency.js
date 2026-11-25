'use strict';
// 1 toman = 10 rial. Never treat them as equal. Unknown currencies are passed through unchanged and flagged.
function toToman(amount, currency) {
  const n = Number(amount), cur = String(currency || '').toUpperCase();
  if (!Number.isFinite(n) || n < 0) return { amountToman: null, original: { amount, currency }, converted: false, reason: 'invalid_amount' };
  if (cur === 'IRR' || cur === 'RIAL' || cur === 'IRAN RIAL') return { amountToman: Math.round(n / 10), original: { amount: n, currency: 'IRR' }, converted: true };
  if (cur === 'IRT' || cur === 'TOMAN') return { amountToman: Math.round(n), original: { amount: n, currency: 'IRT' }, converted: false };
  return { amountToman: null, original: { amount: n, currency: cur || 'UNKNOWN' }, converted: false, reason: 'unsupported_currency' };
}
module.exports = { toToman };
