-- Seed videos for Form 1 courses
INSERT INTO public.subtopic_materials (subtopic_id, type, title, content_url, estimated_minutes)
SELECT 
  s.id, 
  'video', 
  'Introduction Video for ' || s.title, 
  'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4', 
  15
FROM public.subtopics s
JOIN public.topics t ON t.id = s.topic_id
JOIN public.courses c ON c.id = t.course_id
WHERE c.level = 'Form 1'
AND NOT EXISTS (
  SELECT 1 FROM public.subtopic_materials sm WHERE sm.subtopic_id = s.id AND sm.type = 'video'
);

-- Seed notes for Form 1 courses
INSERT INTO public.subtopic_materials (subtopic_id, type, title, content_url, estimated_minutes)
SELECT 
  s.id, 
  'notes_pdf', 
  'Study Notes for ' || s.title, 
  'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf', 
  10
FROM public.subtopics s
JOIN public.topics t ON t.id = s.topic_id
JOIN public.courses c ON c.id = t.course_id
WHERE c.level = 'Form 1'
AND NOT EXISTS (
  SELECT 1 FROM public.subtopic_materials sm WHERE sm.subtopic_id = s.id AND sm.type = 'notes_pdf'
);

-- Seed questions for Form 1 courses
WITH inserted_questions AS (
  INSERT INTO public.questions (id, subtopic_id, text, explanation)
  SELECT 
    gen_random_uuid(),
    s.id, 
    'What is the core concept of ' || s.title || '?', 
    'This is a fundamental concept that you just learned in the video.'
  FROM public.subtopics s
  JOIN public.topics t ON t.id = s.topic_id
  JOIN public.courses c ON c.id = t.course_id
  WHERE c.level = 'Form 1'
  AND NOT EXISTS (
    SELECT 1 FROM public.questions q WHERE q.subtopic_id = s.id
  )
  RETURNING id
)
INSERT INTO public.options (id, question_id, text, is_correct)
SELECT gen_random_uuid(), id, 'The correct answer', true FROM inserted_questions
UNION ALL
SELECT gen_random_uuid(), id, 'A wrong answer', false FROM inserted_questions
UNION ALL
SELECT gen_random_uuid(), id, 'Another wrong answer', false FROM inserted_questions;
