-- Add start_date to finance_freedom_plans so plans can back-date to a historical start
ALTER TABLE finance_freedom_plans
  ADD COLUMN IF NOT EXISTS start_date DATE;
