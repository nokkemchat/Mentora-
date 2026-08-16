-- Fix RLS Policies to allow INSERT/UPDATE/DELETE for ingestion pipeline tables
DO $$
BEGIN
    CREATE POLICY "Enable insert access for all users on ingestion_jobs" ON public.ingestion_jobs FOR INSERT WITH CHECK (true);
    CREATE POLICY "Enable update access for all users on ingestion_jobs" ON public.ingestion_jobs FOR UPDATE USING (true);
    CREATE POLICY "Enable delete access for all users on ingestion_jobs" ON public.ingestion_jobs FOR DELETE USING (true);
    
    CREATE POLICY "Enable insert access for all users on question_parts" ON public.question_parts FOR INSERT WITH CHECK (true);
    CREATE POLICY "Enable update access for all users on question_parts" ON public.question_parts FOR UPDATE USING (true);
    CREATE POLICY "Enable delete access for all users on question_parts" ON public.question_parts FOR DELETE USING (true);
    
    CREATE POLICY "Enable insert access for all users on question_assets" ON public.question_assets FOR INSERT WITH CHECK (true);
    CREATE POLICY "Enable update access for all users on question_assets" ON public.question_assets FOR UPDATE USING (true);
    CREATE POLICY "Enable delete access for all users on question_assets" ON public.question_assets FOR DELETE USING (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
