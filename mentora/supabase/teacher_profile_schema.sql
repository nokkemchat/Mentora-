-- ==========================================
-- ADD TEACHER FIELDS TO PROFILES TABLE
-- ==========================================

-- Add bio column
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS bio TEXT;

-- Add subjects_taught column (Array of strings)
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS subjects_taught TEXT[];

-- Add years_of_experience column
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS years_of_experience INTEGER;

-- Reload schema cache to ensure the API sees the new columns
NOTIFY pgrst, 'reload schema';
