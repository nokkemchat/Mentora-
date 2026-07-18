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
