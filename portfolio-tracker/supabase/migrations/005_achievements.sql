CREATE TABLE IF NOT EXISTS achievements (
  id           SERIAL PRIMARY KEY,
  user_id      UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  achievement_key VARCHAR(50) NOT NULL,
  earned_at    TIMESTAMP   NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, achievement_key)
);

ALTER TABLE achievements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "achievements_own" ON achievements FOR ALL USING (auth.uid() = user_id);
