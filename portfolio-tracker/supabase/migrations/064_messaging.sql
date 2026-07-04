-- Arvo Mensagens: 1:1 DM between active friends, real-time via Supabase Realtime + RLS.

CREATE TABLE dm_conversations (
  id          BIGSERIAL PRIMARY KEY,
  user_a      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  user_b      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_message_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT dm_pair_order CHECK (user_a < user_b),
  CONSTRAINT dm_pair_unique UNIQUE (user_a, user_b)
);

CREATE TABLE dm_messages (
  id              BIGSERIAL PRIMARY KEY,
  conversation_id BIGINT NOT NULL REFERENCES dm_conversations(id) ON DELETE CASCADE,
  sender_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  body            TEXT NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_dm_messages_conv ON dm_messages(conversation_id, created_at DESC);

CREATE TABLE dm_participants_state (
  conversation_id BIGINT NOT NULL REFERENCES dm_conversations(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  last_read_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (conversation_id, user_id)
);

ALTER TABLE dm_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE dm_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE dm_participants_state ENABLE ROW LEVEL SECURITY;

-- Read-only for authenticated clients: writes go through the backend (service_role),
-- which is what makes it safe to expose dm_messages over Realtime directly to the client.
CREATE POLICY dm_conversations_select ON dm_conversations
  FOR SELECT TO authenticated
  USING (auth.uid() IN (user_a, user_b));

CREATE POLICY dm_messages_select ON dm_messages
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM dm_conversations c
      WHERE c.id = dm_messages.conversation_id
        AND auth.uid() IN (c.user_a, c.user_b)
    )
  );

CREATE POLICY dm_participants_state_select ON dm_participants_state
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- Enable Realtime on dm_messages so clients can subscribe to postgres_changes directly.
ALTER PUBLICATION supabase_realtime ADD TABLE dm_messages;
