/*
# Fix RLS column-reference bugs and harden admin policies

## Problem
The "members read membership" and "members read messages" SELECT policies
contained an unqualified `conversation_id` reference inside an EXISTS subquery.
Postgres resolved that reference to the inner (aliased) table instead of the
outer table, producing a tautology (`own.conversation_id = own.conversation_id`)
that was always true. The result: ANY signed-in user could read ALL
conversation_members and ALL messages across the entire app, not just their own.

## Changes
1. Recreate "members read membership" on conversation_members with a properly
   qualified outer column reference (conversation_members.conversation_id).
2. Recreate "members read messages" on messages with a properly qualified outer
   column reference (messages.conversation_id).
3. Recreate the three admin SELECT policies so they are idempotent and keep
   using the JWT app_metadata role claim (unchanged behavior, clean re-apply).
4. Add an admin SELECT policy on profiles so admins can read every profile
   (profiles are already visible to all signed-in users, so this is additive
   and documents the admin intent).

## Security
- No new tables or columns.
- RLS stays enabled on all tables.
- Admin access still requires `role = admin` in Supabase Auth app_metadata,
  which is user-immutable and set out-of-band.
- Normal users can now only read their own conversations, memberships, and
  messages, as originally intended.
*/

-- Fix conversation_members SELECT policy (was a tautology leak)
DROP POLICY IF EXISTS "members read membership" ON public.conversation_members;
CREATE POLICY "members read membership" ON public.conversation_members
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.conversation_members own
      WHERE own.conversation_id = conversation_members.conversation_id
        AND own.user_id = auth.uid()
    )
  );

-- Fix messages SELECT policy (was a tautology leak)
DROP POLICY IF EXISTS "members read messages" ON public.messages;
CREATE POLICY "members read messages" ON public.messages
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.conversation_members m
      WHERE m.conversation_id = messages.conversation_id
        AND m.user_id = auth.uid()
    )
  );

-- Recreate admin SELECT policies (idempotent, behavior unchanged)
DROP POLICY IF EXISTS "admins read all conversations" ON public.conversations;
CREATE POLICY "admins read all conversations" ON public.conversations
  FOR SELECT TO authenticated
  USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

DROP POLICY IF EXISTS "admins read all memberships" ON public.conversation_members;
CREATE POLICY "admins read all memberships" ON public.conversation_members
  FOR SELECT TO authenticated
  USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

DROP POLICY IF EXISTS "admins read all messages" ON public.messages;
CREATE POLICY "admins read all messages" ON public.messages
  FOR SELECT TO authenticated
  USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

DROP POLICY IF EXISTS "admins read all profiles" ON public.profiles;
CREATE POLICY "admins read all profiles" ON public.profiles
  FOR SELECT TO authenticated
  USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
