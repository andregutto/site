-- 031: Shared budget categories between users

CREATE TABLE shared_groups (
  id         BIGSERIAL PRIMARY KEY,
  name       TEXT NOT NULL,
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE shared_group_members (
  id                BIGSERIAL PRIMARY KEY,
  group_id          BIGINT NOT NULL REFERENCES shared_groups(id) ON DELETE CASCADE,
  user_id           UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  invite_email      TEXT,
  invite_token      TEXT UNIQUE,
  invite_expires_at TIMESTAMPTZ,
  status            TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','active','left')),
  share_mode        TEXT NOT NULL DEFAULT 'manual'
    CHECK (share_mode IN ('salary_based','manual')),
  share_pct         NUMERIC(5,2) DEFAULT 50,
  salary_authorized BOOLEAN DEFAULT FALSE,
  joined_at         TIMESTAMPTZ,
  left_at           TIMESTAMPTZ,
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE shared_categories (
  id         BIGSERIAL PRIMARY KEY,
  group_id   BIGINT NOT NULL REFERENCES shared_groups(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  icon       TEXT DEFAULT '🏷️',
  color      TEXT DEFAULT '#6366f1',
  total_goal NUMERIC(12,2) DEFAULT 0,
  currency   VARCHAR(3) DEFAULT 'EUR',
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE finance_transactions
  ADD COLUMN shared_category_id BIGINT
    REFERENCES shared_categories(id) ON DELETE SET NULL;

CREATE INDEX idx_sgm_group   ON shared_group_members(group_id);
CREATE INDEX idx_sgm_user    ON shared_group_members(user_id);
CREATE INDEX idx_sgm_token   ON shared_group_members(invite_token) WHERE invite_token IS NOT NULL;
CREATE INDEX idx_ft_shared   ON finance_transactions(shared_category_id) WHERE shared_category_id IS NOT NULL;

-- RLS
ALTER TABLE shared_groups       ENABLE ROW LEVEL SECURITY;
ALTER TABLE shared_group_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE shared_categories   ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sg_select" ON shared_groups FOR SELECT TO authenticated USING (
  created_by = auth.uid()
  OR EXISTS (SELECT 1 FROM shared_group_members WHERE group_id = shared_groups.id AND user_id = auth.uid() AND status IN ('active','pending'))
);
CREATE POLICY "sg_insert" ON shared_groups FOR INSERT TO authenticated WITH CHECK (created_by = auth.uid());
CREATE POLICY "sg_update" ON shared_groups FOR UPDATE TO authenticated USING (created_by = auth.uid());
CREATE POLICY "sg_delete" ON shared_groups FOR DELETE TO authenticated USING (created_by = auth.uid());

CREATE POLICY "sgm_select" ON shared_group_members FOR SELECT TO authenticated USING (
  user_id = auth.uid()
  OR EXISTS (SELECT 1 FROM shared_group_members m2 WHERE m2.group_id = shared_group_members.group_id AND m2.user_id = auth.uid() AND m2.status IN ('active','pending'))
);
CREATE POLICY "sgm_insert" ON shared_group_members FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "sgm_update" ON shared_group_members FOR UPDATE TO authenticated USING (
  user_id = auth.uid()
  OR EXISTS (SELECT 1 FROM shared_groups WHERE id = group_id AND created_by = auth.uid())
);
CREATE POLICY "sgm_delete" ON shared_group_members FOR DELETE TO authenticated USING (
  user_id = auth.uid()
  OR EXISTS (SELECT 1 FROM shared_groups WHERE id = group_id AND created_by = auth.uid())
);

CREATE POLICY "sc_select" ON shared_categories FOR SELECT TO authenticated USING (
  created_by = auth.uid()
  OR EXISTS (SELECT 1 FROM shared_group_members WHERE group_id = shared_categories.group_id AND user_id = auth.uid() AND status = 'active')
);
CREATE POLICY "sc_insert" ON shared_categories FOR INSERT TO authenticated WITH CHECK (created_by = auth.uid());
CREATE POLICY "sc_update" ON shared_categories FOR UPDATE TO authenticated USING (
  EXISTS (SELECT 1 FROM shared_group_members WHERE group_id = shared_categories.group_id AND user_id = auth.uid() AND status = 'active')
);
CREATE POLICY "sc_delete" ON shared_categories FOR DELETE TO authenticated USING (created_by = auth.uid());

-- Allow active group members to read each other's transactions in shared categories
CREATE POLICY "ft_shared_select" ON finance_transactions FOR SELECT TO authenticated USING (
  shared_category_id IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM shared_categories sc
    JOIN shared_group_members sgm ON sgm.group_id = sc.group_id
    WHERE sc.id = finance_transactions.shared_category_id
      AND sgm.user_id = auth.uid()
      AND sgm.status = 'active'
  )
);
