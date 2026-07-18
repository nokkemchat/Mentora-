-- Seed dummy payouts for existing teachers or create them if needed.
DO $$
DECLARE
    teacher_chipo UUID := '5b88ab36-f0ce-4c17-8e1f-71239f60cdff';
    teacher_takunda UUID := 'd0cf4021-9d90-4886-bad8-d42f5348bbdd';
    teacher_sarah UUID := gen_random_uuid();
BEGIN
    -- Ensure existing teachers are in profiles
    INSERT INTO public.profiles (id, full_name, email, role, subjects_taught)
    VALUES 
    (teacher_chipo, 'Mrs. Chipo', 'teacher.chipo@mentora.com', 'teacher', ARRAY['Combined Science', 'Biology'])
    ON CONFLICT (id) DO UPDATE SET full_name = 'Mrs. Chipo', role = 'teacher';

    INSERT INTO public.profiles (id, full_name, email, role, subjects_taught)
    VALUES 
    (teacher_takunda, 'Mr. Takunda', 'teacher.takunda@mentora.com', 'teacher', ARRAY['Mathematics'])
    ON CONFLICT (id) DO UPDATE SET full_name = 'Mr. Takunda', role = 'teacher';

    -- Create one brand new dummy teacher for good measure
    INSERT INTO auth.users (id, instance_id, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, role, is_super_admin)
    VALUES 
    (teacher_sarah, '00000000-0000-0000-0000-000000000000', 'teacher.sarah@mentora.com', 'dummy', now(), '{"provider":"email","providers":["email"]}', '{"role":"teacher"}', now(), now(), 'authenticated', false);

    INSERT INTO public.profiles (id, full_name, email, role, subjects_taught)
    VALUES 
    (teacher_sarah, 'Dr. Sarah (History)', 'teacher.sarah@mentora.com', 'teacher', ARRAY['History']);

    -- Insert into teacher_stats
    -- Note: IF a row already exists, we can ignore or update. Let's just insert assuming they are fresh.
    INSERT INTO public.teacher_stats (teacher_id, total_revenue, pending_payout, total_students, average_rating)
    VALUES 
    (teacher_chipo, 1200.00, 350.00, 45, 4.8);

    INSERT INTO public.teacher_stats (teacher_id, total_revenue, pending_payout, total_students, average_rating)
    VALUES 
    (teacher_takunda, 850.50, 120.00, 32, 4.5);

    INSERT INTO public.teacher_stats (teacher_id, total_revenue, pending_payout, total_students, average_rating)
    VALUES 
    (teacher_sarah, 50.00, 0.00, 2, 5.0);

END $$;
