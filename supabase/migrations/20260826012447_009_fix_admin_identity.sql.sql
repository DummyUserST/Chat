/*
# Fix admin user: add missing auth.identities row

## Problem
The admin user `maker_of_tandem_@admin` was created via direct INSERT into
`auth.users` in migration 006. Supabase Auth also requires a matching row in
`auth.identities` for password-based authentication to work. Without it,
sign-in attempts fail with "Database error querying schema".

## Changes
1. Insert the missing identity row for the admin user (provider = 'email',
   provider_id = the user's email, identity_data containing the email).
   The `email` column is generated, so we omit it.
2. Idempotent — ON CONFLICT DO NOTHING.

## Security
- No schema or policy changes.
*/

INSERT INTO auth.identities (provider_id, user_id, provider, identity_data, last_sign_in_at, created_at, updated_at)
SELECT
  u.email,
  u.id,
  'email',
  jsonb_build_object('sub', u.id::text, 'email', u.email),
  now(),
  now(),
  now()
FROM auth.users u
WHERE u.email = 'maker_of_tandem_@admin'
ON CONFLICT DO NOTHING;
