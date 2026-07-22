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
