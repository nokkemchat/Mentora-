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
