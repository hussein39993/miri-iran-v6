'use strict';
// Provider adapters + in-memory demo store. Nothing here talks to a network or moves money.
(function () {
  const MI = (typeof window !== 'undefined' && window.MI) || require('./core.js');
  const CODES = ['BGW', 'NJF', 'MHD', 'IKA', 'SYZ'];
  const AIRLINES = ['Demo Air', 'Sample Wings', 'Test Jet']; // fictional
  const hm = m => MI.pad(Math.floor(m / 60) % 24) + ':' + MI.pad(m % 60);
  const store = { bookings: [], requests: [], tickets: [], rides: [], activity: [] };
  let seq = 0; const ref = p => 'DEMO-' + p + '-' + String(++seq).padStart(4, '0');

  // ---- Travel search (mock adapter; a real supplier adapter must return the same shape) ----
  function search(service, f) {
    const paxEq = f.adults !== undefined ? MI.paxEquivalent(f.adults, f.children || 0, f.infants || 0) : Math.max(1, Number(f.pax || 1)), mult = (service === 'flight' && f.trip === 'round') ? 2 : 1, from = Number(f.from || 0), to = Number(f.to || 0);
    const d = Math.abs(from - to) + 1;
    return [0, 1, 2].map(i => {
      const dep = (7 + i * 4) * 60, dur = 90 + i * 35 + ((from * 7 + to * 3) % 4) * 10;
      const base = { flight: 1800000, train: 600000, bus: 300000, hotel: 1500000, stay: 1300000, tour: 600000, transfer: 300000, car: 1000000 }[service] || 500000;
      const price = (base + d * (service === 'flight' ? 450000 : 80000) + i * base * 0.15) * (service === 'hotel' || service === 'stay' ? 1 : paxEq) * mult;
      const item = { id: service + '-' + i, fictional: true, title: null, price: Math.round(price / 1000) * 1000, rows: {} };
      if (service === 'flight') {
        item.title = AIRLINES[i];
        item.rows = { depAirport: CODES[from], arrAirport: CODES[to], dep: hm(dep), arr: hm(dep + dur), duration: hm(dur), stops: i === 2 ? 1 : 0, baggage: [20, 30, 15][i] + ' kg', fare: ['eco', 'flex', 'promo'][i], cancel: ['fee', 'free', 'none'][i] };
        if (f.trip === 'round') item.rows.retDate = f.ret;
      } else if (service === 'train' || service === 'bus') {
        item.title = service === 'train' ? 'Demo Rail ' + (i + 1) : 'Demo Coach ' + (i + 1);
        item.rows = { dep: hm(dep), arr: hm(dep + dur * 4), duration: hm(dur * 4), fare: ['eco', 'flex', 'promo'][i] };
      }
      return item;
    });
  }
  function submitBooking(service, form, pick, cust) {
    const r = { ref: ref('BKG'), service, form: { ...form }, pick, cust: { name: cust.name }, status: 'demo_not_issued', at: new Date().toISOString() };
    store.bookings.unshift(r); return r;
  }
  function submitFinance(service, form) {
    const r = { ref: ref('FIN'), service, form: { ...form }, status: 'demo_not_sent', moved: 0, at: new Date().toISOString() };
    store.requests.unshift(r); return r;
  }

  // ---- Wallet (read-only demo). Balances are frozen constants; requests only add list entries. ----
  const WALLET = Object.freeze({ currency: 'IRT', balance: 2500000, available: 2300000, pending: 200000, isDemo: true });
  store.activity.push({ id: 'DEMO-W-0001', kind: 'deposit', status: 'pending', amount: 200000 }, { id: 'DEMO-W-0002', kind: 'transfer', status: 'done', amount: -150000 }, { id: 'DEMO-W-0003', kind: 'refund', status: 'done', amount: 75000 });
  function addSampleRequest(kind) {
    const e = { id: ref('W'), kind, status: 'pending', amount: kind === 'transfer' ? -100000 : kind === 'refund' ? 50000 : 100000 };
    store.activity.unshift(e); return e;
  }

  // ---- Snapp ride provider (adapter pattern). Fares below are EXAMPLE values, never Snapp quotes. ----
  const FARES = { eco: { base: 30000, perKm: 8000, perMin: 1000 }, pre: { base: 40000, perKm: 10000, perMin: 1200 } };
  const demoFare = (v, km, min) => Math.round((FARES[v].base + FARES[v].perKm * km + FARES[v].perMin * min) / 1000) * 1000;
  const STAGES = ['created', 'searching', 'assigned', 'arriving', 'started', 'completed'];
  const okPt = p => p && MI.inArea(+p.lat, +p.lon);
  class DemoSnappProvider {
    constructor() { this.mode = 'demo'; }
    quote(p) {
      if (!p || !okPt(p.pickup) || !okPt(p.dest) || !FARES[p.vehicle] || !(p.km >= 0) || !(p.min > 0) || MI.haversineKm({ lat: +p.pickup.lat, lon: +p.pickup.lon }, { lat: +p.dest.lat, lon: +p.dest.lon }) < 0.03) throw new Error('INVALID_ROUTE');
      return { quoteId: ref('Q'), isDemo: true, km: p.km, min: p.min, vehicle: p.vehicle, price: demoFare(p.vehicle, p.km, p.min), currency: 'IRT', routeSource: p.source || 'unknown', arrival: null };
    }
    create(q, payment, note, meta) {
      if (payment !== 'cash') throw new Error('WALLET_PAYMENT_NOT_AUTHORIZED');
      const r = { id: ref('RIDE'), isDemo: true, status: 'created', quote: q, payment, note: String(note || '').slice(0, 140), meta: { pickup: String((meta && meta.pickup) || '').slice(0, 140), dest: String((meta && meta.dest) || '').slice(0, 140) }, at: new Date().toISOString() };
      store.rides.unshift(r); return r;
    }
    track(id) { return store.rides.find(r => r.id === id); }
    advance(id) { const r = this.track(id); if (r && r.status !== 'cancelled' && r.status !== 'completed') r.status = STAGES[STAGES.indexOf(r.status) + 1]; return r; }
    cancel(id) { const r = this.track(id); if (!r || r.status === 'completed') throw new Error('CANNOT_CANCEL'); r.status = 'cancelled'; return r; }
  }
  // Production mode stays disabled until Snapp grants an official business integration. No endpoints or credentials are assumed.
  class OfficialSnappProvider {
    constructor() { this.mode = 'official'; this.enabled = false; }
    _off() { throw new Error('SNAPP_OFFICIAL_NOT_AUTHORIZED'); }
    quote() { this._off(); } create() { this._off(); } track() { this._off(); } cancel() { this._off(); } verifyWebhook() { this._off(); }
  }
  const demo = new DemoSnappProvider();
  const getSnappProvider = mode => (mode === 'official' ? new OfficialSnappProvider() : demo);

  const P = { CODES, store, search, submitBooking, submitFinance, WALLET, addSampleRequest, getSnappProvider, FARES };
  if (typeof module !== 'undefined') module.exports = P; else window.P = P;
})();
