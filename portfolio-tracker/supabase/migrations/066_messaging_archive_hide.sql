-- Arvo Mensagens: arquivar/apagar conversa (por participante, não afeta o outro lado).
ALTER TABLE dm_participants_state ADD COLUMN archived_at TIMESTAMPTZ;
ALTER TABLE dm_participants_state ADD COLUMN hidden_at TIMESTAMPTZ;
