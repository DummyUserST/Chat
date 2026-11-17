/*
# Add group chat support

1. Overview
- Users can create group chats with a name, privacy setting (private/public), and join setting (friends only / invite only).
- Friends-only groups can be discovered and joined by any friend of the creator.
- Invite-only groups require an invitation from an existing member; invited users see the group and can join.
- Public groups are visible to all authenticated users and can be joined freely.
- Group members can send messages freely — the friend-gating that applies to 1:1 direct chats does not apply to group chats.

2. Modified tables
- `conversations`: new columns `is_group` (boolean, default false), `name` (text, nullable), `privacy` (text: 'private'|'public', default 'private'), `join_setting` (text: 'friends_only'|'invite_only', default 'friends_only'), `created_by` (uuid, nullable, references auth.users ON DELETE SET NULL).
- SELECT policy on `conversations` updated to also show: public groups, friends-only groups (where the viewer is friends with the creator), and groups where the viewer has a pending invite.
- INSERT policy on `messages` updated to allow any member of a group chat to send messages, bypassing the friend-gating that applies to direct chats. The block check still applies.

3. New table
- `group_invites`: tracks invitations to invite-only groups. Columns: id, conversation_id, invited_user_id, invited_by, status (pending/accepted/declined), created_at, updated_at. Unique on (conversation_id, invited_user_id).

4. Functions
- `create_group_chat(p_name, p_privacy, p_join_setting, p_member_ids uuid[]) -> conversations`: creates a group conversation, adds the caller as creator+member, and adds selected friends as initial members.
- `join_group_chat(p_conversation_id) -> conversations`: joins a group chat (friends-only requires friendship with creator; invite-only requires a pending invite which is auto-accepted; already-a-member returns without error).
- `invite_to_group(p_conversation_id, p_user_id) -> uuid`: invites a user to a group chat (members/admins only).

5. Security
- RLS on group_invites: SELECT (invited user, inviter, conversation members, admin), UPDATE (invited user can accept/decline), DELETE (inviter or admin).
- Grants: SELECT, UPDATE, DELETE on group_invites TO authenticated. INSERT handled by SECURITY DEFINER RPC.
- All new functions revoked from PUBLIC/anon, granted to authenticated.
- Realtime publication updated to include group_invites.

6. Notes
- Existing 1:1 direct chats are unaffected (is_group defaults to false).
- The messages INSERT policy has three branches: admin (always), group chat member (allowed), or friend-gated direct chat (requires a friend with no hidden admin).
*/

-- Create group_invites table FIRST (conversations policy will reference it)
CREATE TABLE IF NOT EXISTS group_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  invited_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  invited_by uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT group_invites_unique UNIQUE (conversation_id, invited_user_id)
);

ALTER TABLE group_invites ENABLE ROW LEVEL SECURITY;

GRANT SELECT, UPDATE, DELETE ON group_invites TO authenticated;

CREATE INDEX IF NOT EXISTS idx_group_invites_user ON group_invites(invited_user_id) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_group_invites_conversation ON group_invites(conversation_id);

DROP POLICY IF EXISTS "read_group_invites" ON group_invites;
CREATE POLICY "read_group_invites" ON group_invites FOR SELECT
  TO authenticated
  USING (
    invited_user_id = auth.uid()
    OR invited_by = auth.uid()
    OR is_conversation_member(conversation_id)
    OR is_admin()
  );

DROP POLICY IF EXISTS "update_own_group_invites" ON group_invites;
CREATE POLICY "update_own_group_invites" ON group_invites FOR UPDATE
  TO authenticated
  USING (invited_user_id = auth.uid())
  WITH CHECK (invited_user_id = auth.uid());

DROP POLICY IF EXISTS "delete_group_invites" ON group_invites;
CREATE POLICY "delete_group_invites" ON group_invites FOR DELETE
  TO authenticated
  USING (invited_by = auth.uid() OR is_admin());

