-- 1. Add columns to subtopic_materials
ALTER TABLE public.subtopic_materials 
ADD COLUMN IF NOT EXISTS estimated_minutes INTEGER DEFAULT 10,
ADD COLUMN IF NOT EXISTS is_required BOOLEAN DEFAULT true;

-- Update existing materials with a default time
UPDATE public.subtopic_materials SET estimated_minutes = 15 WHERE type = 'video';
UPDATE public.subtopic_materials SET estimated_minutes = 10 WHERE type = 'notes_text' OR type = 'notes_pdf';
UPDATE public.subtopic_materials SET estimated_minutes = 45 WHERE type = 'past_paper';

-- 2. Add estimated_minutes to subtopics for quizzes specifically
-- Wait, the plan asked how to handle quiz times and user said "teachers should allocate time".
-- We can add estimated_quiz_minutes to subtopics since quizzes are at the subtopic level.
ALTER TABLE public.subtopics 
ADD COLUMN IF NOT EXISTS estimated_quiz_minutes INTEGER DEFAULT 15;

-- 3. Create user_material_progress
CREATE TABLE IF NOT EXISTS public.user_material_progress (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  material_id UUID NOT NULL REFERENCES public.subtopic_materials(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'completed', -- 'completed', 'in_progress'
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  UNIQUE(user_id, material_id)
);

-- Enable RLS for material progress
ALTER TABLE public.user_material_progress ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own material progress" 
  ON public.user_material_progress FOR SELECT 
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own material progress" 
  ON public.user_material_progress FOR INSERT 
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own material progress" 
  ON public.user_material_progress FOR UPDATE 
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 4. Create user_quiz_progress
CREATE TABLE IF NOT EXISTS public.user_quiz_progress (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  subtopic_id TEXT NOT NULL REFERENCES public.subtopics(id) ON DELETE CASCADE,
  score NUMERIC(5, 2),
  passed BOOLEAN DEFAULT true,
  completed_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  UNIQUE(user_id, subtopic_id)
);

-- Enable RLS for quiz progress
ALTER TABLE public.user_quiz_progress ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own quiz progress" 
  ON public.user_quiz_progress FOR SELECT 
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own quiz progress" 
  ON public.user_quiz_progress FOR INSERT 
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own quiz progress" 
  ON public.user_quiz_progress FOR UPDATE 
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
