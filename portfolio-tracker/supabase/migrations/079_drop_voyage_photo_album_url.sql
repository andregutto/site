-- photo_album_url deixa de ser um campo dedicado da viagem e vira um card
-- normal (kind='album') dentro de voyage_trip_info_cards, ganhando de graça
-- o toggle de compartilhamento que o campo antigo nunca teve.
-- Confirmado em 2026-07-08: nenhuma das 4 viagens em produção tinha esse
-- campo preenchido, então não há dado a migrar.
ALTER TABLE voyage_trips DROP COLUMN IF EXISTS photo_album_url;
