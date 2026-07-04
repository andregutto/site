-- Arvo Mensagens: delete-for-everyone/delete-for-me + realtime read-receipts.

-- "Apagar pra todos": mantém a linha (preserva ordenação/threading) mas esvazia o
-- corpo e marca deleted_at; o autor original continua sendo o único que pode fazer
-- isso (checado no backend, não em RLS, já que a escrita é toda via service_role).
ALTER TABLE dm_messages ADD COLUMN deleted_at TIMESTAMPTZ;

-- "Apagar pra mim": oculta a mensagem só pra quem apagou, sem afetar o outro
-- participante nem o histórico real.
CREATE TABLE dm_message_hidden_for (
  message_id BIGINT NOT NULL REFERENCES dm_messages(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  hidden_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (message_id, user_id)
);

ALTER TABLE dm_message_hidden_for ENABLE ROW LEVEL SECURITY;

CREATE POLICY dm_message_hidden_for_select ON dm_message_hidden_for
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- Read receipts: o cliente já assina dm_messages via Realtime; expõe
-- dm_participants_state também para que o remetente veja em tempo real quando o
-- destinatário atualiza seu last_read_at (mostrado como "Visto às HH:MM").
ALTER PUBLICATION supabase_realtime ADD TABLE dm_participants_state;
