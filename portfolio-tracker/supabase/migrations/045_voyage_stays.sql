-- Permite que um item do roteiro (qualquer "lugar") cubra um intervalo de
-- dias em vez de um único day_number — usado para hospedagens (check-in num
-- dia, check-out em outro), sem precisar de um "kind" novo: continua sendo um
-- lugar comum, só que com presença em mais de um dia.
ALTER TABLE voyage_trip_places ADD COLUMN checkin_day  INT;
ALTER TABLE voyage_trip_places ADD COLUMN checkout_day INT;
