-- Insert Form 1 Courses
INSERT INTO public.courses (id, title, board, level, icon, color, price, image_url, teacher_name, likes_count) VALUES
('zimsec-f1-math', 'Mathematics', 'ZIMSEC', 'Form 1', 'calculator-variant', '#208AEF', 5.00, '/covers/math.png', 'Mr. Dube', 145),
('zimsec-f1-science', 'General Science', 'ZIMSEC', 'Form 1', 'flask', '#1CA464', 5.00, '/covers/science.png', 'Mrs. Shumba', 210),
('zimsec-f1-english', 'English Language', 'ZIMSEC', 'Form 1', 'book-open-variant', '#F59E0B', 5.00, '/covers/languages.png', 'Ms. Chigara', 178),
('zimsec-f1-geography', 'Geography', 'ZIMSEC', 'Form 1', 'earth', '#10B981', 5.00, '/covers/humanities.png', 'Mr. Ndlovu', 95);

-- Insert Topics for Form 1 Courses
INSERT INTO public.topics (id, course_id, title) VALUES
('t-f1-math-1', 'zimsec-f1-math', 'Number Systems'),
('t-f1-math-2', 'zimsec-f1-math', 'Basic Algebra'),
('t-f1-sci-1', 'zimsec-f1-science', 'Introduction to Science'),
('t-f1-sci-2', 'zimsec-f1-science', 'States of Matter'),
('t-f1-eng-1', 'zimsec-f1-english', 'Parts of Speech');

-- Insert Subtopics
INSERT INTO public.subtopics (id, topic_id, title, difficulty, estimated_time, past_papers_count) VALUES
('st-f1-math-1-1', 't-f1-math-1', 'Whole Numbers & Place Value', 'Easy', '30 mins', 5),
('st-f1-math-1-2', 't-f1-math-1', 'Fractions & Decimals', 'Medium', '45 mins', 10),
('st-f1-math-2-1', 't-f1-math-2', 'Introduction to Variables', 'Medium', '40 mins', 8),
('st-f1-sci-1-1', 't-f1-sci-1', 'Laboratory Safety Rules', 'Easy', '20 mins', 2),
('st-f1-sci-1-2', 't-f1-sci-1', 'Scientific Instruments', 'Easy', '30 mins', 4),
('st-f1-sci-2-1', 't-f1-sci-2', 'Solid, Liquid, Gas', 'Easy', '45 mins', 6),
('st-f1-eng-1-1', 't-f1-eng-1', 'Nouns and Pronouns', 'Easy', '30 mins', 5),
('st-f1-eng-1-2', 't-f1-eng-1', 'Verbs and Adverbs', 'Medium', '40 mins', 7);
