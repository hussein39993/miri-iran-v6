'use strict';
// Wallet (Stage 2): pure logic shared by the browser and the Node server (server/wallet/*). No DOM, no network.
// Nothing here moves money. Exchange rates come ONLY from the administrator (backend); there is no built-in fallback rate.
(function () {
  const CODES = ['IQD', 'USD', 'IRT'], FOREIGN = ['IQD', 'IRT'], PER = 100; // all admin rates are "units of currency per 100 USD"
  // IRT = Iranian TOMAN (1 toman = 10 rials). All IRT amounts on the platform are in toman.
  const CUR = Object.freeze({
    IQD: Object.freeze({ code: 'IQD', dec: 0, country: 'IQ' }),
    USD: Object.freeze({ code: 'USD', dec: 2, country: 'US' }),
    IRT: Object.freeze({ code: 'IRT', dec: 0, country: 'IR' })
  });
  const SUPPORT_PHONE = '9647723085061';
  const SUPPORT_DISPLAY = '+9647723085061';
  const DEMO_CUSTOMER = 'DEMO-CUST-0001';
  const DEMO_BALANCES = Object.freeze({ IQD: 1500000, USD: 250, IRT: 12500000 }); // examples only, never changed

  const FUNDING_CREDIT = Object.freeze({ IQD: ['IQD', 'USD'], IRT: ['IRT', 'USD'], USD: ['USD', 'IQD', 'IRT'] });
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
  const p2 = n => String(n).padStart(2, '0');
  const iso = ms => new Date(ms).toISOString();

  // Accepts Latin, Arabic-Indic and Persian digits and common separators.
  const normDigits = s => String(s == null ? '' : s).trim().replace(/[\u0660-\u0669]/g, d => d.charCodeAt(0) - 0x660).replace(/[\u06F0-\u06F9]/g, d => d.charCodeAt(0) - 0x6F0).replace(/\u066B/g, '.').replace(/[\s,\u066C\u060C_]/g, '');
  function parseDecimal(s, maxDec, maxInt = 12) {
    const re = new RegExp('^\\d{1,' + maxInt + '}' + (maxDec > 0 ? '(\\.\\d{1,' + maxDec + '})?' : '') + '$'), x = normDigits(s);
    return re.test(x) ? Number(x) : NaN;
  }
  const parseAmount = (s, c) => (CUR[c] ? parseDecimal(s, CUR[c].dec) : NaN);

  // ---------- Rates (always supplied by the backend) ----------
  // API document -> internal rates object. Returns null (conversion disabled) when anything is missing or inconsistent.
  function fromApi(doc, receivedAt = Date.now()) {
    if (!doc || doc.status !== 'ok' || !doc.buy || !doc.sell || !doc.fees || !doc.limits) return null;
    const left = Number(doc.secondsLeft);
    if (!(left > 0)) return null;
    for (const c of FOREIGN) { const b = Number(doc.buy[c]), s = Number(doc.sell[c]); if (!(b > 0) || !(s > 0) || b > s) return null; } // buy > sell would allow profit loops
    const f = Number(doc.fees.fundingPct), e = Number(doc.fees.exchangePct), mn = Number(doc.limits.minUSD), mx = Number(doc.limits.maxUSD);
    if (!(f >= 0) || !(e >= 0) || !(mn > 0) || !(mx > mn)) return null;
    return {
      source: 'admin', isDemo: false, version: doc.version, updatedAt: doc.updatedAt, validUntil: doc.validUntil,
      buy: { IQD: Number(doc.buy.IQD), IRT: Number(doc.buy.IRT) }, sell: { IQD: Number(doc.sell.IQD), IRT: Number(doc.sell.IRT) },
      fees: { fundingPct: f, exchangePct: e }, limits: { minUSD: mn, maxUSD: mx },
      deadline: receivedAt + left * 1000, quoteTtlSec: 60 // deadline uses the server's remaining seconds, not the visitor's clock
    };
  }
  const rateUsable = (R, now = Date.now()) => !!(R && R.buy && R.sell && R.fees && R.limits && now < R.deadline);
  // USD->X uses the BUY rate (we buy USD), X->USD uses the SELL rate, X->Y goes through USD using the worse side of both.
  // Because buy <= sell, any round trip or triangle returns less than it started with.
  function convertExact(from, to, amount, R) {
    if (from === 'USD') return amount * R.buy[to] / PER;
    if (to === 'USD') return amount * PER / R.sell[from];
    return amount * R.buy[to] / R.sell[from];
  }
  const pairRate = (from, to, R) => convertExact(from, to, 1, R);
  function limitsIn(c, R) {
    const L = R.limits;
    return c === 'USD' ? { min: roundUp(L.minUSD, 'USD'), max: roundDown(L.maxUSD, 'USD') } : { min: roundUp(L.minUSD * R.sell[c] / PER, c), max: roundDown(L.maxUSD * R.sell[c] / PER, c) };
  }
  function derivedTable(R) { return [['USD', 'IQD'], ['IQD', 'USD'], ['USD', 'IRT'], ['IRT', 'USD'], ['IQD', 'IRT'], ['IRT', 'IQD']].map(([from, to]) => ({ from, to, rate: pairRate(from, to, R) })); }
  // Triangle IQD->USD->IRT->IQD etc. Always <= 1 when buy <= sell.
  const roundTripFactor = R => (R.buy.IRT / R.sell.IQD) * (R.buy.IQD / R.sell.IRT);

  // Core preview math. mode 'exchange' = wallet conversion, 'funding' = deposit (adds the funding commission).
  function calc(from, to, amount, R, balances, mode) {
    const out = { ok: false, error: null, from, to, amount };
    if (!rateUsable(R)) { out.error = 'noRate'; return out; }
    const same = from === to, exact = same ? amount : convertExact(from, to, amount, R);
    out.rate = same ? 1 : pairRate(from, to, R);
    out.exchangePct = same ? 0 : R.fees.exchangePct; out.fundingPct = mode === 'funding' ? R.fees.fundingPct : 0;
    out.gross = roundDown(exact, to);
    out.exchangeFee = same ? 0 : roundUp(exact * R.fees.exchangePct / 100, to);
    out.fundingFee = mode === 'funding' ? roundUp(exact * R.fees.fundingPct / 100, to) : 0;
    out.fee = clean(out.exchangeFee + out.fundingFee, to) / fac(to);
    out.net = roundDown(exact - out.fee, to);
    const lim = limitsIn(from, R);
    if (amount < lim.min) { out.error = 'min'; out.limit = lim.min; }
    else if (amount > lim.max) { out.error = 'max'; out.limit = lim.max; }
    else if (!(out.net > 0)) { out.error = 'min'; out.limit = lim.min; }
    else if (balances && amount > balances[from]) out.error = 'insufficient';
    out.ok = !out.error;
    return out;
  }
  function quote(from, to, amountStr, ctx = {}) {
    const out = { ok: false, error: null, from, to };
    if (!CUR[from] || !CUR[to]) { out.error = 'invalid'; return out; }
    if (from === to) { out.error = 'same'; return out; }
    if (!rateUsable(ctx.rates)) { out.error = 'noRate'; return out; }
    const amount = parseAmount(amountStr, from);
    if (!(amount > 0)) { out.error = 'invalid'; return out; }
    return calc(from, to, amount, ctx.rates, ctx.balances || null, 'exchange');
  }
  function fundingQuote(dep, credit, amountStr, ctx = {}) {
    const out = { ok: false, error: null, from: dep, to: credit };
    if (!CUR[dep] || !FUNDING_CREDIT[dep] || !FUNDING_CREDIT[dep].includes(credit)) { out.error = 'notAllowed'; return out; }
    if (!rateUsable(ctx.rates)) { out.error = 'noRate'; return out; }
    const amount = parseAmount(amountStr, dep);
    if (!(amount > 0)) { out.error = 'invalid'; return out; }
    return calc(dep, credit, amount, ctx.rates, null, 'funding');
  }

  // ---------- Admin input validation (used by the server; mirrored errors are shown in the admin page) ----------
  const RATE_FIELDS = [['buyIQD', 'buy', 'IQD'], ['sellIQD', 'sell', 'IQD'], ['buyIRT', 'buy', 'IRT'], ['sellIRT', 'sell', 'IRT']];
  function validateRatesInput(inp, prev, nowMs, user) {
    inp = inp || {}; const errors = [], bad = (field, code) => errors.push({ field, code }), v = {};
    RATE_FIELDS.forEach(([f]) => { const n = parseDecimal(inp[f], 2, 12); if (n > 0) v[f] = n; else bad(f, 'invalid'); });
    const pct = f => { const n = parseDecimal(inp[f], 2, 2); if (Number.isNaN(n)) { bad(f, 'invalid'); return null; } if (n > 20) { bad(f, 'range'); return null; } return n; };
    const fundingPct = pct('fundingPct'), exchangePct = pct('exchangePct');
    const minUSD = parseDecimal(inp.minUSD, 2, 7), maxUSD = parseDecimal(inp.maxUSD, 2, 7);
    if (!(minUSD >= 0.01)) bad('minUSD', 'invalid');
    if (!(maxUSD > 0)) bad('maxUSD', 'invalid'); else if (minUSD >= 0.01 && maxUSD <= minUSD) bad('maxUSD', 'range');
    const hours = parseDecimal(inp.validHours, 0, 3); if (!(hours >= 1 && hours <= 168)) bad('validHours', 'range');
    FOREIGN.forEach(c => { const b = v['buy' + c], s = v['sell' + c]; if (b > 0 && s > 0) { if (b > s) bad('buy' + c, 'buyAboveSell'); else if (s / b > 1.25) bad('sell' + c, 'spreadTooWide'); } });
    if (!errors.length && prev && !inp.confirmLargeChange) RATE_FIELDS.forEach(([f, k, c]) => { const old = prev[k] && prev[k][c]; if (old > 0 && Math.abs(v[f] - old) / old > 0.10) bad(f, 'largeChange'); });
    if (errors.length) return { ok: false, errors };
    return { ok: true, errors: [], doc: { per: PER, buy: { IQD: v.buyIQD, IRT: v.buyIRT }, sell: { IQD: v.sellIQD, IRT: v.sellIRT }, fees: { fundingPct, exchangePct }, limits: { minUSD, maxUSD }, hours, validFrom: iso(nowMs), validUntil: iso(nowMs + hours * 3600000), updatedAt: iso(nowMs), updatedBy: String(user || '') } };
  }

  // ---------- Display helpers and WhatsApp message ----------
  function scaleRate(r) { let base = 1; while (r < 1 && base < 1e6) { base *= 1000; r *= 1000; } return { base, value: Math.round(r * 1e6) / 1e6 }; }
  const num = (n, sig) => Number(n).toLocaleString('en-US', sig ? { maximumSignificantDigits: sig } : { maximumFractionDigits: 6 });
  const fmtPlain = (n, c) => Number(n).toLocaleString('en-US', { minimumFractionDigits: CUR[c].dec, maximumFractionDigits: CUR[c].dec });
  const rateStr = (from, to, rate) => { const s = scaleRate(rate); return num(s.base) + ' ' + from + ' = ' + num(s.value, 6) + ' ' + to; };
  const WA = {
    en: { hello: 'Hello Miri Iran Support,', want: 'I would like to fund my wallet.', demo: 'Note: this is a TEST (demo) request. No real payment has been made.', cust: 'Customer reference', id: 'Funding request ID', when: 'Request date and time', dc: 'Deposit currency', da: 'Deposit amount', wc: 'Requested wallet currency', rate: 'Exchange rate', ff: 'Funding commission', xf: 'Exchange commission', net: 'Expected net amount', est: '(estimate, subject to confirmation)', pm: 'Preferred payment method', pmv: 'Manual funding through customer support', ask: 'Please provide the payment instructions.' },
    ar: { hello: 'مرحباً فريق دعم ميري إيران،', want: 'أرغب في شحن محفظتي الإلكترونية.', demo: 'ملاحظة: هذا طلب تجريبي (اختبار). لم يتم أي دفع حقيقي.', cust: 'رقم العميل', id: 'رقم طلب الشحن', when: 'تاريخ ووقت الطلب', dc: 'عملة الإيداع', da: 'مبلغ الإيداع', wc: 'عملة المحفظة المطلوبة', rate: 'سعر الصرف', ff: 'عمولة الشحن', xf: 'عمولة التحويل', net: 'صافي المبلغ المتوقع', est: '(تقدير، يخضع للتأكيد)', pm: 'طريقة الدفع المفضلة', pmv: 'شحن يدوي عن طريق الدعم الفني', ask: 'أرجو إرسال تعليمات الدفع.' },
    fa: { hello: 'سلام تیم پشتیبانی میری ایران،', want: 'می‌خواهم کیف پول دیجیتال خود را شارژ کنم.', demo: 'توجه: این یک درخواست آزمایشی (تست) است. هیچ پرداخت واقعی انجام نشده است.', cust: 'شناسه مشتری', id: 'شناسه درخواست شارژ', when: 'تاریخ و ساعت درخواست', dc: 'ارز واریز', da: 'مبلغ واریز', wc: 'ارز کیف پول درخواستی', rate: 'نرخ تبدیل', ff: 'کارمزد شارژ', xf: 'کارمزد تبدیل', net: 'خالص مبلغ تقریبی', est: '(برآورد، منوط به تأیید)', pm: 'روش پرداخت دلخواه', pmv: 'شارژ دستی از طریق پشتیبانی', ask: 'لطفاً راهنمای پرداخت را ارسال کنید.' }
  };
  // Message language follows the site language. Contains no passwords, card or bank details.
  function fundMessage(r, lang) {
    const T = WA[lang] || WA.en, c = r.toCur, same = r.fromCur === r.toCur;
    const line = (k, v) => T[k] + ': ' + v, fee = (pct, amt) => num(pct) + '% = ' + fmtPlain(amt || 0, c) + ' ' + c;
    return [T.hello, '', T.want, T.demo, '',
      line('cust', r.customerId), line('id', r.id), line('when', String(r.at).replace('T', ' ') + (r.tz ? ' (' + r.tz + ')' : '')),
      line('dc', r.fromCur), line('da', fmtPlain(r.amount, r.fromCur)), line('wc', r.toCur),
      line('rate', rateStr(r.fromCur, r.toCur, r.rate)), line('ff', fee(r.fundingPct, r.fundingFee)), same ? null : line('xf', fee(r.exchangePct, r.exchangeFee)),
      line('net', fmtPlain(r.final, c) + ' ' + c + ' ' + T.est), line('pm', r.method === 'support' ? T.pmv : String(r.method)), '', T.ask].filter(x => x !== null).join('\n');
  }
  const whatsAppUrl = text => 'https://wa.me/' + SUPPORT_PHONE + (text ? '?text=' + encodeURIComponent(text) : '');
  // Demo reference: date + time + 4 random characters (no ambiguous letters). The authoritative unique ID will come from the backend (Stage 3).
  const ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  function rnd4() { const a = new Uint8Array(4); (globalThis.crypto || require('crypto').webcrypto).getRandomValues(a); return Array.from(a, b => ALPHA[b % 32]).join(''); }
  function makeFundRef(existing, d = new Date()) {
    const used = new Set(existing || []), stamp = String(d.getFullYear()).slice(2) + p2(d.getMonth() + 1) + p2(d.getDate()) + '-' + p2(d.getHours()) + p2(d.getMinutes());
    let id; do { id = 'DEMO-FUND-' + stamp + '-' + rnd4(); } while (used.has(id));
    return id;
  }
  const nowLocal = (d = new Date()) => d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate()) + 'T' + p2(d.getHours()) + ':' + p2(d.getMinutes());
  const tzLabel = (d = new Date()) => { const m = -d.getTimezoneOffset(), a = Math.abs(m); return 'UTC' + (m < 0 ? '-' : '+') + p2(Math.floor(a / 60)) + (a % 60 ? ':' + p2(a % 60) : ''); };

  const tx = (id, type, status, fromCur, amount, toCur, rate, fee, final, method, at) => ({ id, customerId: DEMO_CUSTOMER, type, status, fromCur, amount, toCur, rate, fee, final, method, at, isDemo: true });
  function demoTransactions() { // display-only examples
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
  function filterTx(list, f = {}) {
    return list.filter(x => (!f.from || x.at.slice(0, 10) >= f.from) && (!f.to || x.at.slice(0, 10) <= f.to) &&
      (!f.currency || x.fromCur === f.currency || x.toCur === f.currency) && (!f.type || x.type === f.type) && (!f.status || x.status === f.status));
  }
  const isPending = x => x.type === 'funding' && (x.status === 'pending' || x.status === 'under_review');

  const MIW = { VERSION: 'wallet-stage2', CODES, FOREIGN, PER, CUR, SUPPORT_PHONE, SUPPORT_DISPLAY, DEMO_CUSTOMER, DEMO_BALANCES, FUNDING_CREDIT, PAYMENT_METHODS, STATUSES, TYPES,
    parseDecimal, parseAmount, fromApi, rateUsable, convertExact, pairRate, limitsIn, derivedTable, roundTripFactor, quote, fundingQuote, validateRatesInput,
    scaleRate, rateStr, fundMessage, whatsAppUrl, makeFundRef, nowLocal, tzLabel, demoTransactions, filterTx, isPending, roundDown, roundUp };
  if (typeof module !== 'undefined') module.exports = MIW; else window.MIW = MIW;
})();
