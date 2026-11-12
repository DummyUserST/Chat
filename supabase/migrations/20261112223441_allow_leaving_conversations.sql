/*
# Allow users to leave (delete) their own chats

## Changes

1. Grants DELETE on `conversation_members` to `authenticated`.
2. Adds the `leave own conversation` DELETE policy on `conversation_members`
   so a user can remove only their own membership row.

## What this means for users
- Deleting a chat removes it from the deleting user's list and hides its messages
  from them. The other person keeps their copy of the conversation.
- If the two people chat again later, a fresh conversation is started.

## Security
- A user cannot remove anyone else's membership (USING checks user_id = auth.uid()).
- No existing data is modified or removed.
*/

GRANT DELETE ON public.conversation_members TO authenticated;

DROP POLICY IF EXISTS "leave own conversation" ON public.conversation_members;
CREATE POLICY "leave own conversation"
ON public.conversation_members FOR DELETE
TO authenticated
USING (user_id = auth.uid());
