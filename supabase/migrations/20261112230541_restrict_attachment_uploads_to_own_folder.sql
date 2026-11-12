DROP POLICY IF EXISTS "authenticated upload attachments" ON storage.objects;

CREATE POLICY "authenticated upload attachments" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'attachments'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
