'use strict';
// Shared backend client: one place for the server address, timeouts, controlled retries, request de-duplication,
// the session token, and the "server is waking up" signal (Render Free sleeps when idle; the first request can take up to ~1 minute).
// It never throws: callers always get { ok, status, data, error }. Nothing here touches money or decides anything about rates.
(function () {
  const BASE = window.MI_API_BASE !== undefined ? window.MI_API_BASE : (/onrender\.com$/.test(location.hostname) ? '' : 'https://miri-iran-v6.onrender.com');
  const KEY = 'mi_session'; // sessionStorage: cleared when the tab closes. The token is a random value, not a password.
  const tok = {
    get() { try { return sessionStorage.getItem(KEY) || ''; } catch (_) { return ''; } },
    set(v) { try { sessionStorage.setItem(KEY, v); } catch (_) { /* private mode */ } },
    clear() { try { sessionStorage.removeItem(KEY); } catch (_) { /* ignore */ } }
  };
  const inflight = new Map();
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const RETRY_STATUS = new Set([502, 503, 504]);

  async function once(method, path, body, o) {
    const ctl = new AbortController(), tm = setTimeout(() => ctl.abort(), o.timeout);
    const headers = { Accept: 'application/json' }, t = o.auth === false ? '' : tok.get();
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (t) headers.Authorization = 'Bearer ' + t;
    try {
      const res = await fetch(BASE + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), cache: 'no-store', credentials: 'omit', signal: ctl.signal });
      let data = null; try { data = await res.json(); } catch (_) { /* empty or not JSON */ }
      if (res.ok) return { ok: true, status: res.status, data };
      const e = data && data.error ? data.error : {};
      if (res.status === 401 && t && (e.code === 'SESSION_INVALID')) { tok.clear(); try { window.dispatchEvent(new Event('mi-session-ended')); } catch (_) { /* ignore */ } }
      return { ok: false, status: res.status, data, error: { code: e.code || 'HTTP_' + res.status, message: e.message || '', fields: e.fields || null } };
    } catch (err) {
      return { ok: false, status: 0, data: null, error: { code: err && err.name === 'AbortError' ? 'TIMEOUT' : 'NETWORK', message: '', fields: null } };
    } finally { clearTimeout(tm); }
  }
  // o.timeout (ms), o.retries (GET only, default 2), o.onSlow(bool) is called after o.slowMs (default 2500) and again when the request ends.
  async function request(method, path, body, o = {}) {
    o = { timeout: method === 'GET' ? 25000 : 30000, retries: method === 'GET' ? 2 : 0, slowMs: 2500, ...o };
    let slowTimer = 0, slow = false;
    if (o.onSlow) slowTimer = setTimeout(() => { slow = true; try { o.onSlow(true); } catch (_) { /* ignore */ } }, o.slowMs);
    try {
      let r;
      for (let i = 0; ; i++) {
        r = await once(method, path, body, o);
        const retryable = !r.ok && (r.status === 0 || RETRY_STATUS.has(r.status));
        if (!retryable || i >= o.retries) break;
        await wait(800 * (i + 1)); // short, bounded back-off
      }
      return r;
    } finally { clearTimeout(slowTimer); if (slow && o.onSlow) { try { o.onSlow(false); } catch (_) { /* ignore */ } } }
  }
  // Identical GET requests that are already running share one network call (no request storms when several widgets ask for the same thing).
  function get(path, o) {
    const k = 'GET ' + path + '|' + (tok.get() ? 'a' : '');
    if (inflight.has(k)) return inflight.get(k);
    const p = request('GET', path, undefined, o).finally(() => inflight.delete(k)); inflight.set(k, p); return p;
  }
  const post = (path, body, o) => request('POST', path, body === undefined ? {} : body, o);
  // Wake the server while the visitor is still looking at the page. Fire-and-forget.
  function warm() { return once('GET', '/api/health', undefined, { timeout: 60000, auth: false }).catch(() => { }); }

  window.Api = { BASE, token: tok, get, post, warm };
  if (!window.MI_NO_WARM) setTimeout(warm, 0);
})();
