/*
# Enforce blocks on direct messaging

## Changes

1. New function `is_blocked_in_conversation(conversation_id)`
   - Returns true when either person in a conversation has blocked the other.
   - Runs as SECURITY DEFINER because a user can only read their own block rows
     under RLS, but must also detect blocks created by the other person.

2. Rewrites the `members send messages` INSERT policy on `messages`
   - Keeps the existing sender and membership checks.
   - Adds a check that the conversation is not blocked in either direction.

## Security
- The function is not callable by PUBLIC or anon; only authenticated users.
- No table or column changes. No data is modified.
*/

CREATE OR REPLACE FUNCTION public.is_blocked_in_conversation(p_conversation_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.conversation_members other
    JOIN public.blocked_users b
      ON (b.blocker_id = other.user_id AND b.blocked_id = auth.uid())
      OR (b.blocker_id = auth.uid() AND b.blocked_id = other.user_id)
    WHERE other.conversation_id = p_conversation_id
  );
$$;

REVOKE EXECUTE ON FUNCTION public.is_blocked_in_conversation(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_blocked_in_conversation(uuid) TO authenticated;

DROP POLICY IF EXISTS "members send messages" ON public.messages;
CREATE POLICY "members send messages"
ON public.messages FOR INSERT
TO authenticated
WITH CHECK (
  sender_id = auth.uid()
  AND public.is_conversation_member(conversation_id)
  AND NOT public.is_blocked_in_conversation(conversation_id)
);
