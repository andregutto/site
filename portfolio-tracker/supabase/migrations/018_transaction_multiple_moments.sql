-- Junction table for many-to-many transactions ↔ moments
CREATE TABLE finance_transaction_moments (
  transaction_id BIGINT NOT NULL REFERENCES finance_transactions(id) ON DELETE CASCADE,
  moment_id      BIGINT NOT NULL REFERENCES finance_moments(id)      ON DELETE CASCADE,
  user_id        UUID   NOT NULL REFERENCES auth.users(id)            ON DELETE CASCADE,
  PRIMARY KEY (transaction_id, moment_id)
);

CREATE INDEX idx_ftm_user_moment  ON finance_transaction_moments(user_id, moment_id);
CREATE INDEX idx_ftm_transaction  ON finance_transaction_moments(transaction_id);

ALTER TABLE finance_transaction_moments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users_own_transaction_moments"
  ON finance_transaction_moments FOR ALL
  USING  (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Migrate existing single-moment assignments
INSERT INTO finance_transaction_moments (transaction_id, moment_id, user_id)
SELECT id, moment_id, user_id
FROM finance_transactions
WHERE moment_id IS NOT NULL
ON CONFLICT DO NOTHING;
