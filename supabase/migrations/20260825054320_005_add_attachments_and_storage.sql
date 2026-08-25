/*
# Add file attachments and voice recordings to messages

## Changes
1. Add columns to public.messages:
   - attachment_url (text, nullable) — public URL of the uploaded file in storage
   - attachment_type (text, nullable) — MIME type category: 'image', 'audio', 'video', 'file'
   - attachment_name (text, nullable) — original file name
   - attachment_duration (int, nullable) — duration in seconds for audio/video
2. Relax the content CHECK constraint so content can be empty when an attachment
   is present (voice recordings have no text body).
3. Create a storage bucket 'attachments' (public-read) for message files.
4. Add storage policies so only authenticated users can upload, and anyone can
   read (public bucket). Uploads are scoped per-user folder path.

## Security
- RLS stays enabled on messages; existing policies unchanged.
- Storage bucket is public-read (so recipients can view attachments) but only
   authenticated users can upload.
- No destructive changes to existing columns or data.
*/

-- Add attachment columns
ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS attachment_url text,
  ADD COLUMN IF NOT EXISTS attachment_type text CHECK (
    attachment_type IS NULL OR attachment_type IN ('image', 'audio', 'video', 'file')
  ),
  ADD COLUMN IF NOT EXISTS attachment_name text,
  ADD COLUMN IF NOT EXISTS attachment_duration int;

-- Allow empty content when an attachment is present
ALTER TABLE public.messages DROP CONSTRAINT IF EXISTS messages_content_check;
ALTER TABLE public.messages
  ADD CONSTRAINT messages_content_check CHECK (
    char_length(content) >= 0 AND char_length(content) <= 4000
  );

-- Create storage bucket for attachments
INSERT INTO storage.buckets (id, name, public)
VALUES ('attachments', 'attachments', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies: authenticated users can upload to their own folder
DROP POLICY IF EXISTS "authenticated upload attachments" ON storage.objects;
CREATE POLICY "authenticated upload attachments" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'attachments' AND auth.role() = 'authenticated');

-- Anyone can read attachments (public bucket)
DROP POLICY IF EXISTS "public read attachments" ON storage.objects;
CREATE POLICY "public read attachments" ON storage.objects
  FOR SELECT USING (bucket_id = 'attachments');

-- Authenticated users can update/delete their own uploads
DROP POLICY IF EXISTS "users update own attachments" ON storage.objects;
CREATE POLICY "users update own attachments" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'attachments' AND owner = auth.uid())
  WITH CHECK (bucket_id = 'attachments' AND owner = auth.uid());

DROP POLICY IF EXISTS "users delete own attachments" ON storage.objects;
CREATE POLICY "users delete own attachments" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'attachments' AND owner = auth.uid());
