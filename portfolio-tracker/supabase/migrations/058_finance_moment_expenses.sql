-- 058: Lançamento manual de despesa dentro de um Momento (estilo Splitwise)
-- Participantes de uma despesa são sempre usuários reais (dono do momento ou
-- membros ativos de finance_moment_members) — amigos convidados pendentes
-- (invite_email sem user_id) ainda não entram na divisão de valores.

CREATE TABLE finance_moment_expenses (
  id             BIGSERIAL PRIMARY KEY,
  moment_id      BIGINT NOT NULL REFERENCES finance_moments(id) ON DELETE CASCADE,
  description    TEXT NOT NULL,
  amount         NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  currency       TEXT NOT NULL DEFAULT 'BRL',
  paid_by_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  split_type     TEXT NOT NULL DEFAULT 'equal' CHECK (split_type IN ('equal', 'custom')),
  expense_date   DATE NOT NULL DEFAULT CURRENT_DATE,
  created_by     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_fme_moment ON finance_moment_expenses(moment_id);
CREATE INDEX idx_fme_paid_by ON finance_moment_expenses(paid_by_user_id);

CREATE TABLE finance_moment_expense_shares (
  id            BIGSERIAL PRIMARY KEY,
  expense_id    BIGINT NOT NULL REFERENCES finance_moment_expenses(id) ON DELETE CASCADE,
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  share_amount  NUMERIC(12,2) NOT NULL CHECK (share_amount >= 0),
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (expense_id, user_id)
);

CREATE INDEX idx_fmes_expense ON finance_moment_expense_shares(expense_id);
CREATE INDEX idx_fmes_user ON finance_moment_expense_shares(user_id);

-- ── RLS ──────────────────────────────────────────────────────────────────────
ALTER TABLE finance_moment_expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance_moment_expense_shares ENABLE ROW LEVEL SECURITY;

-- expenses: dono do momento ou membro ativo do momento pode ver/gerenciar
CREATE POLICY "fme_select" ON finance_moment_expenses FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM finance_moments fm WHERE fm.id = moment_id AND fm.user_id = auth.uid())
  OR EXISTS (
    SELECT 1 FROM finance_moment_members m
    WHERE m.moment_id = finance_moment_expenses.moment_id AND m.user_id = auth.uid() AND m.status = 'active'
  )
);
CREATE POLICY "fme_insert" ON finance_moment_expenses FOR INSERT TO authenticated WITH CHECK (
  created_by = auth.uid() AND (
    EXISTS (SELECT 1 FROM finance_moments fm WHERE fm.id = moment_id AND fm.user_id = auth.uid())
    OR EXISTS (
      SELECT 1 FROM finance_moment_members m
      WHERE m.moment_id = finance_moment_expenses.moment_id AND m.user_id = auth.uid() AND m.status = 'active'
    )
  )
);
CREATE POLICY "fme_update" ON finance_moment_expenses FOR UPDATE TO authenticated USING (
  created_by = auth.uid()
  OR EXISTS (SELECT 1 FROM finance_moments fm WHERE fm.id = moment_id AND fm.user_id = auth.uid())
);
CREATE POLICY "fme_delete" ON finance_moment_expenses FOR DELETE TO authenticated USING (
  created_by = auth.uid()
  OR EXISTS (SELECT 1 FROM finance_moments fm WHERE fm.id = moment_id AND fm.user_id = auth.uid())
);

-- shares: visível/gerenciável por quem pode ver a despesa correspondente
CREATE POLICY "fmes_select" ON finance_moment_expense_shares FOR SELECT TO authenticated USING (
  EXISTS (
    SELECT 1 FROM finance_moment_expenses e
    JOIN finance_moments fm ON fm.id = e.moment_id
    WHERE e.id = expense_id AND (
      fm.user_id = auth.uid()
      OR EXISTS (
        SELECT 1 FROM finance_moment_members m
        WHERE m.moment_id = e.moment_id AND m.user_id = auth.uid() AND m.status = 'active'
      )
    )
  )
);
CREATE POLICY "fmes_insert" ON finance_moment_expense_shares FOR INSERT TO authenticated WITH CHECK (
  EXISTS (
    SELECT 1 FROM finance_moment_expenses e
    WHERE e.id = expense_id AND e.created_by = auth.uid()
  )
  OR EXISTS (
    SELECT 1 FROM finance_moment_expenses e
    JOIN finance_moments fm ON fm.id = e.moment_id
    WHERE e.id = expense_id AND fm.user_id = auth.uid()
  )
);
CREATE POLICY "fmes_update" ON finance_moment_expense_shares FOR UPDATE TO authenticated USING (
  EXISTS (
    SELECT 1 FROM finance_moment_expenses e
    WHERE e.id = expense_id AND e.created_by = auth.uid()
  )
  OR EXISTS (
    SELECT 1 FROM finance_moment_expenses e
    JOIN finance_moments fm ON fm.id = e.moment_id
    WHERE e.id = expense_id AND fm.user_id = auth.uid()
  )
);
CREATE POLICY "fmes_delete" ON finance_moment_expense_shares FOR DELETE TO authenticated USING (
  EXISTS (
    SELECT 1 FROM finance_moment_expenses e
    WHERE e.id = expense_id AND e.created_by = auth.uid()
  )
  OR EXISTS (
    SELECT 1 FROM finance_moment_expenses e
    JOIN finance_moments fm ON fm.id = e.moment_id
    WHERE e.id = expense_id AND fm.user_id = auth.uid()
  )
);
