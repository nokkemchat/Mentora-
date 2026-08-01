import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Load .env
dotenv.config();

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing EXPO_PUBLIC_SUPABASE_URL or EXPO_PUBLIC_SUPABASE_ANON_KEY in .env");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function seed() {
  console.log("Starting seed script...");

  // 1. Create Teacher
  console.log("Creating Form 1 Teacher...");
  const { data: authData, error: authError } = await supabase.auth.signUp({
    email: 'form1teacher@mentora.com',
    password: 'password123',
    options: {
      data: {
        role: 'teacher',
        first_name: 'Form 1',
        last_name: 'Teacher'
      }
    }
  });

  if (authError) {
    if (authError.message.includes('already registered')) {
        console.log("Teacher already registered. Signing in...");
        await supabase.auth.signInWithPassword({
            email: 'form1teacher@mentora.com',
            password: 'password123'
        });
    } else {
        console.error("Error creating teacher:", authError);
        return;
    }
  }

  // 2. Insert Course
  console.log("Inserting Form 1 Geography Course...");
  const courseId = 'zimsec-form1-geography';
  
  // Try to delete if exists to avoid conflicts
  await supabase.from('courses').delete().eq('id', courseId);

  const { error: courseError } = await supabase.from('courses').insert({
    id: courseId,
    title: 'Geography',
    board: 'ZIMSEC',
    level: 'Form 1',
    icon: 'earth',
    color: '#F59E0B',
    price: 0,
    teacher_name: 'Form 1 Teacher',
    likes_count: 5,
    syllabus_code: '4005',
    subject_category: 'Arts'
  });

  if (courseError) {
    console.error("Error creating course:", courseError);
    return;
  }

  // 3. Insert Topic and Subtopic
  const topicId = 't-geo-mapwork';
  const subtopicId = 'st-geo-mapwork-intro';

  await supabase.from('topics').insert({
    id: topicId,
    course_id: courseId,
    title: 'Mapwork'
  });

  await supabase.from('subtopics').insert({
    id: subtopicId,
    topic_id: topicId,
    title: 'Introduction to Map Reading',
    difficulty: 'Easy',
    estimated_time: '45 mins',
    past_papers_count: 1
  });

  // 4. Insert Past Paper (into both `papers` and `subtopic_materials` if needed)
  console.log("Inserting Past Paper...");
  
  // Insert into papers table (Admin view & Student Papers view)
  const { data: paperData, error: paperError } = await supabase.from('papers').insert({
    curriculum: 'ZIMSEC',
    subject: 'Geography',
    grade_level: 'Form 1',
    year: 2023,
    session: 'November',
    paper_number: 1,
    type: 'qp'
  }).select();

  if (paperError) {
    console.error("Error creating paper:", paperError);
  } else {
    console.log("Successfully inserted past paper!", paperData);
  }

  // Insert into subtopic_materials for the course view
  await supabase.from('subtopic_materials').insert({
    subtopic_id: subtopicId,
    type: 'past_paper',
    title: 'Nov 2023 Paper 1'
  });

  console.log("Seed completed successfully!");
}

seed();
