ALTER TABLE public.courses ADD COLUMN IF NOT EXISTS image_url TEXT;

UPDATE public.courses SET image_url = '/covers/math.png' WHERE id = 'zimsec-o-math';
UPDATE public.courses SET image_url = '/covers/science.png' WHERE id = 'zimsec-o-science';
