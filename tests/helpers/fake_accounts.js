'use strict';
// In-memory stand-ins for the PostgreSQL repository and transaction handling. They let the account LOGIC be tested without a database.
// They do NOT run any SQL.
// ---------- fake repository (same interface as server/customers/repo.js) ----------
function fakeRepo(clock) {
  const st = { customers: [], sessions: [], tokens: [], outbox: [], audit: [] }; let seq = 0;
  const id = () => '00000000-0000-4000-8000-' + String(++seq).padStart(12, '0');
  const pub = r => r;
  const r = {
    st,
    async insertCustomer(c, x) { if (st.customers.some(y => y.email_norm === x.email)) { const e = new Error('dup'); e.code = '23505'; e.constraint = 'customers_email_norm_uq'; throw e; } const row = { id: id(), customer_no: x.customerNo, email: x.email, email_norm: x.email, email_verified_at: null, password_hash: x.passwordHash, full_name: x.fullName, phone: x.phone, preferred_lang: x.lang, status: 'pending_verification', status_reason: null, failed_logins: 0, last_login_at: null, created_at: new Date(clock.t) }; st.customers.push(row); return pub(row); },
    async findByEmail(c, e) { return st.customers.find(x => x.email_norm === e) || null; },
    async findByIdWithHash(c, i) { return st.customers.find(x => x.id === i) || null; },
    async markVerified(c, i) { const x = st.customers.find(y => y.id === i); x.email_verified_at = x.email_verified_at || new Date(clock.t); if (x.status === 'pending_verification') x.status = 'active'; return x; },
    async updateProfile(c, i, p) { const x = st.customers.find(y => y.id === i); if (p.fullName !== undefined) x.full_name = p.fullName; if (p.phone !== undefined) x.phone = p.phone; if (p.lang !== undefined) x.preferred_lang = p.lang; return x; },
    async setPassword(c, i, h) { const x = st.customers.find(y => y.id === i); x.password_hash = h; x.failed_logins = 0; },
    async bumpFailed(c, i) { const x = st.customers.find(y => y.id === i); x.failed_logins++; return x; },
    async recordLogin(c, i) { const x = st.customers.find(y => y.id === i); x.failed_logins = 0; x.last_login_at = new Date(clock.t); },
    async setStatus(c, i, status, reason, by) { const x = st.customers.find(y => y.id === i); if (!x) return null; Object.assign(x, { status, status_reason: reason, status_changed_by: by }); return x; },
    async listCustomers(c, { q, limit }) { return st.customers.filter(x => !q || x.email_norm.includes(q.toLowerCase()) || x.full_name.toLowerCase().includes(q.toLowerCase()) || x.customer_no.toUpperCase() === q.toUpperCase()).slice(0, limit); },
    async insertSession(c, x) { const s = { id: id(), customer_id: x.customerId, token_hash: x.tokenHash.toString('hex'), idle_expires_at: new Date(clock.t + x.idleMin * 60000), abs_expires_at: new Date(clock.t + x.absDays * 86400000), revoked_at: null, last_seen_at: new Date(clock.t) }; st.sessions.push(s); return s; },
    async findSession(c, h) { const s = st.sessions.find(y => y.token_hash === h.toString('hex') && !y.revoked_at && y.idle_expires_at > clock.t && y.abs_expires_at > clock.t); if (!s) return null; const cu = st.customers.find(y => y.id === s.customer_id); return { session_id: s.id, customer_id: s.customer_id, ...cu }; },
    async touchSession(c, i, idleMin) { const s = st.sessions.find(y => y.id === i); if (s && clock.t - s.last_seen_at > 60000) { s.last_seen_at = new Date(clock.t); s.idle_expires_at = new Date(Math.min(clock.t + idleMin * 60000, +s.abs_expires_at)); } },
    async revokeSession(c, i, reason) { const s = st.sessions.find(y => y.id === i); if (s && !s.revoked_at) s.revoked_at = new Date(clock.t); },
    async revokeAll(c, cid, except, reason) { let k = 0; st.sessions.forEach(s => { if (s.customer_id === cid && !s.revoked_at && s.id !== except) { s.revoked_at = new Date(clock.t); k++; } }); return k; },
    async invalidateTokens(c, cid, purpose) { st.tokens.forEach(t => { if (t.customerId === cid && t.purpose === purpose && !t.used) t.used = true; }); },
    async insertAuthToken(c, x) { st.tokens.push({ customerId: x.customerId, purpose: x.purpose, hash: x.tokenHash.toString('hex'), expires: clock.t + x.ttlMin * 60000, used: false }); },
    async consumeAuthToken(c, h, purpose) { const t = st.tokens.find(y => y.hash === h.toString('hex') && y.purpose === purpose && !y.used && y.expires > clock.t); if (!t) return null; t.used = true; return t.customerId; },
    async insertOutbox(c, m) { st.outbox.push(m); },
    async listOutbox(c, limit) { return st.outbox.slice(-limit).reverse(); }
  };
  return r;
}
// fake db: tx() runs fn with a client whose audit queries are recorded; a thrown error rolls back the fake store (snapshot restore).
function fakeDb(repo) {
  const client = { async query(sql) { if (/pg_advisory_xact_lock/.test(sql)) return { rows: [] }; if (/SELECT hash FROM audit_logs/.test(sql)) { const l = repo.st.audit[repo.st.audit.length - 1]; return { rows: l ? [{ hash: l.hash }] : [] }; } return { rows: [] }; } };
  client.query = (orig => async (sql, p) => { if (/INSERT INTO audit_logs/.test(sql)) { repo.st.audit.push({ at: p[0], actor_type: p[1], actor_id: p[2], action: p[3], entity_type: p[4], entity_id: p[5], ip_hash: p[6], meta: JSON.parse(p[7]), prev_hash: p[8], hash: p[9] }); return { rows: [] }; } return orig(sql, p); })(client.query);
  return {
    query: async () => ({ rows: [] }),
    async tx(fn) { const snap = JSON.stringify(repo.st, (k, v) => v), keep = { customers: repo.st.customers.map(x => ({ ...x })), sessions: repo.st.sessions.map(x => ({ ...x })), tokens: repo.st.tokens.map(x => ({ ...x })), outbox: [...repo.st.outbox], audit: [...repo.st.audit] }; try { return await fn(client); } catch (e) { Object.assign(repo.st, keep); throw e; } }
  };
}

module.exports = { fakeRepo, fakeDb };
