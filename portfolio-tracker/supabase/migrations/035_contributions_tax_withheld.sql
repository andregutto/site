-- Add tax_withheld to contributions for France fiscal reporting (fixed income interest)
ALTER TABLE contributions
  ADD COLUMN IF NOT EXISTS tax_withheld numeric(18,4) DEFAULT 0;

COMMENT ON COLUMN contributions.tax_withheld IS 'IR retido na fonte na origem (BRL), ex: IR sobre CDB/NTN-B — usado para crédito de imposto no relatório fiscal França';
