-- Finance accounts: user-facing cash/savings accounts (Revolut EUR, NuBank BRL, etc.)
-- Decouples the "account" concept from the OAuth connection mechanism.
-- finance_bank_connections links to these after OAuth.

CREATE TABLE IF NOT EXISTS finance_accounts (
  id               BIGSERIAL PRIMARY KEY,
  user_id          UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name             TEXT NOT NULL,
  currency         VARCHAR(3) NOT NULL DEFAULT 'EUR',
  institution_name TEXT,                             -- matches assets.exchange for grouping
  linked_asset_id  INT REFERENCES assets(id) ON DELETE SET NULL,  -- manual portfolio asset for balance sync (Phase 2)
  color            TEXT NOT NULL DEFAULT '#6366f1',
  icon             TEXT NOT NULL DEFAULT '🏦',
  is_active        BOOLEAN NOT NULL DEFAULT TRUE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE finance_accounts ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'finance_accounts' AND policyname = 'users_own_finance_accounts'
  ) THEN
    CREATE POLICY "users_own_finance_accounts"
      ON finance_accounts FOR ALL USING (auth.uid() = user_id);
  END IF;
END $$;

-- Link TrueLayer connections to a specific finance_account (optional, set after OAuth)
ALTER TABLE finance_bank_connections
  ADD COLUMN IF NOT EXISTS finance_account_id BIGINT REFERENCES finance_accounts(id) ON DELETE SET NULL;

-- Migrate finance_transactions.account_id FK from finance_bank_accounts → finance_accounts
-- Safe: account_id is NULL in every existing row (finance_bank_accounts was never populated)
DO $$
DECLARE cname TEXT;
BEGIN
  SELECT tc.constraint_name INTO cname
  FROM information_schema.table_constraints tc
  JOIN information_schema.key_column_usage kcu
    ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
  WHERE tc.table_schema = 'public' AND tc.table_name = 'finance_transactions'
    AND kcu.column_name = 'account_id' AND tc.constraint_type = 'FOREIGN KEY';
  IF cname IS NOT NULL THEN
    EXECUTE 'ALTER TABLE finance_transactions DROP CONSTRAINT ' || quote_ident(cname);
  END IF;
END $$;

ALTER TABLE finance_transactions
  ADD CONSTRAINT finance_transactions_account_fkey
  FOREIGN KEY (account_id) REFERENCES finance_accounts(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_finance_accounts_user ON finance_accounts(user_id);
