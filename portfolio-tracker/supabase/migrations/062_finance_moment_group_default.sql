-- 062: generaliza o "momento 1:1 oculto" (061) pra grupos (N pessoas) — permite
-- dividir uma despesa avulsa com todo mundo de um shared_groups já existente, sem
-- precisar que essa despesa vire uma categoria recorrente do Planejamento nem um
-- Momento nomeado. Reaproveita a mesma flag is_pair_default (= "momento oculto
-- padrão"); shared_group_id diferencia o caso de grupo do caso de par.
ALTER TABLE finance_moments ADD COLUMN shared_group_id INTEGER NULL REFERENCES shared_groups(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_finance_moments_shared_group_id ON finance_moments(shared_group_id) WHERE shared_group_id IS NOT NULL;
