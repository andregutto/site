-- 077: bio e visibilidade do perfil público (/u/:handle)
-- bio: texto livre exibido sob o nome no perfil (limite lógico de 280 chars,
-- validado no backend — sem CHECK pra não quebrar em edge cases de encoding).
-- public_profile: quando false, GET /api/community/users/:handle responde 404
-- pra todo mundo exceto o próprio dono e admins (community_admins).
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS bio TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS public_profile BOOLEAN NOT NULL DEFAULT true;
