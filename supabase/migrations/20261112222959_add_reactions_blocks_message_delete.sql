/*
# Add message reactions, blocked users, and message deletion support

## Changes

1. New table: `message_reactions`
   - `message_id` references messages(id) ON DELETE CASCADE
   - `user_id` references auth.users(id) ON DELETE CASCADE
   - `emoji` text (the reaction emoji, e.g. '👍')
   - Unique constraint on (message_id, user_id, emoji) — one reaction per user per emoji per message
   - RLS: only conversation members can read/react; users can only insert/delete their own reactions

2. New table: `blocked_users`
   - `blocker_id` references auth.users(id) ON DELETE CASCADE
   - `blocked_id` references auth.users(id) ON DELETE CASCADE
   - Unique constraint on (blocker_id, blocked_id)
   - RLS: users can only read/insert/delete their own blocks

3. Add DELETE policy on `messages` so users can hard-delete their own messages
   - The existing UPDATE policy stays for soft-delete (deleted_at) compatibility

4. Realtime: add message_reactions to the supabase_realtime publication

## Security
- RLS enabled on both new tables
- Grants limited to authenticated role, verbs used by the app
- message_reactions: SELECT for all authenticated (so members can see reactions), INSERT/DELETE scoped to own user
- blocked_users: SELECT/INSERT/DELETE scoped to blocker only
- No admin policies added (admins don't need reaction/block data)
*/

-- ---------- message_reactions ----------
CREATE TABLE IF NOT EXISTS public.message_reactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  emoji text NOT NULL CHECK (char_length(emoji) >= 1 AND char_length(emoji) <= 10),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT message_reactions_unique UNIQUE (message_id, user_id, emoji)
);

ALTER TABLE public.message_reactions ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, DELETE ON public.message_reactions TO authenticated;

CREATE INDEX IF NOT EXISTS idx_message_reactions_message ON public.message_reactions(message_id);

DROP POLICY IF EXISTS "read_message_reactions" ON public.message_reactions;
CREATE POLICY "read_message_reactions"
ON public.message_reactions FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.messages m
    WHERE m.id = message_reactions.message_id
    AND public.is_conversation_member(m.conversation_id)
  )
);

DROP POLICY IF EXISTS "insert_own_message_reaction" ON public.message_reactions;
CREATE POLICY "insert_own_message_reaction"
ON public.message_reactions FOR INSERT
TO authenticated
WITH CHECK (
  user_id = auth.uid()
  AND EXISTS (
    SELECT 1 FROM public.messages m
    WHERE m.id = message_reactions.message_id
    AND public.is_conversation_member(m.conversation_id)
  )
);

DROP POLICY IF EXISTS "delete_own_message_reaction" ON public.message_reactions;
CREATE POLICY "delete_own_message_reaction"
ON public.message_reactions FOR DELETE
TO authenticated
USING (user_id = auth.uid());

-- ---------- blocked_users ----------
CREATE TABLE IF NOT EXISTS public.blocked_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  blocker_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  blocked_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT blocked_users_unique UNIQUE (blocker_id, blocked_id)
);

ALTER TABLE public.blocked_users ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, DELETE ON public.blocked_users TO authenticated;

CREATE INDEX IF NOT EXISTS idx_blocked_users_blocker ON public.blocked_users(blocker_id);
CREATE INDEX IF NOT EXISTS idx_blocked_users_blocked ON public.blocked_users(blocked_id);

DROP POLICY IF EXISTS "read_own_blocks" ON public.blocked_users;
CREATE POLICY "read_own_blocks"
ON public.blocked_users FOR SELECT
TO authenticated
USING (blocker_id = auth.uid());

DROP POLICY IF EXISTS "insert_own_block" ON public.blocked_users;
CREATE POLICY "insert_own_block"
ON public.blocked_users FOR INSERT
TO authenticated
WITH CHECK (blocker_id = auth.uid() AND blocked_id <> auth.uid());

DROP POLICY IF EXISTS "delete_own_block" ON public.blocked_users;
CREATE POLICY "delete_own_block"
ON public.blocked_users FOR DELETE
TO authenticated
USING (blocker_id = auth.uid());

-- ---------- message hard-delete policy ----------
DROP POLICY IF EXISTS "delete_own_messages" ON public.messages;
CREATE POLICY "delete_own_messages"
ON public.messages FOR DELETE
TO authenticated
USING (sender_id = auth.uid());

-- ---------- realtime ----------
ALTER PUBLICATION supabase_realtime ADD TABLE public.message_reactions;
