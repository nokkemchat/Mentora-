import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { subject, topics = [], difficulty = "Medium", count = 10 } = await req.json();

    if (!subject) {
      return new Response(JSON.stringify({ error: "Missing subject" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      });
    }

    // Initialize Supabase
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? ""
    );

    // Build query for generating mock exam
    let query = supabaseClient
      .from("questions")
      .select("*, papers!inner(subject, curriculum)")
      .eq("papers.subject", subject)
      .limit(count);

    if (topics.length > 0) {
      query = query.in("topic", topics);
    }

    if (difficulty !== "Mixed") {
      query = query.eq("difficulty", difficulty);
    }

    const { data: questions, error } = await query;

    if (error) {
      throw error;
    }

    // In a real scenario, we might shuffle the results or use pg_stat to get random rows.
    // For now, we return the filtered list as the 'Mock Exam'

    return new Response(JSON.stringify({ 
      mock_exam_id: crypto.randomUUID(),
      questions 
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
