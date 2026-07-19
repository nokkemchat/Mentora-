-- Enable the pgvector extension to work with embedding vectors
CREATE EXTENSION IF NOT EXISTS vector;

-- Create Papers Table
CREATE TABLE public.papers (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    curriculum TEXT NOT NULL CHECK (curriculum IN ('ZIMSEC', 'Cambridge')),
    subject TEXT NOT NULL,
    grade_level TEXT NOT NULL,
    year INTEGER NOT NULL,
    session TEXT, -- e.g., 'June', 'November'
    paper_number INTEGER NOT NULL,
    variant TEXT,
    pdf_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Create Questions Table
CREATE TABLE public.questions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    paper_id UUID NOT NULL REFERENCES public.papers(id) ON DELETE CASCADE,
    question_number TEXT NOT NULL,
    topic TEXT,
    subtopic TEXT,
    difficulty TEXT CHECK (difficulty IN ('Easy', 'Medium', 'Hard')),
    marks INTEGER,
    content_text TEXT NOT NULL,
    content_images TEXT[] DEFAULT '{}',
    embedding vector(1536), -- OpenAI text-embedding-3-small generates 1536 dimensions
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Create Solutions Table
CREATE TABLE public.solutions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    question_id UUID NOT NULL REFERENCES public.questions(id) ON DELETE CASCADE UNIQUE,
    official_mark_scheme TEXT,
    ai_worked_solution TEXT,
    common_mistakes TEXT,
    examiner_tips TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Create Student Performance Table
CREATE TABLE public.student_performance (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL, -- Assuming references auth.users in application logic
    question_id UUID NOT NULL REFERENCES public.questions(id) ON DELETE CASCADE,
    accuracy_score NUMERIC CHECK (accuracy_score >= 0 AND accuracy_score <= 100),
    time_spent_seconds INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Create an index for vector similarity search using HNSW
CREATE INDEX IF NOT EXISTS questions_embedding_idx ON public.questions USING hnsw (embedding vector_cosine_ops);

-- Enable Row Level Security
ALTER TABLE public.papers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.solutions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_performance ENABLE ROW LEVEL SECURITY;

-- Add RLS Policies
-- Papers: Anyone can read, only authenticated users (or admins) can insert/update (Simplified for now)
CREATE POLICY "Enable read access for all users" ON public.papers FOR SELECT USING (true);
CREATE POLICY "Enable read access for all users" ON public.questions FOR SELECT USING (true);
CREATE POLICY "Enable read access for all users" ON public.solutions FOR SELECT USING (true);

-- Student Performance: Users can only see their own performance
CREATE POLICY "Users can insert their own performance" ON public.student_performance 
    FOR INSERT WITH CHECK (auth.uid() = user_id);
    
CREATE POLICY "Users can view their own performance" ON public.student_performance 
    FOR SELECT USING (auth.uid() = user_id);

-- Create a Postgres Function for Semantic Search using pgvector
-- This allows Edge Functions / LangChain to call a simple RPC
CREATE OR REPLACE FUNCTION match_questions(
    query_embedding vector(1536),
    match_threshold float,
    match_count int
)
RETURNS TABLE (
    id uuid,
    question_number text,
    topic text,
    difficulty text,
    content_text text,
    similarity float
)
LANGUAGE sql
STABLE
AS $$
    SELECT
        q.id,
        q.question_number,
        q.topic,
        q.difficulty,
        q.content_text,
        1 - (q.embedding <=> query_embedding) AS similarity
    FROM public.questions q
    WHERE 1 - (q.embedding <=> query_embedding) > match_threshold
    ORDER BY q.embedding <=> query_embedding
    LIMIT match_count;
$$;
