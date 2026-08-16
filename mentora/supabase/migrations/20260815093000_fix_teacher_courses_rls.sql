-- Fix: Add missing UPDATE policy on teacher_stats so that upsert works
-- (INSERT existed but UPDATE did not, causing upsert to silently fail when row already exists)
CREATE POLICY "Teachers can update their own stats"
  ON public.teacher_stats FOR UPDATE
  USING (auth.uid() = teacher_id)
  WITH CHECK (auth.uid() = teacher_id);

-- Fix: Add missing UPDATE policy on teacher_courses
CREATE POLICY "Teachers can update their own courses"
  ON public.teacher_courses FOR UPDATE
  USING (
    teacher_stats_id IN (
      SELECT id FROM public.teacher_stats WHERE teacher_id = auth.uid()
    )
  )
  WITH CHECK (
    teacher_stats_id IN (
      SELECT id FROM public.teacher_stats WHERE teacher_id = auth.uid()
    )
  );
