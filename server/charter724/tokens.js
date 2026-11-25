'use strict';
// Caches one access token, refreshes it before expiry, and makes sure concurrent callers share a single login.
class TokenManager {
  constructor({ login, now = Date.now, skewMs = 30000, defaultTtlMs = 5 * 60000 }) { Object.assign(this, { login, now, skewMs, defaultTtlMs }); this.token = null; this.expiresAt = 0; this.inflight = null; }
  async getToken() {
    if (this.token && this.now() < this.expiresAt - this.skewMs) return this.token;
    if (!this.inflight) this.inflight = this._refresh().finally(() => { this.inflight = null; });
    return this.inflight;
  }
  async _refresh() { const r = await this.login(); this.token = r.token; this.expiresAt = this.now() + (r.ttlMs > 0 ? r.ttlMs : this.defaultTtlMs); return this.token; }
  invalidate() { this.token = null; this.expiresAt = 0; }
}
module.exports = { TokenManager };
