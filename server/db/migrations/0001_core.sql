-- Stage 3A (sandbox): customers, sessions, e-mail/password tokens, sandbox mail outbox.
-- Money tables (wallet accounts, balances, ledger, deposits, exchanges) arrive in Stage 3B/3C. Never edit this file after it was applied.

CREATE TABLE {{schema}}.customers (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_no        text NOT NULL UNIQUE,
  email              text NOT NULL,
  email_norm         text NOT NULL,
  email_verified_at  timestamptz,
  password_hash      text NOT NULL,
  full_name          text NOT NULL CHECK (char_length(full_name) BETWEEN 2 AND 100),
  phone              text CHECK (phone IS NULL OR char_length(phone) <= 20),
  preferred_lang     text NOT NULL DEFAULT 'ar' CHECK (preferred_lang IN ('ar', 'fa', 'en')),
  status             text NOT NULL DEFAULT 'pending_verification' CHECK (status IN ('pending_verification', 'active', 'restricted', 'suspended', 'closed')),
  status_reason      text CHECK (status_reason IS NULL OR char_length(status_reason) <= 300),
  status_changed_by  text,
  status_changed_at  timestamptz,
  failed_logins      integer NOT NULL DEFAULT 0 CHECK (failed_logins >= 0),
  last_login_at      timestamptz,
  environment        text NOT NULL DEFAULT 'sandbox' CHECK (environment = 'sandbox'),
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX customers_email_norm_uq ON {{schema}}.customers (email_norm);
CREATE INDEX customers_status_idx ON {{schema}}.customers (status);
CREATE INDEX customers_created_idx ON {{schema}}.customers (created_at DESC);

CREATE TABLE {{schema}}.customer_sessions (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id      uuid NOT NULL REFERENCES {{schema}}.customers (id) ON DELETE CASCADE,
  token_hash       bytea NOT NULL UNIQUE,
  created_at       timestamptz NOT NULL DEFAULT now(),
  last_seen_at     timestamptz NOT NULL DEFAULT now(),
  idle_expires_at  timestamptz NOT NULL,
  abs_expires_at   timestamptz NOT NULL,
  revoked_at       timestamptz,
  revoked_reason   text,
  ip_hash          text,
  user_agent       text CHECK (user_agent IS NULL OR char_length(user_agent) <= 200)
);
CREATE INDEX customer_sessions_customer_idx ON {{schema}}.customer_sessions (customer_id) WHERE revoked_at IS NULL;

CREATE TABLE {{schema}}.auth_tokens (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id  uuid NOT NULL REFERENCES {{schema}}.customers (id) ON DELETE CASCADE,
  purpose      text NOT NULL CHECK (purpose IN ('verify_email', 'reset_password')),
  token_hash   bytea NOT NULL UNIQUE,
  expires_at   timestamptz NOT NULL,
  used_at      timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX auth_tokens_customer_idx ON {{schema}}.auth_tokens (customer_id, purpose) WHERE used_at IS NULL;

-- Written ONLY by the sandbox mail adapter (no real e-mail is sent in Stage 3A). Contains links, so it exists in sandbox only.
CREATE TABLE {{schema}}.mail_outbox (
  id        bigserial PRIMARY KEY,
  at        timestamptz NOT NULL DEFAULT now(),
  to_email  text NOT NULL,
  template  text NOT NULL,
  lang      text NOT NULL,
  subject   text NOT NULL,
  body      text NOT NULL
);
CREATE INDEX mail_outbox_at_idx ON {{schema}}.mail_outbox (at DESC);
