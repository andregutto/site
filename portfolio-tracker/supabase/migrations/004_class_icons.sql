-- Migration: add icon column to asset_classes and update default classes
ALTER TABLE asset_classes ADD COLUMN IF NOT EXISTS icon VARCHAR(10) DEFAULT NULL;

-- Update handle_new_user to assign default icons to new accounts
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)));

  INSERT INTO public.asset_classes (user_id, name, color, icon, sort_order) VALUES
    (NEW.id, 'Ações Brasil',    '#10b981', '📊', 1),
    (NEW.id, 'Ações Exterior',  '#3b82f6', '🌍', 2),
    (NEW.id, 'FIIs',            '#f59e0b', '🏢', 3),
    (NEW.id, 'Cripto',          '#f97316', '🪙', 4),
    (NEW.id, 'Renda Fixa',      '#06b6d4', '🏦', 5),
    (NEW.id, 'Previdência',     '#8b5cf6', '🛡️', 6),
    (NEW.id, 'Imóveis',         '#ef4444', '🏠', 7);

  RETURN NEW;
END;
$$;

-- Update existing default classes to add icons (best-effort name match)
UPDATE asset_classes SET icon = '📊' WHERE icon IS NULL AND name ILIKE '%ações brasil%';
UPDATE asset_classes SET icon = '🌍' WHERE icon IS NULL AND name ILIKE '%ações exterior%';
UPDATE asset_classes SET icon = '🏢' WHERE icon IS NULL AND name ILIKE '%fii%';
UPDATE asset_classes SET icon = '🪙' WHERE icon IS NULL AND name ILIKE '%cripto%';
UPDATE asset_classes SET icon = '🏦' WHERE icon IS NULL AND name ILIKE '%renda fixa%';
UPDATE asset_classes SET icon = '🛡️' WHERE icon IS NULL AND name ILIKE '%previdência%';
UPDATE asset_classes SET icon = '🏠' WHERE icon IS NULL AND name ILIKE '%imóveis%';
