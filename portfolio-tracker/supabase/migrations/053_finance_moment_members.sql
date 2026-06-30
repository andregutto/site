-- 053: Colaboração em Finance Moments — mirrors voyage_trip_members (040) e shared_group_members (031)

CREATE TABLE finance_moment_members (
  id                BIGSERIAL PRIMARY KEY,
  moment_id         BIGINT NOT NULL REFERENCES finance_moments(id) ON DELETE CASCADE,
  user_id           UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  invite_email      TEXT,
  invite_token      TEXT UNIQUE,
  invite_expires_at TIMESTAMPTZ,
  role              TEXT NOT NULL DEFAULT 'editor'
                      CHECK (role IN ('owner','editor','viewer')),
  status            TEXT NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending','active','left')),
  joined_at         TIMESTAMPTZ,
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_fmm_moment ON finance_moment_members(moment_id);
CREATE INDEX idx_fmm_user   ON finance_moment_members(user_id);
CREATE INDEX idx_fmm_token  ON finance_moment_members(invite_token) WHERE invite_token IS NOT NULL;

-- ── RLS ──────────────────────────────────────────────────────────────────────
ALTER TABLE finance_moment_members ENABLE ROW LEVEL SECURITY;

-- members: dono do momento, o próprio membro, ou outro membro ativo do mesmo momento
CREATE POLICY "fmm_select" ON finance_moment_members FOR SELECT TO authenticated USING (
  user_id = auth.uid()
  OR EXISTS (SELECT 1 FROM finance_moments fm WHERE fm.id = moment_id AND fm.user_id = auth.uid())
  OR EXISTS (
    SELECT 1 FROM finance_moment_members m2
    WHERE m2.moment_id = finance_moment_members.moment_id
      AND m2.user_id = auth.uid() AND m2.status = 'active'
  )
);
CREATE POLICY "fmm_insert" ON finance_moment_members FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "fmm_update" ON finance_moment_members FOR UPDATE TO authenticated USING (
  user_id = auth.uid()
  OR EXISTS (SELECT 1 FROM finance_moments fm WHERE fm.id = moment_id AND fm.user_id = auth.uid())
);
CREATE POLICY "fmm_delete" ON finance_moment_members FOR DELETE TO authenticated USING (
  user_id = auth.uid()
  OR EXISTS (SELECT 1 FROM finance_moments fm WHERE fm.id = moment_id AND fm.user_id = auth.uid())
);

-- ── finance_moments: permitir leitura/atualização a membros ativos ────────────
-- (a tabela já tem RLS "users_own_moments" da migration 009; adicionamos acesso
--  de leitura para colaboradores ativos sem remover a policy original)
CREATE POLICY "fm_select_members" ON finance_moments FOR SELECT TO authenticated USING (
  EXISTS (
    SELECT 1 FROM finance_moment_members m
    WHERE m.moment_id = finance_moments.id AND m.user_id = auth.uid() AND m.status = 'active'
  )
);

-- ── finance_transactions: membros ativos de um momento compartilhado podem ver
--    as transações de TODOS os colaboradores daquele momento (via junction table).
--    Escrita (insert/update/delete) continua restrita ao dono da transação —
--    essa policy é só de leitura para o split "quem pagou o quê".
CREATE POLICY "ft_shared_moment_select" ON finance_transactions FOR SELECT TO authenticated USING (
  EXISTS (
    SELECT 1 FROM finance_transaction_moments ftm
    JOIN finance_moment_members fmm ON fmm.moment_id = ftm.moment_id
    WHERE ftm.transaction_id = finance_transactions.id
      AND fmm.user_id = auth.uid()
      AND fmm.status = 'active'
  )
);
