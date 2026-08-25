-- Admin access is granted out-of-band through Supabase Auth app_metadata.
-- Example (run with the server-side Supabase admin client only):
-- update auth.users set raw_app_meta_data = raw_app_meta_data || '{"role":"admin"}' where email = 'admin@example.com';

create policy "admins read all conversations" on public.conversations
  for select to authenticated
  using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

create policy "admins read all memberships" on public.conversation_members
  for select to authenticated
  using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

create policy "admins read all messages" on public.messages
  for select to authenticated
  using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
