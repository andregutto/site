-- 057: persiste o tipo do momento (viagem/festa/jantar/outro), usado pra
-- filtro na listagem e pra decidir se o switch "criar viagem vinculada"
-- aparece no formulário de criação.
ALTER TABLE finance_moments ADD COLUMN moment_type TEXT NOT NULL DEFAULT 'other' CHECK (moment_type IN ('trip','party','dinner','other'));
