/*
# Fix INSERT policy tautology bugs on conversation_members and messages

## Problem
Two INSERT policies had the same column-reference bug as the SELECT policies
fixed in migration 003: an unqualified `conversation_id` inside an EXISTS
subquery resolved to the inner table, producing a tautology that was always
true.

- "users add conversation members" allowed ANY signed-in user to add ANY user
  to ANY conversation, regardless of whether the adding user was a member.
- "members send messages" allowed ANY signed-in user to send a message to ANY
  conversation, not just ones they belong to (the sender_id check was real, but
  the membership check was a no-op tautology).

## Changes
1. Recreate "users add conversation members" INSERT policy with a properly
   qualified outer column reference so only members of a conversation (or the
   user adding themselves) can insert membership rows.
2. Recreate "members send messages" INSERT policy with a properly qualified
   outer column reference so only members can send messages.

## Security
- No schema changes.
- RLS stays enabled.
- The SECURITY DEFINER function create_direct_conversation is unaffected
  because it bypasses RLS.
*/

DROP POLICY IF EXISTS "users add conversation members" ON public.conversation_members;
CREATE POLICY "users add conversation members" ON public.conversation_members
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.conversation_members own
      WHERE own.conversation_id = conversation_members.conversation_id
        AND own.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "members send messages" ON public.messages;
CREATE POLICY "members send messages" ON public.messages
  FOR INSERT TO authenticated
  WITH CHECK (
    sender_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.conversation_members m
      WHERE m.conversation_id = messages.conversation_id
        AND m.user_id = auth.uid()
    )
  );
