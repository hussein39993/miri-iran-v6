'use strict';
// All SQL for accounts lives here. Every query is parameterised ($1, $2 ...); no value is ever concatenated into SQL.
// Table names are unqualified: the connection's search_path points to the sandbox schema (see db/pool.js).
// `c` is a pg client/pool (anything with .query).
const PUBLIC = 'id, customer_no, email, email_verified_at, full_name, phone, preferred_lang, status, status_reason, last_login_at, created_at';

const repo = {
  async insertCustomer(c, x) {
    const r = await c.query(`INSERT INTO customers (customer_no, email, email_norm, password_hash, full_name, phone, preferred_lang)
      VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING ${PUBLIC}`, [x.customerNo, x.email, x.email, x.passwordHash, x.fullName, x.phone, x.lang]);
    return r.rows[0];
  },
  async findByEmail(c, emailNorm) {
    return (await c.query(`SELECT ${PUBLIC}, password_hash FROM customers WHERE email_norm = $1`, [emailNorm])).rows[0] || null;
  },
  async findByIdWithHash(c, id) {
    return (await c.query(`SELECT ${PUBLIC}, password_hash FROM customers WHERE id = $1`, [id])).rows[0] || null;
  },
  async markVerified(c, id) {
    return (await c.query(`UPDATE customers SET email_verified_at = COALESCE(email_verified_at, now()),
      status = CASE WHEN status = 'pending_verification' THEN 'active' ELSE status END, updated_at = now()
      WHERE id = $1 RETURNING ${PUBLIC}`, [id])).rows[0] || null;
  },
  async updateProfile(c, id, p) {
    return (await c.query(`UPDATE customers SET full_name = COALESCE($2, full_name),
      phone = CASE WHEN $3::boolean THEN $4 ELSE phone END, preferred_lang = COALESCE($5, preferred_lang), updated_at = now()
      WHERE id = $1 RETURNING ${PUBLIC}`, [id, p.fullName === undefined ? null : p.fullName, p.phone !== undefined, p.phone === undefined ? null : p.phone, p.lang === undefined ? null : p.lang])).rows[0] || null;
  },
  async setPassword(c, id, hash) {
    await c.query('UPDATE customers SET password_hash = $2, failed_logins = 0, updated_at = now() WHERE id = $1', [id, hash]);
  },
  async bumpFailed(c, id) { return (await c.query('UPDATE customers SET failed_logins = failed_logins + 1 WHERE id = $1 RETURNING failed_logins', [id])).rows[0]; },
  async recordLogin(c, id) { await c.query('UPDATE customers SET failed_logins = 0, last_login_at = now() WHERE id = $1', [id]); },
  async setStatus(c, id, status, reason, by) {
    return (await c.query(`UPDATE customers SET status = $2, status_reason = $3, status_changed_by = $4, status_changed_at = now(), updated_at = now()
      WHERE id = $1 RETURNING ${PUBLIC}`, [id, status, reason, by])).rows[0] || null;
  },
  async listCustomers(c, { q, limit }) {
    const like = q ? '%' + q.replace(/[\\%_]/g, m => '\\' + m).toLowerCase() + '%' : null;
    return (await c.query(`SELECT ${PUBLIC}, failed_logins FROM customers
      WHERE ($1::text IS NULL OR email_norm LIKE $1 ESCAPE '\\' OR lower(full_name) LIKE $1 ESCAPE '\\' OR upper(customer_no) = upper($2))
      ORDER BY created_at DESC LIMIT $3`, [like, q || '', limit])).rows;
  },
  async insertSession(c, x) {
    return (await c.query(`INSERT INTO customer_sessions (customer_id, token_hash, idle_expires_at, abs_expires_at, ip_hash, user_agent)
      VALUES ($1, $2, now() + make_interval(mins => $3::int), now() + make_interval(days => $4::int), $5, $6)
      RETURNING id, idle_expires_at, abs_expires_at`, [x.customerId, x.tokenHash, x.idleMin, x.absDays, x.ipHash, x.userAgent])).rows[0];
  },
  async findSession(c, tokenHash) {
    return (await c.query(`SELECT s.id AS session_id, s.customer_id, s.idle_expires_at, s.abs_expires_at,
        c.customer_no, c.email, c.email_verified_at, c.full_name, c.phone, c.preferred_lang, c.status, c.last_login_at, c.created_at
      FROM customer_sessions s JOIN customers c ON c.id = s.customer_id
      WHERE s.token_hash = $1 AND s.revoked_at IS NULL AND s.idle_expires_at > now() AND s.abs_expires_at > now()`, [tokenHash])).rows[0] || null;
  },
  async touchSession(c, id, idleMin) {
    await c.query(`UPDATE customer_sessions SET last_seen_at = now(), idle_expires_at = LEAST(now() + make_interval(mins => $2::int), abs_expires_at)
      WHERE id = $1 AND last_seen_at < now() - interval '60 seconds'`, [id, idleMin]);
  },
  async revokeSession(c, id, reason) { await c.query('UPDATE customer_sessions SET revoked_at = now(), revoked_reason = $2 WHERE id = $1 AND revoked_at IS NULL', [id, reason]); },
  async revokeAll(c, customerId, exceptId, reason) {
    const r = await c.query('UPDATE customer_sessions SET revoked_at = now(), revoked_reason = $3 WHERE customer_id = $1 AND revoked_at IS NULL AND ($2::uuid IS NULL OR id <> $2::uuid)', [customerId, exceptId || null, reason]);
    return r.rowCount;
  },
  async invalidateTokens(c, customerId, purpose) { await c.query('UPDATE auth_tokens SET used_at = now() WHERE customer_id = $1 AND purpose = $2 AND used_at IS NULL', [customerId, purpose]); },
  async insertAuthToken(c, x) {
    await c.query('INSERT INTO auth_tokens (customer_id, purpose, token_hash, expires_at) VALUES ($1, $2, $3, now() + make_interval(mins => $4::int))', [x.customerId, x.purpose, x.tokenHash, x.ttlMin]);
  },
  // Single use: the UPDATE succeeds for exactly one caller, even under concurrency.
  async consumeAuthToken(c, tokenHash, purpose) {
    const r = await c.query('UPDATE auth_tokens SET used_at = now() WHERE token_hash = $1 AND purpose = $2 AND used_at IS NULL AND expires_at > now() RETURNING customer_id', [tokenHash, purpose]);
    return r.rows[0] ? r.rows[0].customer_id : null;
  },
  async insertOutbox(c, m) {
    await c.query('INSERT INTO mail_outbox (to_email, template, lang, subject, body) VALUES ($1, $2, $3, $4, $5)', [m.to, m.template, m.lang, m.subject, m.body]);
    await c.query("DELETE FROM mail_outbox WHERE at < now() - interval '7 days'");
  },
  async listOutbox(c, limit) { return (await c.query('SELECT id, at, to_email, template, lang, subject, body FROM mail_outbox ORDER BY id DESC LIMIT $1', [limit])).rows; }
};
module.exports = { repo };
