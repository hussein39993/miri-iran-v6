'use strict';
// Pure logic, no DOM. Testable in Node. Maps 1:1 to a future shared TypeScript module.
(function () {
  const pad = n => String(n).padStart(2, '0');
  // Local calendar date (NOT toISOString, which converts to UTC and can be off by one day).
  const isoLocal = (d = new Date()) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  const rules = {
    sameCity: f => f.from !== undefined && f.from !== '' && f.from === f.to,
    pastDate: (d, today = isoLocal()) => !d || d < today,
    phone: v => /^09\d{9}$/.test(String(v || '').trim()),
    contact: v => /^\+?\d{7,15}$/.test(String(v || '').replace(/[\s-]/g, '')),
    amount: v => /^\d+$/.test(String(v || '')) && +v > 0 && +v <= 1e9,
    name: v => String(v || '').trim().length >= 2,
    bill: v => /^\d{6,13}$/.test(String(v || '').trim()),
    // V5: passengers. Adults >= 1, infants <= adults (each infant sits with one adult), total seats (adults+children) and infants within limits.
    pax: (a, c, i) => { a = Number(a); c = Number(c); i = Number(i); return [a, c, i].every(Number.isInteger) && a >= 1 && c >= 0 && i >= 0 && i <= a && a + c <= 9 && i <= 4; },
    returnDate: (dep, ret) => !!ret && /^\d{4}-\d{2}-\d{2}$/.test(ret) && ret >= dep,
    refRef: v => /^DEMO-[A-Z]+-\d{4}$/.test(String(v || '').trim())
  };
  // V5: example passenger price factors (demo only; real fares come from the supplier).
  const FARE_FACTOR = Object.freeze({ adult: 1, child: 0.75, infant: 0.1 });
  const paxEquivalent = (a, c, i) => Number(a) * FARE_FACTOR.adult + Number(c) * FARE_FACTOR.child + Number(i) * FARE_FACTOR.infant;
  const filterResults = (list, o = {}) => list.filter(r => !(o.nonstop && r.rows && r.rows.stops !== undefined && r.rows.stops !== 0));
  const sortResults = (list, key) => { const v = r => key === 'price' ? r.price : key === 'duration' ? r.rows.duration : r.rows.dep; return [...list].sort((x, y) => (v(x) < v(y) ? -1 : v(x) > v(y) ? 1 : 0)); };
  // spec letters: p=from+to c=city d=date n=travellers o=operator h=phone k=package b=bank a=amount u=currency r=recipient t=bill type i=bill id
  const S = (id, group, flow, spec = '') => ({ id, group, flow, spec });
  const R = Math.PI / 180;
  const haversineKm = (a, b) => { const x = Math.sin((b.lat - a.lat) * R / 2) ** 2 + Math.cos(a.lat * R) * Math.cos(b.lat * R) * Math.sin((b.lon - a.lon) * R / 2) ** 2; return 12742 * Math.asin(Math.sqrt(x)); };
  // Rough bounding box of Iran: taxi demo is limited to it.
  const inArea = (lat, lon) => Number.isFinite(lat) && Number.isFinite(lon) && lat >= 25 && lat <= 40 && lon >= 44 && lon <= 63.5;
  const L = (id, href) => ({ id, group: 'customer', flow: 'link', spec: '', href });
  const SERVICES = [
    S('flight', 'travel', 'travel', 'f'), S('snapp', 'travel', 'taxi'), S('hotel', 'travel', 'travel', 'cdn'), S('train', 'travel', 'travel', 'pdn'),
    S('bus', 'travel', 'travel', 'pdn'), S('stay', 'travel', 'travel', 'cdn'), S('tour', 'travel', 'travel', 'cd'), S('transfer', 'travel', 'travel', 'cd'),
    S('car', 'travel', 'travel', 'cd'), S('visa', 'travel', 'info'), S('insurance', 'travel', 'info'), S('esim', 'travel', 'info'),
    S('topup', 'digital', 'fin', 'ohk'), S('cardfund', 'digital', 'fin', 'baur'), S('cardtransfer', 'digital', 'fin', 'baur'), S('c2c', 'digital', 'fin', 'baur'),
    S('wallet', 'digital', 'wallet'), S('rates', 'digital', 'rates'), S('bills', 'digital', 'fin', 'ti'), S('refund', 'digital', 'fin', 'xy'),
    L('rides', '#/bookings'), L('transactions', '#/s/wallet'), L('notifications', '#/notifications'), L('help', '#/profile')
  ];
  const MI = { VERSION: '5.0.0', FARE_FACTOR, paxEquivalent, filterResults, sortResults, pad, isoLocal, rules, SERVICES, haversineKm, inArea };
  if (typeof module !== 'undefined') module.exports = MI; else window.MI = MI;
})();
