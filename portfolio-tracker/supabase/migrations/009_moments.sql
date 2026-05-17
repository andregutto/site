-- Momentos: grupos de despesas por evento/viagem
CREATE TABLE finance_moments (
  id          BIGSERIAL PRIMARY KEY,
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  description TEXT,
  icon        TEXT NOT NULL DEFAULT '✨',
  color       TEXT NOT NULL DEFAULT '#7C3AED',
  start_date  DATE,
  end_date    DATE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE finance_transactions
  ADD COLUMN IF NOT EXISTS moment_id BIGINT REFERENCES finance_moments(id) ON DELETE SET NULL;

ALTER TABLE finance_moments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users_own_moments" ON finance_moments FOR ALL USING (auth.uid() = user_id);

CREATE INDEX idx_finance_moments_user         ON finance_moments(user_id);
CREATE INDEX idx_finance_transactions_moment  ON finance_transactions(moment_id);

-- Unique constraint on source to prevent duplicate TrueLayer imports
CREATE UNIQUE INDEX IF NOT EXISTS idx_finance_transactions_source
  ON finance_transactions(user_id, source)
  WHERE source IS NOT NULL;
