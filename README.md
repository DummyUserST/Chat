# Tandem

Tandem is a focused real-time messaging workspace for one-to-one conversations. It includes Supabase authentication, profiles, user search, persistent conversations and messages, presence, responsive chat navigation, soft message deletion, and light/dark/system appearance settings.

## Stack

- React 18 + TypeScript + Vite
- Tailwind CSS v4
- Supabase Auth, PostgreSQL, Realtime, and Row Level Security
- Lucide React icons

## Setup

1. Install dependencies: `npm install`
2. Create a Supabase project.
3. Copy `.env.example` to `.env.local` and add the project URL and anon key:

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

4. Apply `supabase/migrations/001_initial_schema.sql` with the Supabase CLI (`supabase db push`) or the SQL editor.
5. Start the app with `npm run dev`.

The frontend only uses the anon key. Never put a Supabase service-role key in `.env.local` or client code.

## Supabase

The migration creates `profiles`, `conversations`, `conversation_members`, and `messages`, including foreign keys, indexes, a profile-on-signup trigger, conversation timestamps, Realtime publication entries, and RLS policies. Profiles are created from signup metadata and usernames are validated for uniqueness and safe characters.

The migration currently uses public profile discovery for signed-in users because search needs username and display name. Conversation and message reads are membership-gated. Message inserts require the sender to be a member, and message updates require ownership; deleted messages are soft-deleted by replacing content and setting `deleted_at`.

## Admin console

Administrators can open `/admin` to see all profiles, conversation records, memberships, and the latest 100 messages. The page is protected twice: the UI checks the session claim, and the database migration adds RLS policies that check the signed JWT claim. A normal user cannot gain access by visiting the route directly.

To grant access, set `role: admin` in the user's Supabase Auth **app metadata** using a server-side admin client or the Supabase dashboard. Never set this in user metadata or from frontend code. Existing sessions may need to sign out and back in to receive the refreshed JWT claim.

The admin data view is read-only. It intentionally does not expose passwords, service-role credentials, or raw authentication secrets.

Presence uses Supabase Realtime Presence and updates the signed-in user's `status` and `last_seen` on channel lifecycle. Avatar input is intentionally a validated public URL in V1; Supabase Storage can be added later without changing the profile contract.

## Development

```bash
npm run dev
npm run build
npm run lint
```

## V1 behavior

- Email/password signup and login with persistent Supabase sessions
- Username and display-name profile editing
- Search by username or display name with debounce and result limits
- Duplicate-safe client conversation lookup before creating a direct chat
- Latest 50 messages loaded per conversation
- Realtime message insert/update subscriptions cleaned up on navigation
- Enter sends; Shift+Enter adds a line break
- Own-message soft deletion
- Responsive desktop/mobile conversation views
- Light, dark, and system theme selection persisted locally

## Production notes

Run the migration against the same Supabase project configured in the deployed environment. Keep email confirmation settings aligned with the desired signup flow. Before production launch, add Storage policies if avatar uploads are enabled and review the RLS policies with your organization's threat model.
# Chat