-- Add AI Tutor State Tables

-- Create learning_sessions table
CREATE TABLE IF NOT EXISTS public.learning_sessions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL, -- references auth.users
    context_type TEXT NOT NULL CHECK (context_type IN ('paper', 'general')),
    context_id UUID, -- e.g. paper_id if context_type is paper
    chat_history JSONB DEFAULT '[]'::jsonb NOT NULL,
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'completed')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Create student_learning_profiles table
CREATE TABLE IF NOT EXISTS public.student_learning_profiles (
    user_id UUID PRIMARY KEY, -- references auth.users
    weak_topics TEXT[] DEFAULT '{}',
    strong_topics TEXT[] DEFAULT '{}',
    learning_preference TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable RLS
ALTER TABLE public.learning_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_learning_profiles ENABLE ROW LEVEL SECURITY;

-- Policies for learning_sessions
DO $$
BEGIN
    CREATE POLICY "Users can manage their own learning sessions" ON public.learning_sessions 
        FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Policies for student_learning_profiles
DO $$
BEGIN
    CREATE POLICY "Users can manage their own learning profiles" ON public.student_learning_profiles 
        FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = timezone('utc'::text, now());
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Triggers for updated_at
DO $$
BEGIN
    CREATE TRIGGER update_learning_sessions_updated_at
        BEFORE UPDATE ON public.learning_sessions
        FOR EACH ROW
        EXECUTE FUNCTION update_updated_at_column();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
    CREATE TRIGGER update_student_learning_profiles_updated_at
        BEFORE UPDATE ON public.student_learning_profiles
        FOR EACH ROW
        EXECUTE FUNCTION update_updated_at_column();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
