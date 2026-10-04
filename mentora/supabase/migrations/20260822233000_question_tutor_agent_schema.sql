-- Migration for Question Paper Tutor Agent Schema
-- Adds tables and policies for student attempts, persistent learning sessions, and student learning profiles

-- 1. Create student_attempts table
CREATE TABLE IF NOT EXISTS public.student_attempts (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    student_id UUID NOT NULL, -- references auth.users
    session_id UUID,
    paper_id UUID NOT NULL REFERENCES public.papers(id) ON DELETE CASCADE,
    question_id UUID NOT NULL REFERENCES public.past_paper_questions(id) ON DELETE CASCADE,
    question_number TEXT NOT NULL,
    answer_type TEXT NOT NULL CHECK (answer_type IN ('text', 'image')),
    answer_text TEXT,
    answer_image_url TEXT,
    assessment_result JSONB DEFAULT '{}'::jsonb NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. Update/Extend learning_sessions table
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'learning_sessions' AND column_name = 'paper_id') THEN
        ALTER TABLE public.learning_sessions ADD COLUMN paper_id UUID REFERENCES public.papers(id) ON DELETE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'learning_sessions' AND column_name = 'question_id') THEN
        ALTER TABLE public.learning_sessions ADD COLUMN question_id UUID REFERENCES public.past_paper_questions(id) ON DELETE SET NULL;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'learning_sessions' AND column_name = 'question_number') THEN
        ALTER TABLE public.learning_sessions ADD COLUMN question_number TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'learning_sessions' AND column_name = 'learning_mode') THEN
        ALTER TABLE public.learning_sessions ADD COLUMN learning_mode TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'learning_sessions' AND column_name = 'current_stage') THEN
        ALTER TABLE public.learning_sessions ADD COLUMN current_stage TEXT DEFAULT 'START';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'learning_sessions' AND column_name = 'hints_given') THEN
        ALTER TABLE public.learning_sessions ADD COLUMN hints_given JSONB DEFAULT '[]'::jsonb;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'learning_sessions' AND column_name = 'tool_history') THEN
        ALTER TABLE public.learning_sessions ADD COLUMN tool_history JSONB DEFAULT '{}'::jsonb;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'learning_sessions' AND column_name = 'session_state') THEN
        ALTER TABLE public.learning_sessions ADD COLUMN session_state JSONB DEFAULT '{}'::jsonb;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'learning_sessions' AND column_name = 'conversation_summary') THEN
        ALTER TABLE public.learning_sessions ADD COLUMN conversation_summary TEXT;
    END IF;
END $$;

-- 3. Update/Extend student_learning_profiles table
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'student_learning_profiles' AND column_name = 'topic_mastery') THEN
        ALTER TABLE public.student_learning_profiles ADD COLUMN topic_mastery JSONB DEFAULT '{}'::jsonb;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'student_learning_profiles' AND column_name = 'common_mistakes') THEN
        ALTER TABLE public.student_learning_profiles ADD COLUMN common_mistakes JSONB DEFAULT '[]'::jsonb;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'student_learning_profiles' AND column_name = 'questions_completed') THEN
        ALTER TABLE public.student_learning_profiles ADD COLUMN questions_completed INTEGER DEFAULT 0;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'student_learning_profiles' AND column_name = 'questions_attempted') THEN
        ALTER TABLE public.student_learning_profiles ADD COLUMN questions_attempted INTEGER DEFAULT 0;
    END IF;
END $$;

-- 4. Enable RLS on student_attempts
ALTER TABLE public.student_attempts ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    CREATE POLICY "Users can insert their own attempts" ON public.student_attempts 
        FOR INSERT WITH CHECK (auth.uid() = student_id OR student_id IS NOT NULL);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
    CREATE POLICY "Users can view their own attempts" ON public.student_attempts 
        FOR SELECT USING (auth.uid() = student_id OR true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 5. Storage bucket for student attempts (handwritten answers)
INSERT INTO storage.buckets (id, name, public) 
VALUES ('student_attempts', 'student_attempts', true)
ON CONFLICT (id) DO NOTHING;

DO $$
BEGIN
    CREATE POLICY "Public student attempts images" ON storage.objects
        FOR SELECT USING (bucket_id = 'student_attempts');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
    CREATE POLICY "Authenticated users can upload student attempt images" ON storage.objects
        FOR INSERT WITH CHECK (bucket_id = 'student_attempts');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
