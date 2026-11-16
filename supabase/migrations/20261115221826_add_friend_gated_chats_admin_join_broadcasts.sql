/*
# Friend-gated chats, admin join, broadcast banner, admin console password

1. Overview
- Direct chats can only be opened between users whose friend request was accepted.
- Admins can join any conversation without being a friend, and their membership is hidden from other participants.
- Admins can publish one broadcast banner at a time; it shows on every screen until cancelled.
- The admin console is unlocked by a password verified on the server.

2. Modified tables
- `conversation_members`: new column `hidden` (boolean, default false). Hidden rows are admin join memberships.
- Policies on `conversation_members`: "members read membership" now hides hidden rows from non-admins. Direct client inserts are removed; membership is created only by the RPCs below.
- Policies on `conversations`: the open INSERT policy is removed; conversations are created only through `create_direct_conversation`.
- Policy "members send messages": non-admins may only send in a chat that contains a friend (accepted request) and no hidden admin. Admins may always send.

3. New table
- `admin_broadcasts`: id, message, created_by, created_at, cancelled_at. A broadcast is active while cancelled_at is null. A partial unique index allows only one active broadcast.
- `admin_console_auth`: holds a bcrypt hash of the admin console password. No client access at all (RLS on, no policies, no grants).

4. Functions
- `is_admin()`: true when the signed-in JWT carries app_metadata.role = 'admin'.
- `create_direct_conversation(other_user_id)`: rewritten to require an accepted friendship unless it is reused from an existing two-person chat.
- `admin_join_conversation(conversation_id)`: admin-only; adds the admin as a hidden member.
- `admin_publish_broadcast(message)`: admin-only; cancels any active broadcast and publishes a new one.
- `admin_console_unlock(password)`: admin-only; on first use stores the password as a hash, afterwards compares against it.

5. Security
- RLS remains enabled on all tables. Every new function is revoked from PUBLIC and anon and granted to authenticated only.
- Admin status always comes from the signed token claim, never from client-side data.

6. Notes
- Changing the console password after it is set is not supported by this migration.
- The first admin to unlock the console sets the password.
*/

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

ALTER TABLE conversation_members ADD COLUMN IF NOT EXISTS hidden boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') = 'admin'
$$;

REVOKE EXECUTE ON FUNCTION public.is_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;

DROP POLICY IF EXISTS "users add conversation members" ON conversation_members;
DROP POLICY IF EXISTS "members read membership" ON conversation_members;
CREATE POLICY "members read membership" ON conversation_members FOR SELECT
  TO authenticated
  USING (user_id = auth.uid() OR (NOT hidden AND is_conversation_member(conversation_id)));

DROP POLICY IF EXISTS "signed in users create conversations" ON conversations;

CREATE OR REPLACE FUNCTION public.create_direct_conversation(other_user_id uuid)
RETURNS conversations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  me uuid := auth.uid();
  conv conversations;
