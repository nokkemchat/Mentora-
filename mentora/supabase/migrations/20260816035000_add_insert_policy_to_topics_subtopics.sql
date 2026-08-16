-- Add INSERT policies for topics and subtopics so admins/teachers can duplicate course structures
CREATE POLICY "Enable insert access for authenticated users on topics" ON "public"."topics" FOR INSERT TO "authenticated" WITH CHECK (true);
CREATE POLICY "Enable insert access for authenticated users on subtopics" ON "public"."subtopics" FOR INSERT TO "authenticated" WITH CHECK (true);
