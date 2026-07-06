-- Posição da capa do recurso (drag-to-reposition, mesmo campo/mecanismo de
-- finance_moments.cover_image_position e voyage_trips.cover_image_position).
ALTER TABLE resources ADD COLUMN IF NOT EXISTS cover_image_position TEXT DEFAULT '50% 50%';
