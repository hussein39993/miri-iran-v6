'use strict';
const { AppError } = require('../errors');
const { ProviderClient, fill, get } = require('./client');
const { TokenManager } = require('./tokens');
const { toToman } = require('../currency');

const AIRPORT_TTL_MS = 6 * 3600 * 1000;
const MAX_TOKEN_TTL_MS = 24 * 3600 * 1000;
const pad2 = n => String(n).padStart(2, '0');
const hhmm = v => { const m = /^(\d{1,2}):(\d{2})/.exec(String(v == null ? '' : v).trim()); return m ? pad2(m[1]) + ':' + m[2] : null; };
const num = v => (v === null || v === undefined || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));
const text = v => (v === null || v === undefined ? null : String(v));
const normName = s => String(s == null ? '' : s).toLowerCase().replace(/[\u064B-\u065F\u0670\u0640\u200c\u200d]/g, '').replace(/[يیى]/g, 'ی').replace(/[كک]/g, 'ک').replace(/[_\-.,()\s]+/g, ' ').trim();
const slug = s => String(s == null ? '' : s).replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '');

// Charter724 adapter. Paths, bodies and field names come from mapping.json (filled from docs/charter724-openapi.json).
class Charter724Adapter {
  constructor({ cfg, mapping, fetchImpl, logger, now }) {
    this.cfg = cfg; this.mapping = mapping; this.name = 'charter724'; this.now = now || Date.now; this.logger = logger;
    this.client = new ProviderClient({ baseUrl: cfg.charter724.baseUrl, timeoutMs: cfg.charter724.timeoutMs, fetchImpl, logger });
    this.tokens = new TokenManager({ login: () => this._login(), now });
    this.airportCache = null;
    // Flights whose route/date the provider does not state (or states in a form we cannot compare) are EXCLUDED unless this is explicitly enabled; they are then shown as unverified.
    this.allowUnverified = process.env.CHARTER724_ALLOW_UNVERIFIED_ROUTES === 'true';
  }
  isConfigured() { const m = this.mapping || {}; return !!(m.auth && Array.isArray(m.auth.steps) && m.auth.steps.length && m.flightSearch && m.flightSearch.path && m.flightSearch.response); }
  isAirportsConfigured() { const a = (this.mapping || {}).airports; return !!(this.isConfigured() && a && a.path && a.response && a.response.fields && a.response.fields.code); }
  // 'yes' = provider value is the requested airport, 'no' = it is a DIFFERENT airport, 'unknown' = missing or cannot be compared. Never guesses.
  _airportMatch(value, code) {
    const v = text(value); if (v === null || !v.trim()) return 'unknown';
    const s = v.trim(), want = String(code).toUpperCase();
    if (/^[A-Za-z]{3}$/.test(s)) return s.toUpperCase() === want ? 'yes' : 'no';
    const list = this.airportCache && this.airportCache.list; if (!list) return 'unknown';
    const n = normName(s), names = a => [a.nameEn, a.nameFa].filter(Boolean).map(normName), mine = list.find(a => a.code === want);
    if (mine && names(mine).includes(n)) return 'yes';
    return list.some(a => a.code !== want && names(a).includes(n)) ? 'no' : 'unknown';
  }
  // Same idea for the date. Only YYYY-MM-DD / YYYY/MM/DD (Gregorian) can be compared; anything else (missing, Jalali 13xx/14xx, free text) is 'unknown'.
  _dateMatch(value, want) {
    const s = text(value); if (!s) return 'unknown';
    const m = /^(\d{4})[-\/](\d{2})[-\/](\d{2})/.exec(s.trim()); if (!m || Number(m[1]) < 1700) return 'unknown';
    return m[1] + '-' + m[2] + '-' + m[3] === want ? 'yes' : 'no';
  }
  _need() { if (!this.isConfigured()) throw new AppError(503, 'PROVIDER_NOT_CONFIGURED', 'Charter724 integration is not configured yet.'); }

