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
('q1', 'st-quadratic-eq', 'Factorise: x^2 + 5x + 6', 'We need two numbers that multiply to 6 and add to 5. Those numbers are 2 and 3.'),
('q2', 'st-circle-geometry', 'The angle subtended by an arc at the centre is...', 'A fundamental theorem of circle geometry: the angle at the centre is twice the angle at the circumference subtended by the same arc.');

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
