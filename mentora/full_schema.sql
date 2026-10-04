-- ==========================================
-- AUTHENTICATION & PROFILES SCHEMA
-- ==========================================

-- 1. Create Profiles Table
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  first_name TEXT,
  last_name TEXT,
  role TEXT DEFAULT 'student',
  school TEXT,
  grade TEXT,
  city TEXT,
  avatar_url TEXT,
  profile_completed BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. Enable Row Level Security (RLS)
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- 3. Create RLS Policies
-- Anyone can view profiles (needed for public study rooms)
CREATE POLICY "Public profiles are viewable by everyone." 
  ON public.profiles FOR SELECT 
  USING (true);

-- Users can insert their own profile
CREATE POLICY "Users can insert their own profile." 
  ON public.profiles FOR INSERT 
  WITH CHECK (auth.uid() = id);

-- Users can update their own profile
CREATE POLICY "Users can update own profile." 
  ON public.profiles FOR UPDATE 
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- 4. Create Trigger to automatically create a profile for new users
CREATE OR REPLACE FUNCTION public.handle_new_user() 
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, role, first_name, last_name, avatar_url)
  VALUES (
    new.id, 
    COALESCE(new.raw_user_meta_data->>'role', 'student'),
    new.raw_user_meta_data->>'first_name',
    new.raw_user_meta_data->>'last_name',
    new.raw_user_meta_data->>'avatar_url'
  );
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. Attach Trigger to auth.users
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();
-- 1. Create Core Content Tables

