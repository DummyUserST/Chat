/*
# Add friend requests, personal stories, likes, and comments

1. New Tables
- friend_requests: sender_id, receiver_id, status (pending/accepted/declined)
- stories: author_id, image_url, caption, privacy (public/private)
- story_likes: story_id, user_id (unique per story per user)
- story_comments: story_id, user_id, content (1-500 chars)

2. Security
- RLS on all tables with ownership/membership checks
- are_friends() SECURITY DEFINER helper for private story visibility
- Admins can read all friend requests and stories

3. Notes
- Owner columns default to auth.uid()
- Unique constraints prevent duplicate friend requests and likes
*/

-- ---------- friend_requests ----------
CREATE TABLE IF NOT EXISTS public.friend_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  receiver_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT friend_requests_unique UNIQUE (sender_id, receiver_id)
);

ALTER TABLE public.friend_requests ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.friend_requests TO authenticated;

CREATE INDEX IF NOT EXISTS idx_friend_requests_receiver ON public.friend_requests(receiver_id) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_friend_requests_sender ON public.friend_requests(sender_id);
CREATE INDEX IF NOT EXISTS idx_friend_requests_status ON public.friend_requests(status);

DROP POLICY IF EXISTS "read_own_friend_requests" ON public.friend_requests;
CREATE POLICY "read_own_friend_requests"
ON public.friend_requests FOR SELECT
TO authenticated
USING (
  sender_id = auth.uid() OR receiver_id = auth.uid()
  OR ((auth.jwt() -> 'app_metadata'::text) ->> 'role'::text) = 'admin'::text
);

DROP POLICY IF EXISTS "send_friend_request" ON public.friend_requests;
CREATE POLICY "send_friend_request"
ON public.friend_requests FOR INSERT
TO authenticated
WITH CHECK (
  sender_id = auth.uid() AND receiver_id <> auth.uid()
);

DROP POLICY IF EXISTS "respond_friend_request" ON public.friend_requests;
CREATE POLICY "respond_friend_request"
ON public.friend_requests FOR UPDATE
TO authenticated
USING (receiver_id = auth.uid() OR sender_id = auth.uid())
WITH CHECK (sender_id = auth.uid() OR receiver_id = auth.uid());

DROP POLICY IF EXISTS "delete_friend_request" ON public.friend_requests;
CREATE POLICY "delete_friend_request"
ON public.friend_requests FOR DELETE
TO authenticated
USING (sender_id = auth.uid() OR receiver_id = auth.uid());

-- ---------- are_friends helper ----------
CREATE OR REPLACE FUNCTION public.are_friends(p_user_a uuid, p_user_b uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.friend_requests
    WHERE status = 'accepted'
    AND (
      (sender_id = p_user_a AND receiver_id = p_user_b)
      OR (sender_id = p_user_b AND receiver_id = p_user_a)
    )
  );
$$;

REVOKE EXECUTE ON FUNCTION public.are_friends(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.are_friends(uuid, uuid) TO authenticated;

-- ---------- stories ----------
CREATE TABLE IF NOT EXISTS public.stories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  image_url text NOT NULL,
  caption text,
  privacy text NOT NULL DEFAULT 'public' CHECK (privacy IN ('public', 'private')),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.stories ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.stories TO authenticated;

CREATE INDEX IF NOT EXISTS idx_stories_author ON public.stories(author_id);
CREATE INDEX IF NOT EXISTS idx_stories_created ON public.stories(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_stories_privacy ON public.stories(privacy);

DROP POLICY IF EXISTS "read_stories" ON public.stories;
CREATE POLICY "read_stories"
ON public.stories FOR SELECT
TO authenticated
USING (
  author_id = auth.uid()
  OR privacy = 'public'
  OR (privacy = 'private' AND public.are_friends(author_id, auth.uid()))
  OR ((auth.jwt() -> 'app_metadata'::text) ->> 'role'::text) = 'admin'::text
);

DROP POLICY IF EXISTS "insert_own_stories" ON public.stories;
CREATE POLICY "insert_own_stories"
ON public.stories FOR INSERT
TO authenticated
WITH CHECK (author_id = auth.uid());

DROP POLICY IF EXISTS "update_own_stories" ON public.stories;
CREATE POLICY "update_own_stories"
ON public.stories FOR UPDATE
TO authenticated
USING (author_id = auth.uid())
WITH CHECK (author_id = auth.uid());

DROP POLICY IF EXISTS "delete_own_stories" ON public.stories;
CREATE POLICY "delete_own_stories"
ON public.stories FOR DELETE
TO authenticated
USING (author_id = auth.uid());

-- ---------- story_likes ----------
CREATE TABLE IF NOT EXISTS public.story_likes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  story_id uuid NOT NULL REFERENCES public.stories(id) ON DELETE CASCADE,
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT story_likes_unique UNIQUE (story_id, user_id)
);

ALTER TABLE public.story_likes ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, DELETE ON public.story_likes TO authenticated;

CREATE INDEX IF NOT EXISTS idx_story_likes_story ON public.story_likes(story_id);
CREATE INDEX IF NOT EXISTS idx_story_likes_user ON public.story_likes(user_id);

DROP POLICY IF EXISTS "read_story_likes" ON public.story_likes;
CREATE POLICY "read_story_likes"
ON public.story_likes FOR SELECT
TO authenticated
USING (true);

DROP POLICY IF EXISTS "insert_own_story_like" ON public.story_likes;
CREATE POLICY "insert_own_story_like"
ON public.story_likes FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "delete_own_story_like" ON public.story_likes;
CREATE POLICY "delete_own_story_like"
ON public.story_likes FOR DELETE
TO authenticated
USING (user_id = auth.uid());

-- ---------- story_comments ----------
CREATE TABLE IF NOT EXISTS public.story_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  story_id uuid NOT NULL REFERENCES public.stories(id) ON DELETE CASCADE,
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  content text NOT NULL CHECK (char_length(content) >= 1 AND char_length(content) <= 500),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.story_comments ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, DELETE ON public.story_comments TO authenticated;

CREATE INDEX IF NOT EXISTS idx_story_comments_story ON public.story_comments(story_id);
CREATE INDEX IF NOT EXISTS idx_story_comments_created ON public.story_comments(created_at DESC);

DROP POLICY IF EXISTS "read_story_comments" ON public.story_comments;
CREATE POLICY "read_story_comments"
ON public.story_comments FOR SELECT
TO authenticated
USING (true);

DROP POLICY IF EXISTS "insert_own_story_comment" ON public.story_comments;
CREATE POLICY "insert_own_story_comment"
ON public.story_comments FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "delete_own_story_comment" ON public.story_comments;
CREATE POLICY "delete_own_story_comment"
ON public.story_comments FOR DELETE
TO authenticated
USING (user_id = auth.uid());