-- Add columns to conversations
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'conversations' AND column_name = 'is_group') THEN
    ALTER TABLE conversations ADD COLUMN is_group boolean NOT NULL DEFAULT false;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'conversations' AND column_name = 'name') THEN
    ALTER TABLE conversations ADD COLUMN name text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'conversations' AND column_name = 'privacy') THEN
    ALTER TABLE conversations ADD COLUMN privacy text NOT NULL DEFAULT 'private' CHECK (privacy IN ('private', 'public'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'conversations' AND column_name = 'join_setting') THEN
    ALTER TABLE conversations ADD COLUMN join_setting text NOT NULL DEFAULT 'friends_only' CHECK (join_setting IN ('friends_only', 'invite_only'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'conversations' AND column_name = 'created_by') THEN
    ALTER TABLE conversations ADD COLUMN created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Update conversations SELECT policy to show joinable groups
DROP POLICY IF EXISTS "members read own conversations" ON conversations;
CREATE POLICY "members read own conversations" ON conversations FOR SELECT
  TO authenticated
  USING (
    is_conversation_member(id)
    OR (is_group AND privacy = 'public')
    OR (is_group AND join_setting = 'friends_only' AND are_friends(auth.uid(), created_by))
    OR (is_group AND EXISTS (
      SELECT 1 FROM group_invites gi
      WHERE gi.conversation_id = id AND gi.invited_user_id = auth.uid() AND gi.status = 'pending'
    ))
    OR is_admin()
  );

-- Update messages INSERT policy to allow group chat members to send
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
        SELECT 1 FROM conversations c
        WHERE c.id = messages.conversation_id AND c.is_group
      )
      OR (
        EXISTS (
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
    )
  );

-- create_group_chat RPC
CREATE OR REPLACE FUNCTION public.create_group_chat(
  p_name text,
  p_privacy text,
  p_join_setting text,
  p_member_ids uuid[]
)
RETURNS conversations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  me uuid := auth.uid();
  conv conversations;
  member_id uuid;
BEGIN
  IF me IS NULL THEN
    RAISE EXCEPTION 'Not signed in';
  END IF;
  IF p_name IS NULL OR char_length(trim(p_name)) < 1 OR char_length(trim(p_name)) > 60 THEN
    RAISE EXCEPTION 'Group name must be 1-60 characters';
  END IF;
  IF p_privacy NOT IN ('private', 'public') THEN
    RAISE EXCEPTION 'Invalid privacy setting';
  END IF;
  IF p_join_setting NOT IN ('friends_only', 'invite_only') THEN
    RAISE EXCEPTION 'Invalid join setting';
  END IF;

  INSERT INTO conversations (is_group, name, privacy, join_setting, created_by)
  VALUES (true, trim(p_name), p_privacy, p_join_setting, me)
  RETURNING * INTO conv;

  INSERT INTO conversation_members (conversation_id, user_id)
  VALUES (conv.id, me);

  IF p_member_ids IS NOT NULL THEN
    FOREACH member_id IN ARRAY p_member_ids LOOP
      IF member_id <> me AND are_friends(me, member_id) THEN
        INSERT INTO conversation_members (conversation_id, user_id)
        VALUES (conv.id, member_id)
        ON CONFLICT (conversation_id, user_id) DO NOTHING;
      END IF;
    END LOOP;
  END IF;

  RETURN conv;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.create_group_chat(text, text, text, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_group_chat(text, text, text, uuid[]) TO authenticated;

-- join_group_chat RPC
CREATE OR REPLACE FUNCTION public.join_group_chat(p_conversation_id uuid)
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

  SELECT * INTO conv FROM conversations WHERE id = p_conversation_id;
  IF NOT FOUND OR NOT conv.is_group THEN
    RAISE EXCEPTION 'Group chat not found';
  END IF;

  IF EXISTS (SELECT 1 FROM conversation_members WHERE conversation_id = p_conversation_id AND user_id = me) THEN
    RETURN conv;
  END IF;

  IF conv.join_setting = 'friends_only' THEN
    IF NOT are_friends(me, conv.created_by) THEN
      RAISE EXCEPTION 'You can only join groups created by your friends';
    END IF;
  ELSIF conv.join_setting = 'invite_only' THEN
    IF NOT EXISTS (
      SELECT 1 FROM group_invites
      WHERE conversation_id = p_conversation_id
      AND invited_user_id = me
      AND status = 'pending'
    ) THEN
      RAISE EXCEPTION 'You need an invitation to join this group';
    END IF;
    UPDATE group_invites SET status = 'accepted', updated_at = now()
    WHERE conversation_id = p_conversation_id AND invited_user_id = me AND status = 'pending';
  END IF;

  INSERT INTO conversation_members (conversation_id, user_id)
  VALUES (p_conversation_id, me)
  ON CONFLICT (conversation_id, user_id) DO NOTHING;

  RETURN conv;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.join_group_chat(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.join_group_chat(uuid) TO authenticated;

-- invite_to_group RPC
CREATE OR REPLACE FUNCTION public.invite_to_group(p_conversation_id uuid, p_user_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT is_admin() AND NOT EXISTS (
    SELECT 1 FROM conversation_members
    WHERE conversation_id = p_conversation_id AND user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'You are not a member of this group';
  END IF;

  INSERT INTO group_invites (conversation_id, invited_user_id, invited_by)
  VALUES (p_conversation_id, p_user_id, auth.uid())
  ON CONFLICT (conversation_id, invited_user_id) DO NOTHING;

  RETURN p_user_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.invite_to_group(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.invite_to_group(uuid, uuid) TO authenticated;

-- Realtime for group_invites
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE group_invites;
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN undefined_object THEN NULL;
END $$;