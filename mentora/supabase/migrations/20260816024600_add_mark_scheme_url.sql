-- Add mark_scheme_url to papers table
ALTER TABLE public.papers ADD COLUMN IF NOT EXISTS mark_scheme_url TEXT;
