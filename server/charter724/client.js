'use strict';
const { AppError } = require('../errors');
const get = (o, p) => String(p).split('.').reduce((a, k) => (a === undefined || a === null ? undefined : a[k]), o);
// Replaces {{name}} tokens from ctx. A string that is exactly one token keeps the original type (number, boolean...).
function fill(v, ctx) {
  if (typeof v === 'string') {
    const one = v.match(/^\{\{([\w.]+)\}\}$/); if (one) { const r = get(ctx, one[1]); if (r === undefined) throw new AppError(500, 'MAPPING_ERROR', 'Mapping references an unknown value: ' + one[1]); return r; }
    return v.replace(/\{\{([\w.]+)\}\}/g, (_, k) => { const r = get(ctx, k); if (r === undefined) throw new AppError(500, 'MAPPING_ERROR', 'Mapping references an unknown value: ' + k); return String(r); });
  }
  if (Array.isArray(v)) return v.map(x => fill(x, ctx));
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, fill(x, ctx)]));
  return v;
}
class ProviderClient {
  constructor({ baseUrl, timeoutMs = 15000, fetchImpl = globalThis.fetch, logger }) { Object.assign(this, { baseUrl, timeoutMs, fetchImpl, logger }); }
  async call(method, path, { query, body, token } = {}) {
    if (!path || path[0] !== '/') throw new AppError(500, 'MAPPING_ERROR', 'Path must start with "/".');
    const url = new URL(this.baseUrl + path); for (const [k, v] of Object.entries(query || {})) if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
    const headers = { Accept: 'application/json' }; if (body !== undefined) headers['Content-Type'] = 'application/json'; if (token) headers.Authorization = 'Bearer ' + token;
    const ac = new AbortController(), timer = setTimeout(() => ac.abort(), this.timeoutMs); let res;
    try { res = await this.fetchImpl(url, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined, signal: ac.signal }); }
    catch (e) { this.logger && this.logger.warn('provider request failed', { method, path, name: e.name }); throw e.name === 'AbortError' ? new AppError(504, 'PROVIDER_TIMEOUT', 'The provider did not answer in time.') : new AppError(502, 'PROVIDER_UNAVAILABLE', 'The provider could not be reached.'); }
    finally { clearTimeout(timer); }
    // Error bodies are read (never logged) only to obtain the provider's documented "Msg" code.
    if (res.status >= 400) {
      let eb = null; try { eb = await res.json(); } catch (_) { /* body may be empty or not JSON */ }
      const providerMsg = eb && typeof eb === 'object' && eb.Msg !== undefined && eb.Msg !== null ? String(eb.Msg).slice(0, 40) : undefined;
      const mk = (st, code, msg) => { const e = new AppError(st, code, msg); e.http = res.status; e.providerMsg = providerMsg; return e; };
      if (res.status === 401) throw mk(401, 'PROVIDER_UNAUTHORIZED', 'Provider rejected the credentials or token.');
      if (res.status === 429) throw mk(429, 'PROVIDER_RATE_LIMITED', 'The provider rate limit was reached. Try again later.');
      if (res.status >= 500) throw mk(502, 'PROVIDER_ERROR', 'The provider reported an internal error.');
      throw mk(502, 'PROVIDER_REJECTED', 'The provider rejected the request (HTTP ' + res.status + ').');
    }
    let data; try { data = await res.json(); } catch (_) { throw new AppError(502, 'PROVIDER_BAD_RESPONSE', 'The provider returned an unreadable response.'); }
    return data;
  }
}
module.exports = { ProviderClient, fill, get };