  // Turns a provider error (HTTP status + documented Msg code) into our own error, using mapping.errors for the message.
  _mapError(e) {
    if (!(e instanceof AppError)) return e;
    const pm = e.providerMsg, m = pm !== undefined ? (this.mapping.errors || {})[pm] : undefined;
    const status = (m && m.status) || (e.status === 401 ? 502 : e.status); // a provider auth problem is not a 401 for OUR caller
    if (!m && status === e.status && pm === undefined) return e;
    const n = new AppError(status, (m && m.code) || e.code, (m && m.message) || e.message, undefined, pm); n.http = e.http; n.providerMsg = pm; return n;
  }
  // Charter724 wraps every answer as { Result, Msg, Data }. A Result of "false" on a 200 answer is treated as a provider error.
  _unwrap(data) {
    const env = this.mapping.envelope; if (!env || !data || typeof data !== 'object') return data;
    const r = get(data, env.resultPath || 'Result');
    if (r === false || String(r).toLowerCase() === 'false') {
      const msg = String(get(data, env.msgPath || 'Msg') ?? '').slice(0, 40), m = (this.mapping.errors || {})[msg];
      throw new AppError(m && m.status || 502, m && m.code || 'PROVIDER_REJECTED', m && m.message || 'The provider reported an error' + (msg ? ' (code ' + msg + ').' : '.'), undefined, msg || undefined);
    }
    return data;
  }
  async _call(spec, ctx, token) {
    try { return this._unwrap(await this.client.call(spec.method || 'GET', spec.path, { query: spec.query && fill(spec.query, ctx), body: spec.body && fill(spec.body, ctx), token })); }
    catch (e) { throw this._mapError(e); }
  }

  async _login() {
    const ctx = { username: this.cfg.charter724.username, password: this.cfg.charter724.password, steps: {} }; let last = {};
    for (const s of this.mapping.auth.steps) {
      const prevToken = s.useBearerFrom ? get(ctx, s.useBearerFrom) : undefined; let data;
      try { data = this._unwrap(await this.client.call(s.method, s.path, { query: s.query && fill(s.query, ctx), body: s.body && fill(s.body, ctx), token: prevToken })); }
      catch (e) {
        if (e instanceof AppError && ['PROVIDER_UNAUTHORIZED', 'PROVIDER_REJECTED'].includes(e.code)) {
          const pc = e.providerMsg; throw new AppError(502, 'PROVIDER_LOGIN_FAILED', 'Charter724 login failed at step "' + s.name + '"' + (pc ? ' (provider code ' + pc + ')' : ' (HTTP ' + (e.http || '?') + ')') + '. Check CHARTER724_USERNAME and CHARTER724_PASSWORD, and whether the account is active.', undefined, pc);
        }
        throw e;
      }
      const out = {};
      for (const [k, p] of Object.entries(s.extract || {})) { const v = get(data, p); if (v === undefined || v === null || v === '') throw new AppError(502, 'PROVIDER_BAD_RESPONSE', 'Login step "' + s.name + '" returned no value for ' + k + '.'); out[k] = v; }
      for (const [k, p] of Object.entries(s.extractOptional || {})) { const v = get(data, p); if (v !== undefined && v !== null && v !== '') out[k] = v; }
      ctx.steps[s.name] = out; last = out;
    }
    if (typeof last.token !== 'string' || !last.token) throw new AppError(502, 'PROVIDER_BAD_RESPONSE', 'Login did not return an access token.');
    return { token: last.token, ttlMs: this._ttl(last) };
  }
  // Token lifetime: from expires_Utc (documented as an absolute UTC date-time) when present and valid, else a short default (5 minutes, in TokenManager).
  _ttl(last) {
    if (Number(last.expiresInSeconds) > 0) return Number(last.expiresInSeconds) * 1000;
    if (typeof last.expiresAt === 'string') {
      const s = last.expiresAt.trim(), t = Date.parse(/(Z|[+-]\d{2}:?\d{2})$/i.test(s) ? s : s + 'Z'); // no zone given: the field is documented as UTC
      const ms = t - this.now(); if (Number.isFinite(ms) && ms > 0) return Math.min(ms, MAX_TOKEN_TTL_MS);
    }
    return undefined;
  }
  async _authed(fn) {
    let token = await this.tokens.getToken();
    try { return await fn(token); }
    catch (e) { if (e.code !== 'PROVIDER_UNAUTHORIZED') throw e; this.tokens.invalidate(); token = await this.tokens.getToken(); return fn(token); } // exactly one retry
  }

  // ---- Airports (GET /api/WebService/Airportlist). Cached in memory for 6 hours. ----
  async getAirports() {
    this._need(); if (!this.isAirportsConfigured()) throw new AppError(503, 'PROVIDER_NOT_CONFIGURED', 'Charter724 airport list is not configured.');
    if (this.airportCache && this.now() - this.airportCache.at < AIRPORT_TTL_MS) return this.airportCache.list;
    const m = this.mapping.airports, data = await this._authed(token => this._call(m, {}, token));
    const list = m.response.listPath ? get(data, m.response.listPath) : data;
    if (list === undefined || list === null || list === '') return [];
    if (!Array.isArray(list)) throw new AppError(502, 'PROVIDER_BAD_RESPONSE', 'Unexpected airport list format.');
    const f = m.response.fields, seen = new Set(), out = [];
    for (const it of list) {
      const code = text(get(it, f.code)); if (!code || !/^[A-Za-z]{3}$/.test(code.trim())) continue;
      const c = code.trim().toUpperCase(); if (seen.has(c)) continue; seen.add(c);
      out.push({ code: c, codeInt: f.codeInt ? num(get(it, f.codeInt)) : null, nameEn: f.nameEn ? text(get(it, f.nameEn)) : null, nameFa: f.nameFa ? text(get(it, f.nameFa)) : null });
    }
    this.airportCache = { at: this.now(), list: out }; return out;
  }

