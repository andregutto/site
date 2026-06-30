-- 054: Per-friend "auto-accept invites" preference.
-- A row in user_friends is owned by `owner_user_id` and points at `friend_user_id`.
-- auto_accept_invites=true on (owner_user_id=A, friend_user_id=B) means: when B
-- invites A to a shared trip/moment/category, A's invite is activated immediately
-- instead of requiring an explicit accept click.

ALTER TABLE user_friends
  ADD COLUMN auto_accept_invites BOOLEAN NOT NULL DEFAULT FALSE;
