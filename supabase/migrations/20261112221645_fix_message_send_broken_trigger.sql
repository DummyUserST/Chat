-- Remove the duplicate, non-SECURITY DEFINER trigger that blocks message inserts.
-- The "bump_conversation_updated_at" trigger (SECURITY DEFINER) already does the same job.
DROP TRIGGER IF EXISTS messages_touch_conversation ON public.messages;
DROP FUNCTION IF EXISTS public.touch_conversation();