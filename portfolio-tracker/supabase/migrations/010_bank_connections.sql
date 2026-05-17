-- Contas bancárias conectadas via TrueLayer (OAuth)
CREATE TABLE finance_bank_connections (
  id               BIGSERIAL PRIMARY KEY,
  user_id          UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider         TEXT NOT NULL DEFAULT 'truelayer',
  provider_user_id TEXT,
  display_name     TEXT,
  currency         TEXT DEFAULT 'EUR',
  access_token     TEXT NOT NULL,
  refresh_token    TEXT NOT NULL,
  token_expires_at TIMESTAMPTZ,
  last_synced_at   TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE finance_bank_connections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users_own_connections" ON finance_bank_connections FOR ALL USING (auth.uid() = user_id);

CREATE UNIQUE INDEX idx_bank_connections_unique
  ON finance_bank_connections(user_id, provider, provider_user_id);
