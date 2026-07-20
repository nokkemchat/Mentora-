-- Enable authenticated users (such as admins) to delete courses
DO $$
BEGIN
    CREATE POLICY "Enable delete access for authenticated users" ON public.courses 
    FOR DELETE TO authenticated USING (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Enable authenticated users to update courses
DO $$
BEGIN
    CREATE POLICY "Enable update access for authenticated users" ON public.courses 
    FOR UPDATE TO authenticated USING (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Enable authenticated users to insert courses
DO $$
BEGIN
    CREATE POLICY "Enable insert access for authenticated users" ON public.courses 
    FOR INSERT TO authenticated WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Same for topics
DO $$
BEGIN
    CREATE POLICY "Enable delete access for authenticated users on topics" ON public.topics 
    FOR DELETE TO authenticated USING (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
