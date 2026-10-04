import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.48.1";
import { extractText, getDocumentProxy } from "npm:unpdf";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ExtractedSolution {
  question_number: string;
  official_mark_scheme: string;
  ai_worked_solution: string;
  common_mistakes?: string;
  examiner_tips?: string;
}

function normalizeQNum(qStr: string): string {
  if (!qStr) return "";
  return qStr
    .toLowerCase()
    .replace(/^(question|q\.?|no\.?)\s*/i, "")
    .trim();
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { paper_id, mark_scheme_url: providedMsUrl } = await req.json();
    if (!paper_id) {
      throw new Error("Missing paper_id");
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const openaiKey = Deno.env.get("OPENAI_API_KEY");
    if (!openaiKey) {
      throw new Error("OPENAI_API_KEY is not configured in Supabase secrets");
    }

    // 1. Fetch paper
    const { data: paper, error: paperErr } = await supabaseAdmin
      .from("papers")
      .select("*")
      .eq("id", paper_id)
      .single();

    if (paperErr || !paper) {
      throw new Error(`Paper not found: ${paperErr?.message || ""}`);
    }

    const markSchemeUrl = providedMsUrl || paper.mark_scheme_url;
    if (!markSchemeUrl) {
      throw new Error("No marking scheme URL found for this paper.");
    }

    // Save mark_scheme_url to paper if it wasn't saved yet
    if (providedMsUrl && paper.mark_scheme_url !== providedMsUrl) {
      await supabaseAdmin
        .from("papers")
        .update({ mark_scheme_url: providedMsUrl })
        .eq("id", paper_id);
    }

    // 2. Fetch existing questions for this paper
    const { data: questions, error: qErr } = await supabaseAdmin
      .from("past_paper_questions")
      .select("id, question_number, content_text, marks")
      .eq("paper_id", paper_id)
      .order("question_number", { ascending: true });

    if (qErr) {
      throw new Error(`Failed to load questions: ${qErr.message}`);
    }

    // Sort questions numerically (1, 2, 3... 10, 11...) so OpenAI extracts solutions in exact order
    (questions || []).sort((a: any, b: any) => {
      const matchA = String(a.question_number || "").match(/\d+/);
      const matchB = String(b.question_number || "").match(/\d+/);
      const numA = matchA ? parseInt(matchA[0], 10) : 0;
      const numB = matchB ? parseInt(matchB[0], 10) : 0;
      if (numA !== numB) return numA - numB;
      return String(a.question_number || "").localeCompare(String(b.question_number || ""), undefined, { numeric: true });
    });

    // 3. Download and extract Marking Scheme PDF text
    console.log(`Downloading marking scheme from ${markSchemeUrl}...`);
    const msResponse = await fetch(markSchemeUrl);
    if (!msResponse.ok) {
      throw new Error(`Failed to download marking scheme PDF: ${msResponse.statusText}`);
    }
    const msBuffer = await msResponse.arrayBuffer();

    console.log("Extracting text from marking scheme PDF...");
    const pdf = await getDocumentProxy(new Uint8Array(msBuffer));
    const { text: extractedMsText } = await extractText(pdf, { mergePages: true });

    if (!extractedMsText || extractedMsText.trim().length === 0) {
      throw new Error("No readable text found in marking scheme PDF.");
    }

    const trimmedMsText = extractedMsText.length > 120000
      ? extractedMsText.substring(0, 120000)
      : extractedMsText;

    // 4. Build prompt with question references
    const questionsSummary = (questions || []).map(q => ({
      id: q.id,
      question_number: q.question_number,
      marks: q.marks,
      snippet: (q.content_text || "").substring(0, 150)
    }));

    const systemPrompt = `
You are an expert Cambridge and ZIMSEC examination marking scheme specialist.
Your task is to parse an official Marking Scheme document and extract the rubrics, worked solutions, and examiner insights for each question.

Paper details:
- Curriculum: ${paper.curriculum}
- Subject: ${paper.subject}
- Year: ${paper.year}
- Paper Number: ${paper.paper_number}

Questions present in the examination paper:
${JSON.stringify(questionsSummary, null, 2)}

FOR EACH QUESTION in the paper:
1. "question_number": e.g. "1", "2", "3" (must match the question numbers in the paper).
2. "official_mark_scheme": The exact criteria, M/A/B marks, allowed answers, and scoring breakdown from the marking scheme.
3. "ai_worked_solution": A clear, step-by-step complete solution demonstrating full working and answers.
4. "common_mistakes": Pitfalls, common errors, or misconceptions noted by examiners or typical students.
5. "examiner_tips": Key guidance, essential keywords required, or time-saving exam technique.

Return ONLY raw JSON with schema:
{
  "solutions": [
    {
      "question_number": "1",
      "official_mark_scheme": "...",
      "ai_worked_solution": "...",
      "common_mistakes": "...",
      "examiner_tips": "..."
    }
  ]
}
`;

    console.log("Calling OpenAI gpt-4o-mini for marking scheme parsing...");
    const aiResponse = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${openaiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Here is the full text of the Marking Scheme PDF:\n\n${trimmedMsText}` },
        ],
        response_format: { type: "json_object" },
        temperature: 0.1,
      }),
    });

    if (!aiResponse.ok) {
      const errText = await aiResponse.text();
      throw new Error(`OpenAI API error: ${aiResponse.status} ${errText}`);
    }

    const aiData = await aiResponse.json();
    const rawContent = aiData.choices?.[0]?.message?.content || "{}";
    const parsed = JSON.parse(rawContent);

    const extractedSolutions: ExtractedSolution[] = Array.isArray(parsed.solutions)
      ? parsed.solutions
      : [];

    console.log(`Extracted ${extractedSolutions.length} solutions from marking scheme.`);

    // 5. Match solutions to existing questions and upsert into past_paper_solutions
    const qMap = new Map<string, any>();
    for (const q of questions || []) {
      qMap.set(normalizeQNum(q.question_number), q);
      qMap.set(q.question_number, q);
    }

    let matchedCount = 0;
    for (const sol of extractedSolutions) {
      const qNorm = normalizeQNum(sol.question_number);
      const targetQ = qMap.get(qNorm) || qMap.get(sol.question_number);

      if (!targetQ) {
        console.warn(`Could not match solution for Q${sol.question_number} to any existing question.`);
        continue;
      }

      const { error: upsertErr } = await supabaseAdmin
        .from("past_paper_solutions")
        .upsert(
          {
            question_id: targetQ.id,
            official_mark_scheme: sol.official_mark_scheme || "",
            ai_worked_solution: sol.ai_worked_solution || "",
            common_mistakes: sol.common_mistakes || "",
            examiner_tips: sol.examiner_tips || "",
          },
          { onConflict: "question_id" }
        );

      if (upsertErr) {
        console.error(`Error saving solution for Q${targetQ.question_number}:`, upsertErr);
      } else {
        matchedCount++;
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: `Processed marking scheme: ${matchedCount} solutions mapped and saved.`,
        solutions_extracted: extractedSolutions.length,
        solutions_saved: matchedCount,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error: any) {
    console.error("Error in process-marking-scheme:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Unknown error" }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      }
    );
  }
});
