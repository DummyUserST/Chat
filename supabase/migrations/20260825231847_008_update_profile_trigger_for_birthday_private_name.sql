/*
# Update create_profile trigger to store birthday and private_name

## Changes
1. Recreate the `create_profile_for_user()` trigger function to also read
   `birthday` and `private_name` from `raw_user_meta_data` and insert them
   into the `profiles` row.
2. The trigger itself (`on_auth_user_created`) is unchanged — only the
   function body is replaced.

## Security
- SECURITY DEFINER, search_path = public — unchanged.
- No RLS or policy changes.
*/

CREATE OR REPLACE FUNCTION public.create_profile_for_user() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, username, display_name, birthday, private_name)
  VALUES (
    new.id,
    COALESCE(new.raw_user_meta_data->>'username', 'user_' || left(new.id::text, 8)),
    COALESCE(new.raw_user_meta_data->>'display_name', 'New user'),
    NULLIF(new.raw_user_meta_data->>'birthday', '')::date,
    NULLIF(new.raw_user_meta_data->>'private_name', '')
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN new;
END;
$$;
