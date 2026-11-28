-- Stage 3A (sandbox): append-only, hash-chained audit log. Rows cannot be updated, deleted or truncated.

CREATE TABLE {{schema}}.audit_logs (
  id           bigserial PRIMARY KEY,
  at           timestamptz NOT NULL,
  actor_type   text NOT NULL CHECK (actor_type IN ('customer', 'admin', 'system')),
  actor_id     text,
  action       text NOT NULL CHECK (char_length(action) <= 60),
  entity_type  text,
  entity_id    text,
  ip_hash      text,
  meta         jsonb NOT NULL DEFAULT '{}'::jsonb,
  prev_hash    bytea,
  hash         bytea NOT NULL
);
CREATE INDEX audit_logs_entity_idx ON {{schema}}.audit_logs (entity_type, entity_id, id DESC);
CREATE INDEX audit_logs_action_idx ON {{schema}}.audit_logs (action, id DESC);

CREATE FUNCTION {{schema}}.audit_logs_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'audit_logs is append-only';
END;
$$;
CREATE TRIGGER audit_logs_no_change BEFORE UPDATE OR DELETE ON {{schema}}.audit_logs
  FOR EACH ROW EXECUTE FUNCTION {{schema}}.audit_logs_immutable();
CREATE TRIGGER audit_logs_no_truncate BEFORE TRUNCATE ON {{schema}}.audit_logs
  FOR EACH STATEMENT EXECUTE FUNCTION {{schema}}.audit_logs_immutable();
