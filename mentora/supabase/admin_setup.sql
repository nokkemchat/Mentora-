-- ==========================================
-- ADMIN SETUP SCRIPT
-- ==========================================

-- 1. Add is_approved column to profiles
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS is_approved BOOLEAN DEFAULT FALSE;

-- Automatically approve existing teachers so we don't lock them out
UPDATE public.profiles 
SET is_approved = TRUE 
WHERE role = 'teacher';

-- 2. Ensure Admin role logic exists
-- Note: Supabase auth.users doesn't natively expose custom roles to the public easily without custom claims.
-- We will just use the profile table to track the 'admin' role.
-- (The web console already checks for admin@mentora.com, but having it here is good practice).

-- You will need to sign up in the mobile app or web console with the email: admin@mentora.com
-- Once you have signed up, run this script again to ensure the profile is marked as 'admin'.
UPDATE public.profiles
SET role = 'admin', is_approved = TRUE
WHERE id IN (
  SELECT id FROM auth.users WHERE email = 'admin@mentora.com'
);

-- Refresh schema cache
NOTIFY pgrst, 'reload schema';
