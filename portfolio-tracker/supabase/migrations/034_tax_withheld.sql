-- Add tax_withheld to dividends for France fiscal reporting
ALTER TABLE dividends
  ADD COLUMN IF NOT EXISTS tax_withheld numeric(18,4) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS country_of_dividend text;

COMMENT ON COLUMN dividends.tax_withheld IS 'IR withheld at source (actual, in original currency)';
COMMENT ON COLUMN dividends.country_of_dividend IS 'Override country for dividend origin (e.g. TW for TSM)';
