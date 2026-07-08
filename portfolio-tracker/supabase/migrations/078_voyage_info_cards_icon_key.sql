-- 078: ícone escolhido pro tipo livre ('other') dos cards de informações úteis.
-- Só é usado quando kind = 'other'; nos 5 tipos pré-definidos fica NULL e o
-- ícone é resolvido por KindIcon como já era.
ALTER TABLE voyage_trip_info_cards ADD COLUMN icon_key TEXT NULL;
