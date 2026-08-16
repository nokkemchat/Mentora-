-- Add UPDATE policy for subtopics so teachers can save uploaded content
CREATE POLICY "Teachers can update subtopics" ON subtopics FOR UPDATE USING (true) WITH CHECK (true);
