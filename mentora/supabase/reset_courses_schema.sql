-- ==============================================
-- 1. CLEAN SLATE: DROP EXISTING TABLES
-- ==============================================
DROP TABLE IF EXISTS public.user_progress CASCADE;
DROP TABLE IF EXISTS public.subtopics CASCADE;
DROP TABLE IF EXISTS public.topics CASCADE;
DROP TABLE IF EXISTS public.courses CASCADE;

-- ==============================================
-- 2. RECREATE TABLES
-- ==============================================
CREATE TABLE public.courses (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  board TEXT NOT NULL,
  level TEXT NOT NULL,
  icon TEXT NOT NULL,
  color TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE public.topics (
  id TEXT PRIMARY KEY,
  course_id TEXT NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE public.subtopics (
  id TEXT PRIMARY KEY,
  topic_id TEXT NOT NULL REFERENCES public.topics(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  difficulty TEXT NOT NULL,
  estimated_time TEXT NOT NULL,
  video_url TEXT,
  notes_content TEXT,
  past_papers_count INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE public.user_progress (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  subtopic_id TEXT NOT NULL REFERENCES public.subtopics(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'Not Started', 
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  UNIQUE(user_id, subtopic_id)
);

-- ==============================================
-- 3. RE-INSERT SEED DATA
-- ==============================================
INSERT INTO public.courses (id, title, board, level, icon, color) VALUES
('zimsec-o-math', 'Mathematics', 'ZIMSEC', 'O-Level', 'calculator-variant', '#208AEF'),
('zimsec-o-science', 'Combined Science', 'ZIMSEC', 'O-Level', 'flask', '#1CA464');

INSERT INTO public.topics (id, course_id, title) VALUES
('t-algebra', 'zimsec-o-math', 'Algebra'),
('t-geometry', 'zimsec-o-math', 'Geometry'),
('t-trigonometry', 'zimsec-o-math', 'Trigonometry'),
('t-biology', 'zimsec-o-science', 'Biology Section');

INSERT INTO public.subtopics (id, topic_id, title, difficulty, estimated_time, past_papers_count) VALUES
('st-linear-eq', 't-algebra', 'Linear Equations', 'Easy', '30 mins', 12),
('st-quadratic-eq', 't-algebra', 'Quadratic Equations', 'Medium', '45 mins', 24),
('st-algebraic-fractions', 't-algebra', 'Algebraic Fractions', 'Hard', '60 mins', 18),
('st-circle-geometry', 't-geometry', 'Circle Geometry', 'Hard', '90 mins', 30),
('st-polygons', 't-geometry', 'Polygons', 'Medium', '40 mins', 15),
('st-right-angled-triangles', 't-trigonometry', 'Right-Angled Triangles (SOH CAH TOA)', 'Medium', '50 mins', 22),
('st-sine-cosine-rules', 't-trigonometry', 'Sine and Cosine Rules', 'Hard', '70 mins', 28),
('st-cells', 't-biology', 'Cell Biology', 'Easy', '40 mins', 5);

-- ==============================================
-- 4. ENABLE RLS & CACHE REFRESH
-- ==============================================
ALTER TABLE public.courses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.topics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subtopics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_progress ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read access for courses" ON public.courses FOR SELECT USING (true);
CREATE POLICY "Public read access for topics" ON public.topics FOR SELECT USING (true);
CREATE POLICY "Public read access for subtopics" ON public.subtopics FOR SELECT USING (true);

GRANT ALL ON TABLE public.courses TO anon, authenticated;
GRANT ALL ON TABLE public.topics TO anon, authenticated;
GRANT ALL ON TABLE public.subtopics TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
