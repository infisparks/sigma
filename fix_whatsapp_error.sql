-- 1. Create the bucket 'reports' if it doesn't exist
-- We make it public so we can share the link via WhatsApp
INSERT INTO storage.buckets (id, name, public) 
VALUES ('reports', 'reports', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- 2. Enable RLS on storage.objects (Standard practice)
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

-- 3. Allow Authenticated Users (e.g. logged in staff) to Upload (INSERT) files to 'reports' bucket
DROP POLICY IF EXISTS "Allow authenticated uploads to reports" ON storage.objects;
CREATE POLICY "Allow authenticated uploads to reports"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'reports');

-- 4. Allow Authenticated Users to Update (UPDATE) files (needed for upsert/overwriting bills)
DROP POLICY IF EXISTS "Allow authenticated updates to reports" ON storage.objects;
CREATE POLICY "Allow authenticated updates to reports"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'reports');

-- 5. Allow Public Access to Read (SELECT) files in 'reports' bucket
-- This is crucial so the WhatsApp API (and the user) can access the file via the public URL.
DROP POLICY IF EXISTS "Allow public read access to reports" ON storage.objects;
CREATE POLICY "Allow public read access to reports"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'reports');