  // ---- Flight search. One-way = one "Available" call; round trip = two calls (outbound day, return day). ----
  async searchFlights(q) {
    this._need(); const meta = { excluded: {}, unclassifiedCabins: [], currencies: [], routeCheck: [] };
    const outbound = await this._searchLeg({ from: q.from, to: q.to, date: q.date }, q, meta);
    let inbound; if (q.trip === 'round') inbound = await this._searchLeg({ from: q.to, to: q.from, date: q.returnDate }, q, meta);
    meta.unclassifiedCabins = [...new Set(meta.unclassifiedCabins)].slice(0, 10); meta.currencies = [...new Set(meta.currencies)];
    return { outbound, inbound, meta };
  }
  async _searchLeg(leg, q, meta) {
    const m = this.mapping.flightSearch;
    const data = await this._authed(token => this._call(m, { ...leg, returnDate: q.returnDate, adults: q.adults, children: q.children, infants: q.infants, cabin: q.cabin, trip: q.trip }, token));
    const list = m.response.listPath ? get(data, m.response.listPath) : data;
    if (list === undefined || list === null || list === '') return [];
    if (!Array.isArray(list)) throw new AppError(502, 'PROVIDER_BAD_RESPONSE', 'Unexpected flight list format.');
    const ff = m.response.fields || {}, rawOf = (it, k) => (ff[k] ? text(get(it, ff[k])) : null), tally = new Map();
    for (const it of list) { const key = ['from', 'to', 'departureDate'].map(k => { const v = rawOf(it, k); return v === null ? '' : String(v).slice(0, 30); }).join('|'); tally.set(key, (tally.get(key) || 0) + 1); }
    const check = { requested: { from: leg.from, to: leg.to, date: leg.date }, sent: m.body ? fill(m.body, { ...leg, returnDate: q.returnDate, adults: q.adults, children: q.children, infants: q.infants, cabin: q.cabin, trip: q.trip }) : null, providerCount: list.length,
      providerRoutes: [...tally].slice(0, 10).map(([k, n]) => { const [from, to, date] = k.split('|'); return { from, to, date, count: n }; }), kept: 0 };
    meta.routeCheck.push(check);
    const out = [], ids = new Set(), skip = k => { meta.excluded[k] = (meta.excluded[k] || 0) + 1; };
    for (const it of list) {
      const r = this._normalize(it, leg, q, m.response, meta); if (r.skip) { skip(r.skip); continue; }
      let id = r.item.id, n = 2; while (ids.has(id)) id = r.item.id + '-' + n++; ids.add(id); r.item.id = id; out.push(r.item);
    }
    check.kept = out.length;
    return out;
  }
  _cabin(it, rules) {
    if (!rules) return { cabin: null, label: null };
    const label = (rules.labelFields || []).map(k => get(it, k)).filter(v => v !== undefined && v !== null && String(v).trim()).map(String);
    const hay = label.join(' ').toLowerCase(), has = arr => (arr || []).some(w => hay.includes(String(w).toLowerCase()));
    const e = has(rules.economy), b = has(rules.business);
    return { cabin: e && !b ? 'economy' : b && !e ? 'business' : 'unknown', label: label.join(' / ') || null };
  }
  _normalize(it, leg, q, resp, meta) {
    const f = resp.fields || {}, g = k => (f[k] ? get(it, f[k]) : undefined);
    // Route/date verification comes FIRST. The requested airports/date are never copied onto a flight the provider did not describe that way.
    const fm = this._airportMatch(g('from'), leg.from), tm = this._airportMatch(g('to'), leg.to), dm = this._dateMatch(g('departureDate'), leg.date);
    if (fm === 'no' || tm === 'no') return { skip: 'routeMismatch' };
    if (dm === 'no') return { skip: 'dateMismatch' };
    const routeOk = fm === 'yes' && tm === 'yes', dateOk = dm === 'yes';
    if (!routeOk && !this.allowUnverified) return { skip: 'unverifiedRoute' };
    if (!dateOk && !this.allowUnverified) return { skip: 'unverifiedDate' };
    const cab = this._cabin(it, resp.cabin);
    if (cab.cabin === 'unknown') { if (cab.label) meta.unclassifiedCabins.push(cab.label); return { skip: 'unknownCabin' }; }
    if (cab.cabin && cab.cabin !== q.cabin) return { skip: 'otherCabin' };
    const capacity = num(g('capacity')), seats = q.adults + q.children;
    const adult = num(g('priceAdult')), child = num(g('priceChild')), inf = num(g('priceInfant'));
    if (!(capacity > 0) || !(adult > 0)) return { skip: 'noCapacity' };           // documented: price_final is 0 when capacity is 0
    if (capacity < seats) return { skip: 'insufficientSeats' };                    // infants do not take a seat
    if (q.children > 0 && !(child > 0)) return { skip: 'missingChildPrice' };
    if (q.infants > 0 && !(inf > 0)) return { skip: 'missingInfantPrice' };
    const cur = f.currency ? g('currency') : resp.currency; if (cur) meta.currencies.push(String(cur));
    const total = adult * q.adults + (child || 0) * q.children + (inf || 0) * q.infants;
    const tt = toToman(total, cur); if (tt.amountToman === null) return { skip: 'unsupportedCurrency' };
    const unit = v => (v > 0 ? toToman(v, cur).amountToman : null);
    const hasStop = g('hasStop') === undefined || g('hasStop') === null ? null : Number(g('hasStop')) !== 0;
    const dep = hhmm(g('departure')), date = text(g('departureDate')), number = text(g('flightNumber')), cabinCode = text(g('cabinCode')), agency = num(g('agencyId'));
    const bag = num(g('baggageKg'));
    const rules = g('cancellationRules'), alts = g('alternatives');
    const item = {
      id: 'C724-' + [agency, routeOk ? leg.from : g('from'), routeOk ? leg.to : g('to'), date, dep && dep.replace(':', ''), number, cabinCode].map(slug).filter(Boolean).join('-'),
      source: 'charter724', fictional: false,
      airline: text(g('airline')), airlineCode: text(g('airlineCode')), flightNumber: number,
      from: routeOk ? String(leg.from).toUpperCase() : null, to: routeOk ? String(leg.to).toUpperCase() : null, // verified codes only, else null (never the requested airports by default)
      providerFrom: text(g('from')), providerTo: text(g('to')), verification: { route: routeOk, date: dateOk }, routeVerified: routeOk && dateOk,
      departureDate: date, departure: dep, arrivalDate: text(g('arrivalDate')), arrival: hhmm(g('arrival')),
      durationMinutes: num(g('durationMinutes')), hasStop, stops: hasStop === null ? null : hasStop ? null : 0,
      baggageKg: bag, baggage: bag === null ? null : bag + 'kg',
      cabin: cab.cabin, cabinLabel: cab.label, providerType: text(g('providerType')), capacity,
      price: { amountToman: tt.amountToman, currency: 'IRT', converted: tt.converted, original: tt.original, unitToman: { adult: unit(adult), child: unit(child), infant: unit(inf) }, passengers: { adults: q.adults, children: q.children, infants: q.infants } },
      cancellationRules: Array.isArray(rules) ? rules.map(x => ({ percent: num(x && x.percent), description: text(x && x.description) })) : [],
      alternatives: Array.isArray(alts) ? alts.map(x => ({ providerType: text(x && x.type), cabinLabel: text(x && (x.type_flight || x.DisplayLable)), capacity: num(x && x.capacity), adultPriceToman: x && num(x.price_final) > 0 ? toToman(x.price_final, x.currency || cur).amountToman : null, bookable: false })) : [],
      // Identifiers that the documented reservation start (GetCaptcha) will need later. Booking is NOT implemented; a future booking step must re-search and re-check the price on the server.
      providerRef: { ajency_online_ID: agency, from_flight: routeOk ? leg.from : text(g('from')), to_flight: routeOk ? leg.to : text(g('to')), date_flight: date, time_flight: text(g('departure')), number_flight: number, airline: text(g('airline')), cabinclass: cabinCode, sellingType: text(g('sellingType')) }
    };
    return { item };
  }

  // Read-only diagnostic: the public IP address the provider sees (documented GET /api/showmyip, no token needed).
  async myIp() {
    const d = (this.mapping.diagnostics || {}).myIp; if (!d) throw new AppError(503, 'PROVIDER_NOT_CONFIGURED', 'No diagnostics mapping.');
    const data = await this._call(d, {}); return text(get(data, d.dataPath || 'Data'));
  }
}
module.exports = { Charter724Adapter };
