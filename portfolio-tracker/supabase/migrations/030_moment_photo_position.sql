-- Add cover_image_position to finance_moments
-- Stores CSS object-position value, e.g. "50% 30%"
ALTER TABLE finance_moments
  ADD COLUMN IF NOT EXISTS cover_image_position text DEFAULT '50% 50%';
