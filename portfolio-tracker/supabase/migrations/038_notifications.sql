-- Generic notification dismissal / history table.
-- A row means: "this notification (identified by `key`) is dismissed/resolved for this user."
-- For recurring/state-based notifications (budget alerts, split warnings, etc.), a dismissal
-- hides the item from "Active" until the underlying condition's key changes (e.g. new month).
-- For one-time events (bank connect success/error), the backend inserts a row directly at
-- event time -- this both records the event for "History" and marks it as already-seen.
CREATE TABLE notification_dismissals (
  id            SERIAL PRIMARY KEY,
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  key           VARCHAR(200) NOT NULL,
  type          VARCHAR(50) NOT NULL,
  params        JSONB NOT NULL DEFAULT '{}',
  severity      VARCHAR(20) NOT NULL DEFAULT 'info',
  link          VARCHAR(300),
  occurred_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  dismissed_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, key)
);

CREATE INDEX notification_dismissals_user_idx ON notification_dismissals(user_id);
CREATE INDEX notification_dismissals_user_type_idx ON notification_dismissals(user_id, type);

ALTER TABLE notification_dismissals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users manage own notification dismissals"
  ON notification_dismissals FOR ALL
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
