-- Fix RLS for student_attempts storage bucket (allow insert & update with upsert: true)
DO $$
BEGIN
    CREATE POLICY "Allow all to insert in student_attempts" ON storage.objects
        FOR INSERT WITH CHECK (bucket_id = 'student_attempts');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
    CREATE POLICY "Allow all to update in student_attempts" ON storage.objects
        FOR UPDATE USING (bucket_id = 'student_attempts') WITH CHECK (bucket_id = 'student_attempts');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
