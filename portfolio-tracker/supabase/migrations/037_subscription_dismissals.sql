-- Persisted "not a subscription" dismissals for the subscription scanner
CREATE TABLE finance_subscription_dismissals (
  id            SERIAL PRIMARY KEY,
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  key           VARCHAR(200) NOT NULL,
  name          VARCHAR(500) NOT NULL DEFAULT '',
  dismissed_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, key)
);

CREATE INDEX finance_subscription_dismissals_user_idx ON finance_subscription_dismissals(user_id);

ALTER TABLE finance_subscription_dismissals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users manage own subscription dismissals"
  ON finance_subscription_dismissals FOR ALL
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
