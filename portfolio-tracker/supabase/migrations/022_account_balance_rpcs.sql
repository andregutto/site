-- Server-side balance aggregation to bypass PostgREST's max_rows cap (default 1,000 rows).
-- The client-side .limit(50000) is silently capped, causing wrong balances for accounts
-- with more than 1,000 transactions. These RPCs compute the SUM on the DB side instead.

CREATE OR REPLACE FUNCTION get_account_balance(p_user_id uuid, p_account_id int)
RETURNS numeric
LANGUAGE sql SECURITY DEFINER
AS $$
  SELECT COALESCE(SUM(amount), 0)
  FROM finance_transactions
  WHERE user_id = p_user_id AND account_id = p_account_id;
$$;

CREATE OR REPLACE FUNCTION get_all_account_balances(p_user_id uuid)
RETURNS TABLE(account_id int, balance numeric)
LANGUAGE sql SECURITY DEFINER
AS $$
  SELECT account_id, SUM(amount) AS balance
  FROM finance_transactions
  WHERE user_id = p_user_id AND account_id IS NOT NULL
  GROUP BY account_id;
$$;
