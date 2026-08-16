ALTER TABLE public.topics
ADD COLUMN IF NOT EXISTS workspace_template JSONB DEFAULT '{}'::jsonb;
