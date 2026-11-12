/*
# Fix infinite recursion in conversation_members RLS policies

## Problem
The `members read membership` SELECT policy on `conversation_members` contains a subquery
that reads from `conversation_members` itself. When RLS evaluates this policy, it triggers
the same policy again on the subquery, causing infinite recursion (Postgres error 42P17).

This broke ALL queries touching conversations — loading chats, sending messages, everything.

## Fix
1. Create a SECURITY DEFINER function `is_conversation_member(p_conversation_id uuid)`
   that checks if the current user is a member of a conversation. Being SECURITY DEFINER,
   it bypasses RLS and reads conversation_members directly without recursion.

2. Rewrite all policies on `conversation_members` to use this function instead of
   self-referencing subqueries.

3. Rewrite policies on `conversations` and `messages` that also reference
   `conversation_members` to use the same function — preventing any future recursion
   if those tables get caught in the same cycle.

## Tables affected
- conversation_members (SELECT, INSERT policies rewritten)
- conversations (SELECT policy rewritten)
- messages (SELECT, INSERT policies rewritten)

## Security
- The new function is SECURITY DEFINER, search_path set to 'public'
- REVOKE EXECUTE from PUBLIC and anon; GRANT to authenticated only
- All ownership checks still use auth.uid()
*/

CREATE OR REPLACE FUNCTION public.is_conversation_member(p_conversation_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.conversation_members
    WHERE conversation_id = p_conversation_id
    AND user_id = auth.uid()
  );
$$;

REVOKE EXECUTE ON FUNCTION public.is_conversation_member(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_conversation_member(uuid) TO authenticated;

-- ---------- conversation_members policies ----------

DROP POLICY IF EXISTS "admins read all memberships" ON public.conversation_members;
CREATE POLICY "admins read all memberships"
ON public.conversation_members FOR SELECT
TO authenticated
USING (((auth.jwt() -> 'app_metadata'::text) ->> 'role'::text) = 'admin'::text);

DROP POLICY IF EXISTS "members read membership" ON public.conversation_members;
CREATE POLICY "members read membership"
ON public.conversation_members FOR SELECT
TO authenticated
USING (public.is_conversation_member(conversation_id));

DROP POLICY IF EXISTS "users add conversation members" ON public.conversation_members;
CREATE POLICY "users add conversation members"
ON public.conversation_members FOR INSERT
TO authenticated
WITH CHECK (
  user_id = auth.uid()
  OR public.is_conversation_member(conversation_id)
);

-- ---------- conversations policies ----------

DROP POLICY IF EXISTS "admins read all conversations" ON public.conversations;
CREATE POLICY "admins read all conversations"
ON public.conversations FOR SELECT
TO authenticated
USING (((auth.jwt() -> 'app_metadata'::text) ->> 'role'::text) = 'admin'::text);

DROP POLICY IF EXISTS "members read own conversations" ON public.conversations;
CREATE POLICY "members read own conversations"
ON public.conversations FOR SELECT
TO authenticated
USING (public.is_conversation_member(id));

-- ---------- messages policies ----------

DROP POLICY IF EXISTS "admins read all messages" ON public.messages;
CREATE POLICY "admins read all messages"
ON public.messages FOR SELECT
TO authenticated
USING (((auth.jwt() -> 'app_metadata'::text) ->> 'role'::text) = 'admin'::text);

DROP POLICY IF EXISTS "members read messages" ON public.messages;
CREATE POLICY "members read messages"
ON public.messages FOR SELECT
TO authenticated
USING (public.is_conversation_member(conversation_id));

DROP POLICY IF EXISTS "members send messages" ON public.messages;
CREATE POLICY "members send messages"
ON public.messages FOR INSERT
TO authenticated
WITH CHECK (
  sender_id = auth.uid()
  AND public.is_conversation_member(conversation_id)
);