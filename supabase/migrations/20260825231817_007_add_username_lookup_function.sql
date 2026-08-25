/*
# Add username-to-email lookup function for username-based login

## Changes
1. Create `get_email_by_username(p_username text)` SECURITY DEFINER function that
   joins `profiles` to `auth.users` and returns the email for a given username.
   This allows the anon-key frontend to resolve a username to an email for sign-in.
2. Grant EXECUTE to `anon` and `authenticated` so the lookup works pre-login.

## Security
- The function only returns the email column — no other auth.users data.
- It is SECURITY DEFINER so it can read auth.users, but it only exposes the email
  which is needed for the sign-in flow.
- RLS on profiles and auth.users is unchanged.
*/

CREATE OR REPLACE FUNCTION public.get_email_by_username(p_username text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email text;
BEGIN
  SELECT u.email INTO v_email
  FROM public.profiles p
  JOIN auth.users u ON u.id = p.id
  WHERE p.username = lower(p_username);
  RETURN v_email;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_email_by_username(text) TO anon, authenticated;