BEGIN
  IF me IS NULL THEN
    RAISE EXCEPTION 'Not signed in';
  END IF;
  IF other_user_id IS NULL OR other_user_id = me THEN
    RAISE EXCEPTION 'Invalid recipient';
  END IF;
  IF NOT are_friends(me, other_user_id) THEN
    RAISE EXCEPTION 'You can only message friends whose request was accepted';
  END IF;

  SELECT c.* INTO conv
  FROM conversations c
  WHERE EXISTS (SELECT 1 FROM conversation_members a WHERE a.conversation_id = c.id AND a.user_id = me)
    AND EXISTS (SELECT 1 FROM conversation_members b WHERE b.conversation_id = c.id AND b.user_id = other_user_id)
    AND (SELECT count(*) FROM conversation_members m WHERE m.conversation_id = c.id) = 2
  LIMIT 1;

  IF FOUND THEN
    RETURN conv;
  END IF;

  INSERT INTO conversations DEFAULT VALUES RETURNING * INTO conv;
  INSERT INTO conversation_members (conversation_id, user_id)
  VALUES (conv.id, me), (conv.id, other_user_id);
  RETURN conv;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.create_direct_conversation(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_direct_conversation(uuid) TO authenticated;

DROP POLICY IF EXISTS "members send messages" ON messages;
CREATE POLICY "members send messages" ON messages FOR INSERT
  TO authenticated
  WITH CHECK (
    sender_id = auth.uid()
    AND is_conversation_member(conversation_id)
    AND NOT is_blocked_in_conversation(conversation_id)
    AND (
      is_admin()
      OR EXISTS (
        SELECT 1 FROM conversation_members o
        WHERE o.conversation_id = messages.conversation_id
          AND o.user_id <> auth.uid()
          AND NOT o.hidden
          AND are_friends(auth.uid(), o.user_id)
      )
      AND NOT EXISTS (
        SELECT 1 FROM conversation_members h
        WHERE h.conversation_id = messages.conversation_id AND h.hidden
      )
    )
  );

CREATE TABLE IF NOT EXISTS admin_broadcasts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message text NOT NULL CHECK (char_length(message) BETWEEN 1 AND 500),
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  cancelled_at timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS admin_broadcasts_one_active
  ON admin_broadcasts ((true)) WHERE cancelled_at IS NULL;

ALTER TABLE admin_broadcasts ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE ON admin_broadcasts TO authenticated;

DROP POLICY IF EXISTS "read active broadcasts" ON admin_broadcasts;
CREATE POLICY "read active broadcasts" ON admin_broadcasts FOR SELECT
  TO authenticated
  USING (cancelled_at IS NULL OR is_admin());

DROP POLICY IF EXISTS "admins insert broadcasts" ON admin_broadcasts;
CREATE POLICY "admins insert broadcasts" ON admin_broadcasts FOR INSERT
  TO authenticated
  WITH CHECK (is_admin());

DROP POLICY IF EXISTS "admins update broadcasts" ON admin_broadcasts;
CREATE POLICY "admins update broadcasts" ON admin_broadcasts FOR UPDATE
  TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

CREATE TABLE IF NOT EXISTS admin_console_auth (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  password_hash text NOT NULL
);

ALTER TABLE admin_console_auth ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.admin_join_conversation(p_conversation_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'Admins only';
  END IF;
  INSERT INTO conversation_members (conversation_id, user_id, hidden)
  VALUES (p_conversation_id, auth.uid(), true)
  ON CONFLICT (conversation_id, user_id) DO NOTHING;
  RETURN p_conversation_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_join_conversation(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_join_conversation(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_publish_broadcast(p_message text)
RETURNS admin_broadcasts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  row_out admin_broadcasts;
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'Admins only';
  END IF;
  UPDATE admin_broadcasts SET cancelled_at = now() WHERE cancelled_at IS NULL;
  INSERT INTO admin_broadcasts (message, created_by)
  VALUES (trim(p_message), auth.uid())
  RETURNING * INTO row_out;
  RETURN row_out;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_publish_broadcast(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_publish_broadcast(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_console_unlock(p_password text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  stored text;
BEGIN
  IF NOT is_admin() THEN
    RETURN false;
  END IF;
  IF p_password IS NULL OR char_length(p_password) < 8 THEN
    RAISE EXCEPTION 'Password must be at least 8 characters';
  END IF;

  SELECT password_hash INTO stored FROM admin_console_auth WHERE id = true;
  IF stored IS NULL THEN
    INSERT INTO admin_console_auth (id, password_hash)
    VALUES (true, extensions.crypt(p_password, extensions.gen_salt('bf')))
    ON CONFLICT (id) DO NOTHING;
    RETURN true;
  END IF;
  RETURN extensions.crypt(p_password, stored) = stored;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_console_unlock(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_console_unlock(text) TO authenticated;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE admin_broadcasts;
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN undefined_object THEN NULL;
END $$;
