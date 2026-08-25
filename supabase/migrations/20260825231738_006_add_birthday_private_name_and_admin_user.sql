/*
# Add birthday, private_name columns and create real admin user

## Changes
1. Add `birthday` (date, nullable) column to `profiles` — used for age-gating at signup.
2. Add `private_name` (text, nullable) column to `profiles` — a private display name separate from the public username/display_name.
3. Create a real admin user in `auth.users` with:
   - Email: maker_of_tandem_@admin
   - Password: TANDEM@PASSWORD@ADMIN (bcrypt-hashed via crypt)
   - `raw_app_meta_data` role = 'admin' so RLS admin policies grant access
4. Insert a matching `profiles` row for the admin user.

## Security
- RLS remains enabled on all tables. No policy changes.
- The admin user's role lives in `raw_app_meta_data` (user-immutable), not `raw_user_meta_data`.
- Age-gating is enforced client-side at signup; the birthday column stores the value for audit.
*/

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS birthday date,
  ADD COLUMN IF NOT EXISTS private_name text;

-- Create the real admin user in auth.users if they don't already exist.
DO $$
DECLARE
  admin_id uuid;
BEGIN
  SELECT id INTO admin_id FROM auth.users WHERE email = 'maker_of_tandem_@admin';
  IF admin_id IS NULL THEN
    INSERT INTO auth.users (
      instance_id,
      id,
      aud,
      role,
      email,
      encrypted_password,
      email_confirmed_at,
      recovery_sent_at,
      created_at,
      updated_at,
      raw_app_meta_data,
      raw_user_meta_data,
      is_super_admin,
      email_change,
      email_change_token_current,
      email_change_confirm_status
    ) VALUES (
      '00000000-0000-0000-0000-000000000000',
      gen_random_uuid(),
      'authenticated',
      'authenticated',
      'maker_of_tandem_@admin',
      crypt('TANDEM@PASSWORD@ADMIN', gen_salt('bf')),
      now(),
      now(),
      now(),
      now(),
      '{"role":"admin"}'::jsonb,
      '{"username":"maker_of_tandem_","display_name":"Tandem Admin"}'::jsonb,
      false,
      '',
      '',
      0
    )
    RETURNING id INTO admin_id;
  ELSE
    UPDATE auth.users
      SET raw_app_meta_data = raw_app_meta_data || '{"role":"admin"}'::jsonb
      WHERE id = admin_id;
  END IF;

  INSERT INTO public.profiles (id, username, display_name, private_name)
  VALUES (admin_id, 'maker_of_tandem_', 'Tandem Admin', 'Tandem Admin')
  ON CONFLICT (id) DO NOTHING;
END $$;
