alter table finance_freedom_plans
  add column if not exists goal_mode text not null default 'capital' check (goal_mode in ('capital', 'income')),
  add column if not exists desired_income numeric,
  add column if not exists income_inflation_pct numeric;
