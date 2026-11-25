'use strict';
const { AppError } = require('./errors');
const MI = require('../js/core.js');
const CABINS = ['economy', 'business'];
const validDate = s => { if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false; const d = new Date(s + 'T00:00:00Z'); return !isNaN(d) && d.toISOString().slice(0, 10) === s; };
// Today's calendar date in a given IANA time zone (default Asia/Tehran, which is what the provider's "today or later" rule most likely uses). Falls back to UTC.
function todayIn(tz = 'Asia/Tehran', now = new Date()) {
  try { return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now); }
  catch (_) { return now.toISOString().slice(0, 10); }
}
function validateFlightSearch(b, today = todayIn()) {
  const f = {}, x = b && typeof b === 'object' ? b : {};
  const iata = v => typeof v === 'string' && /^[A-Za-z]{3}$/.test(v.trim()) ? v.trim().toUpperCase() : null;
  const from = iata(x.from), to = iata(x.to);
  if (!from) f.from = 'invalid_airport_code'; if (!to) f.to = 'invalid_airport_code'; if (from && to && from === to) f.to = 'same_as_origin';
  const trip = x.trip === undefined ? 'oneway' : x.trip; if (!['oneway', 'round'].includes(trip)) f.trip = 'invalid_trip';
  if (!validDate(x.date)) f.date = 'invalid_date'; else if (x.date < today) f.date = 'date_in_past';
  if (trip === 'round') { if (!validDate(x.returnDate)) f.returnDate = 'invalid_date'; else if (validDate(x.date) && x.returnDate < x.date) f.returnDate = 'before_departure'; }
  const adults = x.adults === undefined ? 1 : x.adults, children = x.children === undefined ? 0 : x.children, infants = x.infants === undefined ? 0 : x.infants;
  if (!MI.rules.pax(adults, children, infants) || [adults, children, infants].some(v => typeof v !== 'number')) f.passengers = 'invalid_passenger_counts';
  const cabin = x.cabin === undefined ? 'economy' : x.cabin; if (!CABINS.includes(cabin)) f.cabin = 'invalid_cabin';
  if (Object.keys(f).length) throw new AppError(400, 'VALIDATION_ERROR', 'Invalid flight search request.', f);
  return { from, to, trip, date: x.date, returnDate: trip === 'round' ? x.returnDate : undefined, adults, children, infants, cabin };
}
module.exports = { validateFlightSearch, validDate, todayIn };
