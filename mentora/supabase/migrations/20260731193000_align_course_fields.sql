-- Add missing fields to courses table to align with Admin UI
ALTER TABLE public.courses
ADD COLUMN IF NOT EXISTS syllabus_code TEXT,
ADD COLUMN IF NOT EXISTS subject_category TEXT;
