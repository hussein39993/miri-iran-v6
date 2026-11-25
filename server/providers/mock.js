'use strict';
// DEMO provider. Results are invented, deterministic and always flagged. They are never real fares or availability.
const MI = require('../../js/core.js');
const AIR = ['Demo Air A', 'Demo Air B', 'Demo Air C'];
const hash = s => [...s].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
async function searchFlights(q) {
  const h = hash(q.from + q.to), eq = MI.paxEquivalent(q.adults, q.children, q.infants) * (q.trip === 'round' ? 2 : 1), cab = q.cabin === 'business' ? 2.2 : 1;
  return AIR.map((airline, i) => ({
    id: `DEMO-${q.from}-${q.to}-${i}`, source: 'demo', fictional: true, airline, flightNumber: 'DM' + (100 + ((h + i * 37) % 900)),
    from: q.from, to: q.to, departure: ['07:30', '13:10', '19:45'][i], arrival: ['09:05', '14:50', '21:20'][i], durationMinutes: [95, 100, 215][i], stops: [0, 0, 1][i],
    baggage: ['20kg', '20kg', '25kg'][i], cabin: q.cabin,
    price: { amountToman: Math.round((1800000 + ((h + i * 91) % 9) * 150000) * eq * cab / 1000) * 1000, currency: 'IRT', converted: false, example: true }
  }));
}
// Example airport list for demo mode only (flagged by the route as demo/example data).
const AIRPORTS = [['THR', 'Tehran', 'تهران'], ['IKA', 'Tehran Imam Khomeini', 'تهران امام خمینی'], ['MHD', 'Mashhad', 'مشهد'], ['SYZ', 'Shiraz', 'شیراز'], ['IFN', 'Isfahan', 'اصفهان'], ['KIH', 'Kish', 'کیش']];
async function airports() { return AIRPORTS.map(([code, nameEn, nameFa]) => ({ code, codeInt: null, nameEn, nameFa })); }
module.exports = { name: 'demo', searchFlights, airports };
