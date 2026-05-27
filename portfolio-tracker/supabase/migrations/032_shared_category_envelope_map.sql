-- 032: Per-user envelope assignment for shared categories

CREATE TABLE shared_category_user_settings (
  user_id            UUID   NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  shared_category_id BIGINT NOT NULL REFERENCES shared_categories(id) ON DELETE CASCADE,
  local_envelope_id  BIGINT REFERENCES finance_envelopes(id) ON DELETE SET NULL,
  PRIMARY KEY (user_id, shared_category_id)
);

ALTER TABLE shared_category_user_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "scus_all" ON shared_category_user_settings
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