-- Courses Table
CREATE TABLE public.courses (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  board TEXT NOT NULL,
  level TEXT NOT NULL,
  icon TEXT NOT NULL,
  color TEXT NOT NULL,
  price NUMERIC(10, 2) DEFAULT 0.00,
  available_forms TEXT[] DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Topics Table
CREATE TABLE public.topics (
  id TEXT PRIMARY KEY,
  course_id TEXT NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  form TEXT DEFAULT NULL,
  order_index INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Subtopics Table
CREATE TABLE public.subtopics (
  id TEXT PRIMARY KEY,
  topic_id TEXT NOT NULL REFERENCES public.topics(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  difficulty TEXT NOT NULL, -- 'Easy' | 'Medium' | 'Hard'
  estimated_time TEXT NOT NULL,
  video_url TEXT,
  notes_content TEXT,
  past_papers_count INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- User Progress Table
-- This replaces the hardcoded "status" in our mock data.
CREATE TABLE public.user_progress (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  subtopic_id TEXT NOT NULL REFERENCES public.subtopics(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'Not Started', -- 'Not Started' | 'In Progress' | 'Mastered' | 'Needs Revision'
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  UNIQUE(user_id, subtopic_id)
);


-- 2. Seed Initial Mock Data

-- Insert Courses
INSERT INTO public.courses (id, title, board, level, icon, color, price) VALUES
('zimsec-o-math', 'Mathematics', 'ZIMSEC', 'O-Level', 'calculator-variant', '#208AEF', 15.00),
('zimsec-o-science', 'Combined Science', 'ZIMSEC', 'O-Level', 'flask', '#1CA464', 10.00);

-- Insert Topics for Mathematics
INSERT INTO public.topics (id, course_id, title) VALUES
('t-algebra', 'zimsec-o-math', 'Algebra'),
('t-geometry', 'zimsec-o-math', 'Geometry'),
('t-trigonometry', 'zimsec-o-math', 'Trigonometry');

-- Insert Subtopics for Algebra
INSERT INTO public.subtopics (id, topic_id, title, difficulty, estimated_time, past_papers_count) VALUES
('st-linear-eq', 't-algebra', 'Linear Equations', 'Easy', '30 mins', 12),
('st-quadratic-eq', 't-algebra', 'Quadratic Equations', 'Medium', '45 mins', 24),
('st-algebraic-fractions', 't-algebra', 'Algebraic Fractions', 'Hard', '60 mins', 18);

-- Insert Subtopics for Geometry
INSERT INTO public.subtopics (id, topic_id, title, difficulty, estimated_time, past_papers_count) VALUES
('st-circle-geometry', 't-geometry', 'Circle Geometry', 'Hard', '90 mins', 30),
('st-polygons', 't-geometry', 'Polygons', 'Medium', '40 mins', 15);

-- Insert Subtopics for Trigonometry
INSERT INTO public.subtopics (id, topic_id, title, difficulty, estimated_time, past_papers_count) VALUES
('st-right-angled-triangles', 't-trigonometry', 'Right-Angled Triangles (SOH CAH TOA)', 'Medium', '50 mins', 22),
('st-sine-cosine-rules', 't-trigonometry', 'Sine and Cosine Rules', 'Hard', '70 mins', 28);


-- Insert Topics for Combined Science
INSERT INTO public.topics (id, course_id, title) VALUES
('t-biology', 'zimsec-o-science', 'Biology Section');

-- Insert Subtopics for Biology Section
INSERT INTO public.subtopics (id, topic_id, title, difficulty, estimated_time, past_papers_count) VALUES
('st-cells', 't-biology', 'Cell Biology', 'Easy', '40 mins', 5);


-- 3. Set Up Row Level Security (RLS)

-- Enable RLS on all tables
ALTER TABLE public.courses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.topics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subtopics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_progress ENABLE ROW LEVEL SECURITY;

-- Courses, Topics, and Subtopics are readable by everyone
CREATE POLICY "Public read access for courses" ON public.courses FOR SELECT USING (true);
CREATE POLICY "Public read access for topics" ON public.topics FOR SELECT USING (true);
CREATE POLICY "Public read access for subtopics" ON public.subtopics FOR SELECT USING (true);

-- User Progress is strictly private to the user
CREATE POLICY "Users can only view their own progress" 
  ON public.user_progress FOR SELECT 
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own progress" 
  ON public.user_progress FOR INSERT 
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own progress" 
  ON public.user_progress FOR UPDATE 
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
-- ==========================================
-- PHASE 2: Advanced Features Schema
-- ==========================================

-- Drop existing tables if they exist (to allow re-running this script cleanly)
DROP TABLE IF EXISTS public.options CASCADE;
DROP TABLE IF EXISTS public.questions CASCADE;
DROP TABLE IF EXISTS public.study_rooms CASCADE;
DROP TABLE IF EXISTS public.career_roadmaps CASCADE;
DROP TABLE IF EXISTS public.career_required_subjects CASCADE;
DROP TABLE IF EXISTS public.careers CASCADE;
DROP TABLE IF EXISTS public.universities CASCADE;
DROP TABLE IF EXISTS public.teacher_courses CASCADE;
DROP TABLE IF EXISTS public.teacher_stats CASCADE;

-- 1. QUIZZES (Questions and Options)
CREATE TABLE public.questions (
  id TEXT PRIMARY KEY,
  subtopic_id TEXT NOT NULL REFERENCES public.subtopics(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  explanation TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE public.options (
  id TEXT PRIMARY KEY,
  question_id TEXT NOT NULL REFERENCES public.questions(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  is_correct BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Seed Quiz Data (From mockData)
INSERT INTO public.questions (id, subtopic_id, text, explanation) VALUES
('q1', 'st-quadratic-eq', 'Factorise the quadratic expression: x² + 5x + 6', 'We need two numbers that multiply to 6 and add to 5. Those numbers are 2 and 3.'),
('q2', 'st-circle-geometry', 'According to the circle theorems, the angle subtended by an arc at the centre of a circle is:', 'A fundamental theorem of circle geometry: the angle at the centre is twice the angle at the circumference subtended by the same arc.');

INSERT INTO public.options (id, question_id, text, is_correct) VALUES
('o1-1', 'q1', '(x + 2)(x + 3)', true),
('o1-2', 'q1', '(x - 2)(x - 3)', false),
('o1-3', 'q1', '(x + 1)(x + 6)', false),
('o1-4', 'q1', '(x - 1)(x - 6)', false),
('o2-1', 'q2', 'equal to the angle at the circumference.', false),
('o2-2', 'q2', 'half the angle at the circumference.', false),
('o2-3', 'q2', 'twice the angle at the circumference.', true),
('o2-4', 'q2', 'complementary to the angle at the circumference.', false);


-- 2. STUDY ROOMS
CREATE TABLE public.study_rooms (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  subject TEXT NOT NULL,
  type TEXT NOT NULL, -- 'Public' | 'School'
  participant_count INTEGER DEFAULT 0,
  max_participants INTEGER DEFAULT 50,
  is_focus_mode BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

INSERT INTO public.study_rooms (id, title, subject, type, participant_count, max_participants, is_focus_mode) VALUES
('room-1', 'O-Level Math Revision 📚', 'Mathematics', 'Public', 12, 50, false),
('room-2', 'St. Georges College Only', 'Combined Science', 'School', 4, 20, true);


-- 3. CAREERS AND UNIVERSITIES
CREATE TABLE public.careers (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  icon TEXT NOT NULL,
  color TEXT NOT NULL,
  description TEXT NOT NULL,
  expected_salary_entry INTEGER NOT NULL,
  expected_salary_senior INTEGER NOT NULL,
  demand_level TEXT NOT NULL, -- 'High' | 'Medium' | 'Low'
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE public.career_required_subjects (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  career_id TEXT NOT NULL REFERENCES public.careers(id) ON DELETE CASCADE,
  subject TEXT NOT NULL,
  level TEXT NOT NULL,
  minimum_grade TEXT NOT NULL
);

CREATE TABLE public.career_roadmaps (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  career_id TEXT NOT NULL REFERENCES public.careers(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  duration TEXT NOT NULL,
  description TEXT NOT NULL,
  step_order INTEGER NOT NULL
);

CREATE TABLE public.universities (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  location TEXT NOT NULL,
  image TEXT NOT NULL,
  top_programs TEXT[] NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Seed Careers
INSERT INTO public.careers (id, title, icon, color, description, expected_salary_entry, expected_salary_senior, demand_level) VALUES
('career-swe', 'Software Engineer', 'monitor', '#3B82F6', 'Design, develop, and maintain software systems and applications.', 35000, 120000, 'High'),
('career-med', 'Medical Doctor', 'activity', '#EF4444', 'Diagnose and treat illnesses and injuries in patients.', 45000, 180000, 'High');

INSERT INTO public.career_required_subjects (career_id, subject, level, minimum_grade) VALUES
('career-swe', 'Mathematics', 'A-Level', 'B'),
('career-swe', 'Computer Science', 'A-Level', 'C'),
('career-swe', 'Physics', 'A-Level', 'C'),
('career-med', 'Chemistry', 'A-Level', 'A'),
('career-med', 'Biology', 'A-Level', 'A'),
('career-med', 'Mathematics or Physics', 'A-Level', 'B');

INSERT INTO public.career_roadmaps (career_id, title, duration, description, step_order) VALUES
('career-swe', 'A-Levels', '2 Years', 'Focus heavily on Mathematics and Sciences.', 1),
('career-swe', 'BSc Computer Science', '3-4 Years', 'Attend university to get a formal degree in CS.', 2),
('career-swe', 'Junior Developer Role', '1-3 Years', 'Entry level position to gain industry experience.', 3),
('career-med', 'A-Levels', '2 Years', 'Achieve top grades in Chemistry and Biology.', 1),
('career-med', 'Medical School (MBChB)', '5 Years', 'Rigorous medical training at a recognized university.', 2),
('career-med', 'Housemanship', '2 Years', 'Supervised clinical training in hospitals.', 3);

-- Seed Universities
INSERT INTO public.universities (id, name, location, image, top_programs) VALUES
('uni-uz', 'University of Zimbabwe', 'Harare', 'https://images.unsplash.com/photo-1562774053-701939374585?auto=format&fit=crop&q=80&w=400', ARRAY['Medicine', 'Law', 'Engineering']),
('uni-nust', 'NUST', 'Bulawayo', 'https://images.unsplash.com/photo-1541339907198-e08756dedf3f?auto=format&fit=crop&q=80&w=400', ARRAY['Computer Science', 'Actuarial Science', 'Architecture']);


-- 4. TEACHER MARKETPLACE STATS
CREATE TABLE public.teacher_stats (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  teacher_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  total_revenue NUMERIC(10, 2) DEFAULT 0,
  pending_payout NUMERIC(10, 2) DEFAULT 0,
  total_students INTEGER DEFAULT 0,
  average_rating NUMERIC(3, 2) DEFAULT 0.0
);

CREATE TABLE public.teacher_courses (
  id TEXT PRIMARY KEY,
  teacher_stats_id UUID NOT NULL REFERENCES public.teacher_stats(id) ON DELETE CASCADE,
  course_id TEXT NOT NULL,
  title TEXT NOT NULL,
  active_students INTEGER DEFAULT 0,
  revenue_generated NUMERIC(10, 2) DEFAULT 0,
  rating NUMERIC(3, 2) DEFAULT 0.0,
  status TEXT NOT NULL -- 'Published' | 'Draft'
);

-- Note: We cannot hardcode seed teacher_stats right now because they depend on an auth.users UUID.
-- The frontend will handle creating a teacher_stat row if it doesn't exist when the user views the dashboard.


-- SET UP RLS
ALTER TABLE public.questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.options ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.study_rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.careers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.career_required_subjects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.career_roadmaps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.universities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teacher_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teacher_courses ENABLE ROW LEVEL SECURITY;

-- Public tables
CREATE POLICY "Public read access for questions" ON public.questions FOR SELECT USING (true);
CREATE POLICY "Public read access for options" ON public.options FOR SELECT USING (true);
CREATE POLICY "Public read access for study_rooms" ON public.study_rooms FOR SELECT USING (true);
CREATE POLICY "Public read access for careers" ON public.careers FOR SELECT USING (true);
CREATE POLICY "Public read access for career_required_subjects" ON public.career_required_subjects FOR SELECT USING (true);
CREATE POLICY "Public read access for career_roadmaps" ON public.career_roadmaps FOR SELECT USING (true);
CREATE POLICY "Public read access for universities" ON public.universities FOR SELECT USING (true);

-- Teacher policies
CREATE POLICY "Teachers can view their own stats" 
  ON public.teacher_stats FOR SELECT 
  USING (auth.uid() = teacher_id);

CREATE POLICY "Teachers can insert their own stats" 
  ON public.teacher_stats FOR INSERT 
  WITH CHECK (auth.uid() = teacher_id);

CREATE POLICY "Teachers can view their own courses" 
  ON public.teacher_courses FOR SELECT 
  USING (
    teacher_stats_id IN (
      SELECT id FROM public.teacher_stats WHERE teacher_id = auth.uid()
    )
  );

CREATE POLICY "Teachers can insert their own courses" 
  ON public.teacher_courses FOR INSERT 
  WITH CHECK (
    teacher_stats_id IN (
      SELECT id FROM public.teacher_stats WHERE teacher_id = auth.uid()
    )
  );
-- ==========================================
-- STUDY ROOM MESSAGES & REALTIME SCHEMA
-- ==========================================

-- 1. Create Messages Table
CREATE TABLE IF NOT EXISTS public.study_room_messages (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  room_id TEXT NOT NULL REFERENCES public.study_rooms(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. Enable Row Level Security (RLS)
ALTER TABLE public.study_room_messages ENABLE ROW LEVEL SECURITY;

-- 3. Create RLS Policies
-- Anyone can view messages (since rooms are public)
CREATE POLICY "Public messages are viewable by everyone." 
  ON public.study_room_messages FOR SELECT 
  USING (true);

-- Only authenticated users can insert messages
CREATE POLICY "Authenticated users can insert messages." 
  ON public.study_room_messages FOR INSERT 
  WITH CHECK (auth.uid() = sender_id);

-- Users can delete their own messages
CREATE POLICY "Users can delete own messages." 
  ON public.study_room_messages FOR DELETE 
  USING (auth.uid() = sender_id);

-- 4. Enable Supabase Realtime
-- Drop publication if it exists to avoid errors, then recreate
BEGIN;
  DROP PUBLICATION IF EXISTS supabase_realtime;
  CREATE PUBLICATION supabase_realtime;
COMMIT;

-- Add the messages table to the realtime publication
ALTER PUBLICATION supabase_realtime ADD TABLE public.study_room_messages;
-- Create the subtopic_materials table
CREATE TABLE public.subtopic_materials (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  subtopic_id TEXT NOT NULL REFERENCES public.subtopics(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('video', 'notes_text', 'notes_pdf', 'past_paper')),
  title TEXT NOT NULL,
  content_url TEXT,
  content_text TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable RLS
ALTER TABLE public.subtopic_materials ENABLE ROW LEVEL SECURITY;

-- Create policies for subtopic_materials
CREATE POLICY "Public read access for subtopic_materials" 
  ON public.subtopic_materials FOR SELECT 
  USING (true);

-- For now, allow authenticated users to insert/update (since there's no strict teacher role check yet, or we can use auth.uid() if needed, but for simplicity we allow authenticated users who are teachers)
CREATE POLICY "Authenticated users can insert materials" 
  ON public.subtopic_materials FOR INSERT 
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update materials" 
  ON public.subtopic_materials FOR UPDATE 
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can delete materials" 
  ON public.subtopic_materials FOR DELETE 
  TO authenticated
  USING (true);

-- Insert Storage Buckets
INSERT INTO storage.buckets (id, name, public) VALUES ('videos', 'videos', true) ON CONFLICT (id) DO NOTHING;
INSERT INTO storage.buckets (id, name, public) VALUES ('materials', 'materials', true) ON CONFLICT (id) DO NOTHING;

-- Set up storage policies for 'videos'
CREATE POLICY "Public Access videos" ON storage.objects FOR SELECT USING (bucket_id = 'videos');
CREATE POLICY "Auth Insert videos" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'videos');
CREATE POLICY "Auth Update videos" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'videos');
CREATE POLICY "Auth Delete videos" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'videos');

-- Set up storage policies for 'materials'
CREATE POLICY "Public Access materials" ON storage.objects FOR SELECT USING (bucket_id = 'materials');
CREATE POLICY "Auth Insert materials" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'materials');
CREATE POLICY "Auth Update materials" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'materials');
CREATE POLICY "Auth Delete materials" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'materials');
-- 1. Create Subscriptions Table
CREATE TABLE public.subscriptions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  course_id TEXT NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'active', -- 'active', 'expired', 'cancelled'
  expires_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  UNIQUE(user_id, course_id)
);

-- 2. Create Payments Table
CREATE TABLE public.payments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  course_id TEXT NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  amount NUMERIC(10, 2) NOT NULL,
  phone_number TEXT NOT NULL,
  paynow_reference TEXT UNIQUE NOT NULL, -- Our generated unique reference (e.g. mentora-sub-123)
  paynow_poll_url TEXT, -- URL returned by Paynow to check status manually if needed
  status TEXT NOT NULL DEFAULT 'Pending', -- 'Pending', 'Paid', 'Failed', 'Cancelled'
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 3. Set Up Row Level Security (RLS)

ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

-- Subscriptions are readable by the owner
CREATE POLICY "Users can view their own subscriptions" 
  ON public.subscriptions FOR SELECT 
  USING (auth.uid() = user_id);

-- Payments are readable by the owner
CREATE POLICY "Users can view their own payments" 
  ON public.payments FOR SELECT 
  USING (auth.uid() = user_id);

-- Users can insert their own payments (to initiate checkout)
CREATE POLICY "Users can insert their own payments" 
  ON public.payments FOR INSERT 
  WITH CHECK (auth.uid() = user_id);

-- Note: The Edge Functions will use the service_role key to update payments and insert subscriptions, which bypasses RLS automatically.
-- Enable the pgvector extension to work with embedding vectors
CREATE EXTENSION IF NOT EXISTS vector;

-- Create Papers Table
CREATE TABLE IF NOT EXISTS public.papers (
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
CREATE TABLE IF NOT EXISTS public.past_paper_questions (
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
CREATE TABLE IF NOT EXISTS public.past_paper_solutions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    question_id UUID NOT NULL REFERENCES public.past_paper_questions(id) ON DELETE CASCADE UNIQUE,
    official_mark_scheme TEXT,
    ai_worked_solution TEXT,
    common_mistakes TEXT,
    examiner_tips TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Create Student Performance Table
CREATE TABLE IF NOT EXISTS public.past_paper_performance (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL, -- Assuming references auth.users in application logic
    question_id UUID NOT NULL REFERENCES public.past_paper_questions(id) ON DELETE CASCADE,
    accuracy_score NUMERIC CHECK (accuracy_score >= 0 AND accuracy_score <= 100),
    time_spent_seconds INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Create an index for vector similarity search using HNSW
CREATE INDEX IF NOT EXISTS questions_embedding_idx ON public.past_paper_questions USING hnsw (embedding vector_cosine_ops);

-- Enable Row Level Security
ALTER TABLE public.papers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.past_paper_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.past_paper_solutions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.past_paper_performance ENABLE ROW LEVEL SECURITY;

-- Add RLS Policies
-- Papers: Anyone can read, only authenticated users (or admins) can insert/update (Simplified for now)
DO $$
BEGIN
    CREATE POLICY "Enable read access for all users" ON public.papers FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
    CREATE POLICY "Enable read access for all users" ON public.past_paper_questions FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
    CREATE POLICY "Enable read access for all users" ON public.past_paper_solutions FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Student Performance: Users can only see their own performance
DO $$
BEGIN
    CREATE POLICY "Users can insert their own performance" ON public.past_paper_performance 
        FOR INSERT WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
    
DO $$
BEGIN
    CREATE POLICY "Users can view their own performance" ON public.past_paper_performance 
        FOR SELECT USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

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
    FROM public.past_paper_questions q
    WHERE 1 - (q.embedding <=> query_embedding) > match_threshold
    ORDER BY q.embedding <=> query_embedding
    LIMIT match_count;
$$;
-- Enable full access to papers for authenticated users
-- This allows the admin console to insert, update, and delete papers

DO $$
BEGIN
    CREATE POLICY "Enable insert for authenticated users only" ON public.papers 
    FOR INSERT TO authenticated WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
    CREATE POLICY "Enable update for authenticated users only" ON public.papers 
    FOR UPDATE TO authenticated USING (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
    CREATE POLICY "Enable delete for authenticated users only" ON public.papers 
    FOR DELETE TO authenticated USING (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Create a storage bucket for past papers
INSERT INTO storage.buckets (id, name, public) 
VALUES ('past_papers', 'past_papers', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for past_papers bucket
DO $$
BEGIN
    CREATE POLICY "Public Access" ON storage.objects FOR SELECT USING (bucket_id = 'past_papers');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
    CREATE POLICY "Authenticated users can upload papers" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'past_papers');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
    CREATE POLICY "Authenticated users can update papers" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'past_papers');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
    CREATE POLICY "Authenticated users can delete papers" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'past_papers');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
CREATE POLICY "Public Access past_papers" ON storage.objects FOR SELECT USING (bucket_id = 'past_papers');
-- Enable authenticated users (such as admins) to delete courses
DO $$
BEGIN
    CREATE POLICY "Enable delete access for authenticated users" ON public.courses 
    FOR DELETE TO authenticated USING (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Enable authenticated users to update courses
DO $$
BEGIN
    CREATE POLICY "Enable update access for authenticated users" ON public.courses 
    FOR UPDATE TO authenticated USING (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Enable authenticated users to insert courses
DO $$
BEGIN
    CREATE POLICY "Enable insert access for authenticated users" ON public.courses 
    FOR INSERT TO authenticated WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Same for topics
DO $$
BEGIN
    CREATE POLICY "Enable delete access for authenticated users on topics" ON public.topics 
    FOR DELETE TO authenticated USING (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
ALTER TABLE public.papers ADD COLUMN type TEXT CHECK (type IN ('qp', 'ms')) NOT NULL DEFAULT 'qp';
-- Add teacher_name and likes_count to courses table
ALTER TABLE public.courses
ADD COLUMN teacher_name TEXT DEFAULT 'TBD',
ADD COLUMN likes_count INTEGER DEFAULT 0;

-- Update existing mock data
UPDATE public.courses
SET teacher_name = 'Mr. Ndlovu', likes_count = 1205
WHERE id = 'zimsec-o-math';

UPDATE public.courses
SET teacher_name = 'Mrs. Moyo', likes_count = 890
WHERE id = 'zimsec-o-science';
