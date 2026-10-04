-- Migration: Add multi-form support for ZIMSEC and multi-stage curricula
-- 1. Add available_forms to courses table
ALTER TABLE public.courses 
ADD COLUMN IF NOT EXISTS available_forms TEXT[] DEFAULT '{}';

-- 2. Add form and order_index to topics table
ALTER TABLE public.topics 
ADD COLUMN IF NOT EXISTS form TEXT DEFAULT NULL;

ALTER TABLE public.topics 
ADD COLUMN IF NOT EXISTS order_index INTEGER DEFAULT 0;

-- 3. Create an index on topics (course_id, form) for faster scoped queries
CREATE INDEX IF NOT EXISTS idx_topics_course_form ON public.topics (course_id, form);
