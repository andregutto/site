-- Add cover photo to moments
ALTER TABLE finance_moments ADD COLUMN IF NOT EXISTS cover_image_url TEXT;

-- Create moment-photos storage bucket (public so images are accessible via URL)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('moment-photos', 'moment-photos', true, 5242880, ARRAY['image/jpeg','image/png','image/webp','image/gif'])
ON CONFLICT (id) DO NOTHING;

-- Users can upload to their own folder (path: {userId}/filename)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'moment_photos_insert' AND tablename = 'objects' AND schemaname = 'storage'
  ) THEN
    CREATE POLICY "moment_photos_insert" ON storage.objects FOR INSERT TO authenticated
    WITH CHECK (bucket_id = 'moment-photos' AND (storage.foldername(name))[1] = auth.uid()::text);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'moment_photos_select' AND tablename = 'objects' AND schemaname = 'storage'
  ) THEN
    CREATE POLICY "moment_photos_select" ON storage.objects FOR SELECT TO public
    USING (bucket_id = 'moment-photos');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'moment_photos_delete' AND tablename = 'objects' AND schemaname = 'storage'
  ) THEN
    CREATE POLICY "moment_photos_delete" ON storage.objects FOR DELETE TO authenticated
    USING (bucket_id = 'moment-photos' AND (storage.foldername(name))[1] = auth.uid()::text);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'moment_photos_update' AND tablename = 'objects' AND schemaname = 'storage'
  ) THEN
    CREATE POLICY "moment_photos_update" ON storage.objects FOR UPDATE TO authenticated
    USING (bucket_id = 'moment-photos' AND (storage.foldername(name))[1] = auth.uid()::text);
  END IF;
END $$;
