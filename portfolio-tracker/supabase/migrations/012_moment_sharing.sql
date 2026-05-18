ALTER TABLE finance_moments
  ADD COLUMN IF NOT EXISTS share_token UUID UNIQUE DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS share_expires_at TIMESTAMPTZ DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS share_hide_descriptions BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_finance_moments_share_token ON finance_moments(share_token) WHERE share_token IS NOT NULL;
