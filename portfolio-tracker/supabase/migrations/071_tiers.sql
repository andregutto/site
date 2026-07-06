-- Migration 071: Tiers de acesso do Arvo (Beta ⊃ Plus ⊃ Free)
--
-- community_members.tier já existia (migration 063, "preparado pra
-- monetização futura") mas sem CHECK. resources.visibility usava
-- 'free'/'paid' (migration 068). Consolida os dois num único enum de tier
-- com hierarquia simples: 'beta' vê tudo (inclusive não lançado), 'plus' vê
-- tudo já lançado, 'free' vê o padrão.

ALTER TABLE community_members DROP CONSTRAINT IF EXISTS community_members_tier_check;
ALTER TABLE community_members ADD CONSTRAINT community_members_tier_check
  CHECK (tier IN ('free', 'plus', 'beta'));

UPDATE resources SET visibility = 'free' WHERE visibility NOT IN ('free', 'plus', 'beta');
ALTER TABLE resources DROP CONSTRAINT IF EXISTS resources_visibility_check;
ALTER TABLE resources ADD CONSTRAINT resources_visibility_check
  CHECK (visibility IN ('free', 'plus', 'beta'));
