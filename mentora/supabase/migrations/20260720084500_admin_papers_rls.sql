-- Enable full access to papers for authenticated users
-- This allows the admin console to insert, update, and delete papers

DO $$
BEGIN
    CREATE POLICY "Enable insert for authenticated users only" ON public.papers 
    FOR INSERT TO authenticated WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
    CREATE POLICY "Enable update for authenticated users only" ON public.papers 
    FOR UPDATE TO authenticated USING (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
    CREATE POLICY "Enable delete for authenticated users only" ON public.papers 
    FOR DELETE TO authenticated USING (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Create a storage bucket for past papers
INSERT INTO storage.buckets (id, name, public) 
VALUES ('past_papers', 'past_papers', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for past_papers bucket
DO $$
BEGIN
    CREATE POLICY "Public Access" ON storage.objects FOR SELECT USING (bucket_id = 'past_papers');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
    CREATE POLICY "Authenticated users can upload papers" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'past_papers');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
    CREATE POLICY "Authenticated users can update papers" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'past_papers');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
    CREATE POLICY "Authenticated users can delete papers" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'past_papers');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
