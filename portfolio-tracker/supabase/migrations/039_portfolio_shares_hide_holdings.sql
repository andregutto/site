ALTER TABLE portfolio_shares ADD COLUMN IF NOT EXISTS hide_holdings boolean NOT NULL DEFAULT false;
