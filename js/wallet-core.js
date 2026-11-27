'use strict';
// Wallet Stage 1: pure logic, no DOM, no network. DEMO DATA ONLY: nothing here moves money or changes real balances.
// In Stage 2 getRates() is replaced by a backend call; the quote() math stays the same.
(function () {
  const CODES = ['IQD', 'USD', 'IRT'];
  // IRT = Iranian TOMAN (1 toman = 10 rials). All IRT amounts on the platform are in toman.
  const CUR = Object.freeze({
    IQD: Object.freeze({ code: 'IQD', dec: 0, country: 'IQ' }),
    USD: Object.freeze({ code: 'USD', dec: 2, country: 'US' }),
    IRT: Object.freeze({ code: 'IRT', dec: 0, country: 'IR' })
  });
  const SUPPORT_PHONE = '9647723085061';
  const SUPPORT_DISPLAY = '+9647723085061';
  const DEMO_CUSTOMER = 'DEMO-CUST-0001';
  // Demo balances (examples only, frozen, never changed by this stage).
  const DEMO_BALANCES = Object.freeze({ IQD: 1500000, USD: 250, IRT: 12500000 });

  // Illustrative rates only. Units: how many units of each currency equal 1 USD. IQD/IRT are derived through USD,
  // so repeated conversions can never create a profit (also fees always apply).
  function getRates() {
    return {
      source: 'demo', isDemo: true, mode: 'via_usd',
      perUSD: { USD: 1, IQD: 1500, IRT: 150000 },
      feePct: 1, feeFixed: { IQD: 0, USD: 0, IRT: 0 },
      minUSD: 1, maxUSD: 10000, quoteTtlSec: 60
    };
  }

  // Customer may choose which currency to hold after funding (spec section 2).
  const FUNDING_CREDIT = Object.freeze({ IQD: ['IQD', 'USD'], IRT: ['IRT', 'USD'], USD: ['USD', 'IQD', 'IRT'] });
  // [methodId, status]. Status: available (manual only) | not_connected | coming_soon. No provider is invented or connected.
  const PAYMENT_METHODS = Object.freeze({
    IQD: [['support', 'available'], ['mastercard', 'not_connected'], ['visa', 'not_connected'], ['qicard', 'not_connected'], ['superqi', 'not_connected'], ['zaincash', 'not_connected'], ['fastpay', 'not_connected'], ['iqbank', 'not_connected'], ['iqother', 'coming_soon']],
    USD: [['support', 'available'], ['mastercard', 'not_connected'], ['visa', 'not_connected'], ['intlcards', 'not_connected'], ['intlwallets', 'not_connected'], ['gateways', 'coming_soon']],
    IRT: [['support', 'available'], ['shetab', 'not_connected'], ['irgateway', 'not_connected'], ['irbank', 'not_connected'], ['c2c', 'not_connected'], ['tomancash', 'coming_soon']]
  });
  const STATUSES = ['pending', 'under_review', 'approved', 'completed', 'rejected', 'failed', 'cancelled', 'refunded'];
  const TYPES = ['funding', 'exchange', 'refund', 'adjustment'];

  const fac = c => 10 ** CUR[c].dec;
  const clean = (v, c) => Math.round(v * fac(c) * 1e6) / 1e6;
  const roundDown = (v, c) => Math.floor(clean(v, c)) / fac(c);
  const roundUp = (v, c) => Math.ceil(clean(v, c)) / fac(c);

  // Accepts Latin, Arabic-Indic and Persian digits and common separators. IQD/IRT: whole numbers. USD: up to 2 decimals.
  function parseAmount(s, c) {
    if (!CUR[c]) return NaN;
    let x = String(s == null ? '' : s).trim()
      .replace(/[\u0660-\u0669]/g, d => d.charCodeAt(0) - 0x660)
      .replace(/[\u06F0-\u06F9]/g, d => d.charCodeAt(0) - 0x6F0)
      .replace(/\u066B/g, '.').replace(/[\s,\u066C\u060C_]/g, '');
    const re = CUR[c].dec === 0 ? /^\d{1,12}$/ : /^\d{1,12}(\.\d{1,2})?$/;
    return re.test(x) ? Number(x) : NaN;
  }
  const limitsIn = (c, rates = getRates()) => ({ min: roundUp(rates.minUSD * rates.perUSD[c], c), max: roundDown(rates.maxUSD * rates.perUSD[c], c) });

  // Core preview math. Returns numbers whenever a valid rate exists; `error` set when the conversion must stay disabled.
  function calc(from, to, amount, rates, balances, same) {
    const out = { ok: false, error: null, from, to, amount };
    const p = rates && rates.perUSD;
    if (!p || !(p[from] > 0) || !(p[to] > 0)) { out.error = 'noRate'; return out; }
    out.rate = same ? 1 : p[to] / p[from];
    out.feePct = same ? 0 : rates.feePct;
    const exact = same ? amount : amount * p[to] / p[from];
    out.gross = roundDown(exact, to);
    out.fee = same ? 0 : roundUp(exact * rates.feePct / 100 + ((rates.feeFixed && rates.feeFixed[to]) || 0), to);
    out.net = roundDown(exact - out.fee, to);
    const lim = limitsIn(from, rates);
    if (amount < lim.min) { out.error = 'min'; out.limit = lim.min; }
    else if (amount > lim.max) { out.error = 'max'; out.limit = lim.max; }
    else if (!(out.net > 0)) { out.error = 'min'; out.limit = lim.min; }
    else if (balances && amount > balances[from]) out.error = 'insufficient';
    out.ok = !out.error;
    return out;
  }
  // Currency exchange preview (between wallet balances).
  function quote(from, to, amountStr, ctx = {}) {
    const out = { ok: false, error: null, from, to };
    if (!CUR[from] || !CUR[to]) { out.error = 'invalid'; return out; }
    if (from === to) { out.error = 'same'; return out; }
    const amount = parseAmount(amountStr, from);
    if (!(amount > 0)) { out.error = 'invalid'; return out; }
    return calc(from, to, amount, ctx.rates || getRates(), ctx.balances || null, false);
  }
  // Funding preview (deposit currency -> wallet credit currency). Same currency = kept as is (rate 1, no fee).
  function fundingQuote(dep, credit, amountStr, ctx = {}) {
    const out = { ok: false, error: null, from: dep, to: credit };
    if (!CUR[dep] || !FUNDING_CREDIT[dep] || !FUNDING_CREDIT[dep].includes(credit)) { out.error = 'notAllowed'; return out; }
    const amount = parseAmount(amountStr, dep);
    if (!(amount > 0)) { out.error = 'invalid'; return out; }
    return calc(dep, credit, amount, ctx.rates || getRates(), null, dep === credit);
  }
  // Display scale for a rate: raise the base (1, 1,000, 1,000,000) until the quoted value is at least 1, e.g. "1,000 IQD = 0.667 USD".
  function scaleRate(r) { let base = 1; while (r < 1 && base < 1e6) { base *= 1000; r *= 1000; } return { base, value: Math.round(r * 1e6) / 1e6 }; }
  function rateLine(a, b, rates = getRates()) {
    const p = rates.perUSD; if (!p || !(p[a] > 0) || !(p[b] > 0)) return null;
    const s = scaleRate(p[b] / p[a]); return { base: s.base, a, value: s.value, b };
  }

  const fmtPlain = (n, c) => Number(n).toLocaleString('en-US', { minimumFractionDigits: CUR[c].dec, maximumFractionDigits: CUR[c].dec });
  // Prefilled WhatsApp message. Contains no passwords, card or bank details.
  function fundMessage(r) {
    return ['Hello Miri Iran Support,', '', 'I would like to fund my wallet.', '',
      'Customer reference: ' + r.customerId,
      'Funding request ID: ' + r.id,
      'Deposit currency: ' + r.fromCur,
      'Deposit amount: ' + fmtPlain(r.amount, r.fromCur),
      'Requested wallet currency: ' + r.toCur,
      'Preferred payment method: ' + (r.method === 'support' ? 'Manual funding through customer support' : String(r.method)),
      '', 'Please provide the payment instructions.'].join('\n');
  }
  const whatsAppUrl = text => 'https://wa.me/' + SUPPORT_PHONE + (text ? '?text=' + encodeURIComponent(text) : '');
  // Demo reference. The real unique ID will be issued by the backend (Stage 3).
  function makeFundRef(existing) {
    const used = new Set(existing || []); let n = 0, id;
    do { n++; id = 'DEMO-FUND-' + String(n).padStart(4, '0'); } while (used.has(id));
    return id;
  }
  const p2 = n => String(n).padStart(2, '0');
  const nowLocal = (d = new Date()) => d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate()) + 'T' + p2(d.getHours()) + ':' + p2(d.getMinutes());

  const tx = (id, type, status, fromCur, amount, toCur, rate, fee, final, method, at) => ({ id, customerId: DEMO_CUSTOMER, type, status, fromCur, amount, toCur, rate, fee, final, method, at, isDemo: true });
  function demoTransactions() {
    return [
      tx('DEMO-TX-0001', 'funding', 'completed', 'IQD', 300000, 'IQD', 1, 0, 300000, 'support', '2026-11-18T09:30'),
      tx('DEMO-TX-0002', 'exchange', 'completed', 'USD', 100, 'IQD', 1500, 1500, 148500, 'wallet', '2026-11-20T14:05'),
      tx('DEMO-TX-0003', 'funding', 'rejected', 'USD', 50, 'IRT', 150000, 75000, 7425000, 'support', '2026-11-22T11:40'),
      tx('DEMO-FUND-9001', 'funding', 'pending', 'IRT', 15000000, 'USD', 1 / 150000, 1, 99, 'support', '2026-11-24T16:20'),
      tx('DEMO-FUND-9002', 'funding', 'under_review', 'IQD', 150000, 'USD', 1 / 1500, 1, 99, 'support', '2026-11-25T10:10'),
      tx('DEMO-TX-0004', 'exchange', 'cancelled', 'IRT', 3000000, 'IQD', 1 / 100, 300, 29700, 'wallet', '2026-11-26T18:45'),
      tx('DEMO-TX-0005', 'funding', 'failed', 'IQD', 75000, 'IQD', 1, 0, 75000, 'support', '2026-11-19T12:00'),
      tx('DEMO-TX-0006', 'funding', 'approved', 'USD', 200, 'USD', 1, 0, 200, 'support', '2026-11-23T08:15'),
      tx('DEMO-TX-0007', 'refund', 'refunded', 'USD', 20, 'USD', 1, 0, 20, 'wallet', '2026-11-21T17:30')
    ];
  }
  // Filters: date range (YYYY-MM-DD, inclusive), currency (either side), type, status. Empty value = no filter.
  function filterTx(list, f = {}) {
    return list.filter(x => (!f.from || x.at.slice(0, 10) >= f.from) && (!f.to || x.at.slice(0, 10) <= f.to) &&
      (!f.currency || x.fromCur === f.currency || x.toCur === f.currency) && (!f.type || x.type === f.type) && (!f.status || x.status === f.status));
  }
  const isPending = x => x.type === 'funding' && (x.status === 'pending' || x.status === 'under_review');

  const MIW = { VERSION: 'wallet-stage1', CODES, CUR, SUPPORT_PHONE, SUPPORT_DISPLAY, DEMO_CUSTOMER, DEMO_BALANCES, FUNDING_CREDIT, PAYMENT_METHODS, STATUSES, TYPES,
    getRates, parseAmount, limitsIn, quote, fundingQuote, rateLine, scaleRate, fundMessage, whatsAppUrl, makeFundRef, nowLocal, demoTransactions, filterTx, isPending, roundDown, roundUp };
  if (typeof module !== 'undefined') module.exports = MIW; else window.MIW = MIW;
})();
