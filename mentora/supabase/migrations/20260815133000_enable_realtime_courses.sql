-- Enable Realtime for the courses table so the frontend progress bar receives updates
BEGIN;
  DO $$ 
  BEGIN 
    IF NOT EXISTS (
      SELECT 1 
      FROM pg_publication_tables 
      WHERE pubname = 'supabase_realtime' 
      AND tablename = 'courses'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE courses;
    END IF;
  END $$;
COMMIT;
