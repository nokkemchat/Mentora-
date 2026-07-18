import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://jmyunhtqcjkvqwpdwtve.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpteXVuaHRxY2prdnF3cGR3dHZlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODMwMzU2OTMsImV4cCI6MjA5ODYxMTY5M30.2txxKAQsewgevnDj_6qfHo0-vDPkUxsggYUXiSIJTzM';
const supabase = createClient(supabaseUrl, supabaseKey);

async function test() {
  console.log("Invoking edge function...");
  const { data, error } = await supabase.functions.invoke('send-teacher-approval', {
    body: { teacher_id: "7794e219-d681-4a1f-a05e-30b200cf139c", code: "123456", name: "Test Educator" }
  });
  
  if (error) {
    console.error("Error from Edge Function:", error);
    // If it's a context error with more details:
    if (error.context) {
      const text = await error.context.text();
      console.error("Error Body:", text);
    }
  } else {
    console.log("Success:", data);
  }
}

test();
