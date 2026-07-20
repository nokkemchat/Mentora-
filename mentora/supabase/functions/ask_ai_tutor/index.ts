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
    const { questionId, studentMessage, chatHistory = [] } = await req.json();

    if (!questionId || !studentMessage) {
      return new Response(JSON.stringify({ error: "Missing required fields" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      });
    }

    // Initialize Supabase
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? ""
    );

    // Fetch Question and Solution context
    const { data: questionData, error: qError } = await supabaseClient
      .from("past_paper_questions")
      .select("content_text, topic, difficulty, marks, papers(subject, curriculum)")
      .eq("id", questionId)
      .single();

    if (qError || !questionData) {
      throw new Error("Question not found");
    }

    const { data: solutionData } = await supabaseClient
      .from("past_paper_solutions")
      .select("official_mark_scheme, ai_worked_solution, common_mistakes")
      .eq("question_id", questionId)
      .single();

    // Construct the System Prompt
    const systemPrompt = `
You are the Mentora AI Tutor, an expert teacher in ${questionData.papers?.subject} for ${questionData.papers?.curriculum}.
Your job is to guide the student step-by-step through solving a specific exam question.

IMPORTANT RULES:
1. NEVER hallucinate. Only use the provided question text and mark scheme.
2. DO NOT GIVE THE FINAL ANSWER IMMEDIATELY. Guide the student with hints.
3. Encourage the student and ask guiding questions.
4. If a student asks something unrelated to this topic (${questionData.topic}), politely bring them back.

---
QUESTION CONTENT:
${questionData.content_text}
(Marks: ${questionData.marks}, Difficulty: ${questionData.difficulty})

MARK SCHEME / SOLUTION:
${solutionData?.official_mark_scheme || "Not available"}
${solutionData?.ai_worked_solution || "Not available"}

COMMON MISTAKES TO WATCH OUT FOR:
${solutionData?.common_mistakes || "None noted"}
---
`;

    // Initialize OpenAI Request
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${Deno.env.get("OPENAI_API_KEY")}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4-turbo-preview", // or gpt-5.5 when available
        messages: [
          { role: "system", content: systemPrompt },
          ...chatHistory,
          { role: "user", content: studentMessage }
        ],
        temperature: 0.3, // Low temperature for factual tutoring
      }),
    });

    const openAiData = await response.json();
    const reply = openAiData.choices[0].message.content;

    return new Response(JSON.stringify({ reply }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
