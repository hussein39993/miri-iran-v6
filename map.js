'use strict';
// Map + geocoding + routing service. Public OpenStreetMap-based demo servers are used for testing only:
// tile.openstreetmap.org, nominatim.openstreetmap.org and router.project-osrm.org have usage policies and no production SLA.
// For production, use a paid/self-hosted tile, geocoding and routing provider and keep keys server-side.
(function () {
  const MI = (typeof window !== 'undefined' && window.MI) || require('./core.js');
  const LEAFLET = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet';
  const TILES = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
  const NOMINATIM = 'https://nominatim.openstreetmap.org';
  const OSRM = 'https://router.project-osrm.org/route/v1/driving/';
  // Approximate landmark coordinates, used as quick picks and as a fallback when search is unavailable.
  const PRESETS = [[35.6997, 51.338], [36.288, 59.6157], [36.2352, 59.641], [36.2126, 57.6819], [34.6411, 50.8764], [32.6578, 51.6776], [29.61, 52.545]].map(([lat, lon]) => ({ lat, lon }));
  const fmtCoord = p => (+p.lat).toFixed(5) + ', ' + (+p.lon).toFixed(5);

  function parseNominatim(arr) {
    return (Array.isArray(arr) ? arr : []).map(r => ({ lat: +r.lat, lon: +r.lon, label: String(r.display_name || r.name || '').slice(0, 140) })).filter(r => r.label && MI.inArea(r.lat, r.lon));
  }
  function parseOsrm(j) {
    const r = j && j.routes && j.routes[0];
    if (!r || !(r.distance >= 0) || !(r.duration >= 0) || !r.geometry || !Array.isArray(r.geometry.coordinates)) throw new Error('ROUTE_PARSE');
    return { km: Math.round(r.distance / 100) / 10, min: Math.max(1, Math.round(r.duration / 60)), coords: r.geometry.coordinates.map(([lon, lat]) => [lat, lon]), source: 'osrm' };
  }
  function approxRoute(a, b) {
    const km = Math.round(MI.haversineKm(a, b) * 1.3 * 10) / 10;
    return { km, min: Math.max(1, Math.round(km * 2.4)), coords: [[a.lat, a.lon], [b.lat, b.lon]], source: 'line' };
  }
  async function getJSON(url, ms = 8000) {
    const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), ms);
    try { const r = await fetch(url, { signal: ctl.signal, headers: { Accept: 'application/json' } }); if (!r.ok) throw new Error('HTTP_' + r.status); return await r.json(); } finally { clearTimeout(timer); }
  }
  // Public Nominatim: max 1 request/second, no search-as-you-type, so we search on submit only and cache.
  const cache = new Map(); let last = 0;
  const throttle = async () => { const wait = 1100 - (Date.now() - last); if (wait > 0) await new Promise(r => setTimeout(r, wait)); last = Date.now(); };
  async function geocode(q, lang) {
    const key = lang + '|' + q.toLowerCase(); if (cache.has(key)) return cache.get(key);
    await throttle();
    const res = parseNominatim(await getJSON(NOMINATIM + '/search?format=jsonv2&limit=6&countrycodes=ir&accept-language=' + encodeURIComponent(lang) + '&q=' + encodeURIComponent(q)));
    cache.set(key, res); return res;
  }
  async function reverse(p, lang) {
    await throttle();
    const j = await getJSON(NOMINATIM + '/reverse?format=jsonv2&zoom=18&accept-language=' + encodeURIComponent(lang) + '&lat=' + p.lat + '&lon=' + p.lon);
    return String((j && j.display_name) || '').slice(0, 140);
  }
  async function route(a, b) {
    try { return parseOsrm(await getJSON(OSRM + a.lon + ',' + a.lat + ';' + b.lon + ',' + b.lat + '?overview=full&geometries=geojson')); } catch { return approxRoute(a, b); }
  }
  // ---- Leaflet glue (loaded lazily; any failure leaves the app usable without the map) ----
  function loadLeaflet() {
    if (typeof window === 'undefined') return Promise.reject(new Error('NO_WINDOW'));
    if (window.L) return Promise.resolve(window.L);
    return new Promise((resolve, reject) => {
      const css = document.createElement('link'); css.rel = 'stylesheet'; css.href = LEAFLET + '.css'; document.head.append(css);
      const s = document.createElement('script'); s.src = LEAFLET + '.js'; s.async = true;
      const timer = setTimeout(() => reject(new Error('LEAFLET_TIMEOUT')), 10000);
      s.onload = () => { clearTimeout(timer); window.L ? resolve(window.L) : reject(new Error('LEAFLET_MISSING')); };
      s.onerror = () => { clearTimeout(timer); reject(new Error('LEAFLET_LOAD')); };
      document.head.append(s);
    });
  }
  function createMap(el, v) {
    const L = window.L, m = L.map(el, { zoomControl: true }).setView([v.lat, v.lon], v.zoom);
    L.tileLayer(TILES, { maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' }).addTo(m);
    return m;
  }
  const center = m => { const c = m.getCenter(); return { lat: c.lat, lon: c.lng }; };
  const addPin = (m, p, cls) => window.L.marker([p.lat, p.lon], { icon: window.L.divIcon({ className: 'pin ' + cls, iconSize: [30, 30], iconAnchor: [15, 30] }) }).addTo(m);
  const addLine = (m, coords) => window.L.polyline(coords, { color: '#2467a2', weight: 5, opacity: .9 }).addTo(m);
  const fit = (m, coords) => m.fitBounds(window.L.latLngBounds(coords), { padding: [40, 40], animate: false });
  const MapSvc = { PRESETS, fmtCoord, parseNominatim, parseOsrm, approxRoute, geocode, reverse, route, loadLeaflet, createMap, center, addPin, addLine, fit };
  if (typeof module !== 'undefined') module.exports = MapSvc; else window.MapSvc = MapSvc;
})();
