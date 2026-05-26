CREATE TABLE IF NOT EXISTS dividends (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  asset_id integer NOT NULL,
  ex_date date NOT NULL,
  pay_date date,
  amount_per_share numeric(18, 8) NOT NULL,
  amount_total numeric(18, 4),
  currency text NOT NULL DEFAULT 'BRL',
  amount_brl numeric(18, 4),
  dividend_type text NOT NULL DEFAULT 'dividend',
  source text NOT NULL DEFAULT 'brapi',
  created_at timestamptz DEFAULT now(),
  CONSTRAINT dividends_asset_date_type UNIQUE (asset_id, ex_date, dividend_type)
);

ALTER TABLE dividends ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users own dividends" ON dividends
  FOR ALL USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE INDEX IF NOT EXISTS dividends_user_exdate ON dividends (user_id, ex_date DESC);
CREATE INDEX IF NOT EXISTS dividends_asset_id ON dividends (asset_id);
