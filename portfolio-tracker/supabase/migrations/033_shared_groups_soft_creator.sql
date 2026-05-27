-- 033: Allow shared_groups.created_by to be NULL when creator deletes account
-- Previously ON DELETE CASCADE wiped the entire group silently for other members.
-- Now ON DELETE SET NULL preserves the group; members can still use it.

ALTER TABLE shared_groups ALTER COLUMN created_by DROP NOT NULL;

ALTER TABLE shared_groups DROP CONSTRAINT shared_groups_created_by_fkey;
ALTER TABLE shared_groups ADD CONSTRAINT shared_groups_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;

-- Update sg_update / sg_delete policies to also allow active members when creator is gone
DROP POLICY IF EXISTS "sg_update" ON shared_groups;
DROP POLICY IF EXISTS "sg_delete" ON shared_groups;

CREATE POLICY "sg_update" ON shared_groups FOR UPDATE TO authenticated USING (
  created_by = auth.uid()
  OR (
    created_by IS NULL
    AND EXISTS (SELECT 1 FROM shared_group_members WHERE group_id = shared_groups.id AND user_id = auth.uid() AND status = 'active')
  )
);

CREATE POLICY "sg_delete" ON shared_groups FOR DELETE TO authenticated USING (
  created_by = auth.uid()
  OR (
    created_by IS NULL
    AND EXISTS (SELECT 1 FROM shared_group_members WHERE group_id = shared_groups.id AND user_id = auth.uid() AND status = 'active')
  )
);
