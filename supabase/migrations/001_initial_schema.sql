create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique check (username ~ '^[a-zA-Z0-9_]{3,24}$'),
  display_name text not null check (char_length(display_name) between 1 and 60),
  avatar_url text,
  status text default 'offline' check (status in ('online', 'offline')),
  last_seen timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.conversation_members (
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (conversation_id, user_id)
);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_id uuid not null references auth.users(id) on delete cascade,
  content text not null check (char_length(content) between 1 and 4000),
  created_at timestamptz not null default now(),
  edited_at timestamptz,
  deleted_at timestamptz
);

create index if not exists profiles_username_search on public.profiles using gin (to_tsvector('simple', username || ' ' || display_name));
create index if not exists members_user_id on public.conversation_members(user_id);
create index if not exists messages_conversation_created on public.messages(conversation_id, created_at desc);
create index if not exists conversations_updated on public.conversations(updated_at desc);

create or replace function public.touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;
create or replace function public.create_profile_for_user() returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, username, display_name) values (new.id, coalesce(new.raw_user_meta_data->>'username', 'user_' || left(new.id::text, 8)), coalesce(new.raw_user_meta_data->>'display_name', 'New user')) on conflict (id) do nothing;
  return new;
end; $$;
create or replace function public.touch_conversation() returns trigger language plpgsql as $$
begin update public.conversations set updated_at = now() where id = new.conversation_id; return new; end; $$;

drop trigger if exists profiles_updated_at on public.profiles;
create trigger profiles_updated_at before update on public.profiles for each row execute procedure public.touch_updated_at();
drop trigger if exists messages_touch_conversation on public.messages;
create trigger messages_touch_conversation after insert or update on public.messages for each row execute procedure public.touch_conversation();
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute procedure public.create_profile_for_user();

alter table public.profiles enable row level security;
alter table public.conversations enable row level security;
alter table public.conversation_members enable row level security;
alter table public.messages enable row level security;

create policy "profiles are visible to signed in users" on public.profiles for select to authenticated using (true);
create policy "users update own profile" on public.profiles for update to authenticated using (auth.uid() = id) with check (auth.uid() = id);
create policy "members read own conversations" on public.conversations for select to authenticated using (exists (select 1 from public.conversation_members m where m.conversation_id = id and m.user_id = auth.uid()));
create policy "signed in users create conversations" on public.conversations for insert to authenticated with check (true);
create policy "members read membership" on public.conversation_members for select to authenticated using (exists (select 1 from public.conversation_members own where own.conversation_id = conversation_id and own.user_id = auth.uid()));
create policy "users add conversation members" on public.conversation_members for insert to authenticated with check (user_id = auth.uid() or exists (select 1 from public.conversation_members own where own.conversation_id = conversation_id and own.user_id = auth.uid()));
create policy "members read messages" on public.messages for select to authenticated using (exists (select 1 from public.conversation_members m where m.conversation_id = conversation_id and m.user_id = auth.uid()));
create policy "members send messages" on public.messages for insert to authenticated with check (sender_id = auth.uid() and exists (select 1 from public.conversation_members m where m.conversation_id = conversation_id and m.user_id = auth.uid()));
create policy "users delete own messages" on public.messages for update to authenticated using (sender_id = auth.uid()) with check (sender_id = auth.uid());

create or replace function public.create_direct_conversation(other_user_id uuid)
returns public.conversations language plpgsql security definer set search_path = public
as $$
declare result public.conversations;
begin
  if auth.uid() is null or auth.uid() = other_user_id then raise exception 'Invalid conversation participants'; end if;
  select c.* into result from public.conversations c
  where (select count(*) from public.conversation_members m where m.conversation_id = c.id) = 2
    and exists (select 1 from public.conversation_members m where m.conversation_id = c.id and m.user_id = auth.uid())
    and exists (select 1 from public.conversation_members m where m.conversation_id = c.id and m.user_id = other_user_id)
  limit 1;
  if result.id is null then
    insert into public.conversations default values returning * into result;
    insert into public.conversation_members (conversation_id, user_id) values (result.id, auth.uid()), (result.id, other_user_id);
  end if;
  return result;
end; $$;
grant execute on function public.create_direct_conversation(uuid) to authenticated;

alter publication supabase_realtime add table public.messages;
alter publication supabase_realtime add table public.conversations;
