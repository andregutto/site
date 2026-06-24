-- Lets an existing personal finance_categories row be "promoted" into a
-- shared_categories row (same identity, now visible to the group) and
-- reverted back when the category is no longer actually shared with anyone.
-- archived hides the original row from normal category lists while it's
-- promoted, without losing its budget_monthly/keyword_rules/id for the
-- eventual revert. source_category_id remembers which personal category a
-- shared one came from (null for shared categories created directly inside
-- a group, which were never personal and so can't be "unshared").

alter table finance_categories add column if not exists archived boolean not null default false;
alter table shared_categories add column if not exists source_category_id integer references finance_categories(id) on delete set null;
create index if not exists idx_shared_categories_source on shared_categories(source_category_id) where source_category_id is not null;
