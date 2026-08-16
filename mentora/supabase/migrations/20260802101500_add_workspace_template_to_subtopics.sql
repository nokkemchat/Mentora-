ALTER TABLE public.subtopics
ADD COLUMN IF NOT EXISTS workspace_template JSONB DEFAULT '{}'::jsonb;
