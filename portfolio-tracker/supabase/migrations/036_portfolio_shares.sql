-- Public share links for portfolio reports
CREATE TABLE portfolio_shares (
  id          uuid    DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     uuid    NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token       text    NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(16), 'hex'),
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now(),
  is_active   boolean NOT NULL DEFAULT true,
  show_values boolean NOT NULL DEFAULT false,
  label       text,
  snapshot    jsonb
);

CREATE INDEX portfolio_shares_token_idx  ON portfolio_shares(token);
CREATE INDEX portfolio_shares_user_idx   ON portfolio_shares(user_id);

ALTER TABLE portfolio_shares ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users manage own shares"
  ON portfolio_shares FOR ALL
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
