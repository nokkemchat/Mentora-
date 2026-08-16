-- Add Content Ingestion Pipeline tables

-- 1. Ingestion Jobs
CREATE TABLE IF NOT EXISTS public.ingestion_jobs (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    paper_id UUID NOT NULL REFERENCES public.papers(id) ON DELETE CASCADE,
    mark_scheme_url TEXT,
    status TEXT DEFAULT 'uploaded' CHECK (status IN ('uploaded', 'processing', 'extracting', 'completed', 'failed')),
    error_details JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. Add mark_scheme_id and mark_scheme_url to papers (if not existing)
ALTER TABLE public.papers ADD COLUMN IF NOT EXISTS mark_scheme_id UUID REFERENCES public.papers(id) ON DELETE SET NULL;
ALTER TABLE public.papers ADD COLUMN IF NOT EXISTS mark_scheme_url TEXT;

-- 3. Add skills to past_paper_questions
ALTER TABLE public.past_paper_questions ADD COLUMN IF NOT EXISTS skills TEXT[] DEFAULT '{}';

-- 4. Question Parts (Nested sub-questions)
CREATE TABLE IF NOT EXISTS public.question_parts (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    question_id UUID NOT NULL REFERENCES public.past_paper_questions(id) ON DELETE CASCADE,
    parent_part_id UUID REFERENCES public.question_parts(id) ON DELETE CASCADE,
    part_label TEXT NOT NULL, -- e.g., 'a', 'i', '1'
    content_text TEXT,
    marks INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 5. Question Assets (Visuals)
CREATE TABLE IF NOT EXISTS public.question_assets (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    question_id UUID REFERENCES public.past_paper_questions(id) ON DELETE CASCADE,
    part_id UUID REFERENCES public.question_parts(id) ON DELETE CASCADE,
    asset_type TEXT NOT NULL CHECK (asset_type IN ('image', 'diagram', 'graph', 'table', 'structure')),
    storage_path TEXT NOT NULL,
    ai_description TEXT,
    original_page_number INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    -- Ensure at least one is provided
    CONSTRAINT check_asset_association CHECK (question_id IS NOT NULL OR part_id IS NOT NULL)
);

-- Enable RLS
ALTER TABLE public.ingestion_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.question_parts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.question_assets ENABLE ROW LEVEL SECURITY;

-- Add RLS Policies
DO $$
BEGIN
    CREATE POLICY "Enable read access for all users on ingestion_jobs" ON public.ingestion_jobs FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
    CREATE POLICY "Enable read access for all users on question_parts" ON public.question_parts FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
    CREATE POLICY "Enable read access for all users on question_assets" ON public.question_assets FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Triggers for updated_at
CREATE OR REPLACE FUNCTION public.update_ingestion_jobs_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = timezone('utc'::text, now());
    RETURN NEW;
END;
$$ language 'plpgsql';

DO $$
BEGIN
    CREATE TRIGGER update_ingestion_jobs_updated_at
        BEFORE UPDATE ON public.ingestion_jobs
        FOR EACH ROW
        EXECUTE FUNCTION public.update_ingestion_jobs_updated_at_column();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
