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

function toText(val: any): string {
  if (typeof val === "string") return val;
  if (Array.isArray(val)) {
    return val
      .map((item) => {
        if (typeof item === "string") return item;
        if (item && typeof item === "object") {
          const subpart = item.subpart || item.part || item.question || item.number || "";
          const mark = item.mark || item.mark_code || item.marks || "";
          const criteria = item.criteria || item.answer || item.text || item.description || item.official_mark_scheme || "";
          if (mark || criteria) {
            const markStr = mark ? (String(mark).startsWith("[") ? String(mark) : `[${mark}]`) : "";
            return `${subpart ? subpart + " " : ""}${markStr ? markStr + " " : ""}${criteria}`.trim();
          }
          return Object.values(item).filter(Boolean).join(" ");
        }
        return String(item ?? "");
      })
      .filter(Boolean)
      .join("\n");
  }
  if (val && typeof val === "object") {
    return Object.entries(val)
      .map(([k, v]) => `${k}: ${typeof v === "object" ? JSON.stringify(v) : v}`)
      .join("\n");
  }
  return val != null ? String(val) : "";
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
    // === TEMPORARY PROVIDER OVERRIDE (Caimex gateway) ===
    // When CAIMEX_API_KEY is set, rubric extraction routes through the Caimex gateway
    // (OpenAI-compatible). The OPENAI_API_KEY secret stays untouched; removing the
    // CAIMEX_* secrets restores the original behavior.
    const caimexKey = Deno.env.get("CAIMEX_API_KEY");
    const providerBaseUrl = caimexKey
      ? (Deno.env.get("CAIMEX_BASE_URL") || "https://caimex.econetai.co.zw:2052/v1")
      : "https://api.openai.com/v1";
    const providerKey = caimexKey || openaiKey;
    const providerModel = caimexKey ? (Deno.env.get("CAIMEX_MODEL") || "zai-glm-5-3") : "gpt-4o";
    if (!providerKey) {
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

    // 4. Per-question rubric extraction: one dedicated call per question so the official
    // mark scheme table is preserved ROW-BY-ROW instead of being compressed into a flat,
    // lossy one-liner like "B1 for X; C1 for Y". Deterministic: temperature 0.
    const EXTRACT_MODEL = "gpt-4o";

    const extractRubricForQuestion = async (q: any): Promise<ExtractedSolution | null> => {
      const systemPrompt = `You are an expert Cambridge and ZIMSEC examination marking scheme specialist.
Extract the COMPLETE official rubric for ONE question from the marking scheme text provided.

Paper details:
- Curriculum: ${paper.curriculum}
- Subject: ${paper.subject}
- Year: ${paper.year}
- Paper Number: ${paper.paper_number}

TARGET QUESTION: Question ${q.question_number} — official total: ${q.marks || 'unknown'} marks.
Question content snippet (for matching): ${(q.content_text || "").substring(0, 300)}

THE OFFICIAL MARK SCHEME IS A TABLE with columns: Question | Answer | Marks. EACH ROW of the table is ONE marking point.

"official_mark_scheme" FORMAT (CRITICAL — one line per marking-point row, in this exact structure):
(subpart) [MARKCODE] exact criteria / allowed answer

REAL EXAMPLE (a Cambridge electricity question):
(a) [B1] sum of current(s) into junction = sum of current(s) out junction; or (algebraic) sum of current(s) at a junction is zero
(b)(i) [C1] line with negative gradient
(b)(i) [A1] line from 0 °C to 100 °C, starting at (0, R0) with negative gradient throughout and never reaching R = 0
(b)(ii) [B1] (resistance of T decreases so) total resistance (of circuit) decreases
(b)(ii) [B1] current in cell increases (so p.d. across internal resistance increases)
(c)(i) [C1] p.d. across r = 1.50 – (6.00 × 0.200) (= 0.30 V)
(c)(i) [A1] current in cell = 0.30 / 0.12 (= 2.5 A)

STRICT RULES:
1. ONE LINE PER MARKING-POINT ROW of the official table. Include EVERY row for this question — never merge or skip rows.
2. Preserve the EXACT criteria text, allowed answers, "or" alternatives, bracketed guidance, and figures from the table. Do NOT summarise, compress, or rephrase. Prose like "B1 for statement of conservation of charge; C1 for correct graph shape" is FORBIDDEN.
3. EXACT NUMBERS (CRITICAL): copy every number, unit, angle, and value EXACTLY as printed in the mark scheme. NEVER round, approximate, or reformat values — "12.5°" must stay "12.5°" (never "12°"), "6.2°" must stay "6.2°", "0.52 Ω" must stay "0.52 Ω". If a value is unclear in the extracted text, keep the closest literal form and do not invent a rounded version.
4. Keep each subpart label exactly as printed (e.g. "(a)", "(b)(i)", "(c)(ii)") followed by the mark code in square brackets, e.g. [B1], [C1], [A1], [M1].
5. The sum of the mark codes MUST equal the question's official total (${q.marks || 'see table'} marks). If a row's mark code appears multiple times, output it once per occurrence.
6. If the mark scheme also has a "Notes" or guidance column for a row, append it to that row's line after " — Guidance: ...".
7. "ai_worked_solution": a clear step-by-step full solution. "common_mistakes": pitfalls/misconceptions. "examiner_tips": key guidance.

Return ONLY raw JSON:
{ "question_number": "${q.question_number}", "official_mark_scheme": "...", "ai_worked_solution": "...", "common_mistakes": "...", "examiner_tips": "..." }`;

      console.log(`Extracting rubric for Question ${q.question_number} (${EXTRACT_MODEL})...`);
      try {
        const aiResponse = await fetch(`${providerBaseUrl}/chat/completions`, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${providerKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: providerModel,
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: `Extract the full structured rubric for Question ${q.question_number} only.\n\nHere is the full text of the Marking Scheme PDF:\n\n${trimmedMsText}` },
            ],
            response_format: { type: "json_object" },
            temperature: 0,
          }),
        });

        if (!aiResponse.ok) {
          const errText = await aiResponse.text();
          console.error(`Rubric extraction failed for Q${q.question_number}: ${aiResponse.status} ${errText.substring(0, 200)}`);
          return null;
        }

        const aiData = await aiResponse.json();
        const rawContent = aiData.choices?.[0]?.message?.content || "{}";
        const parsed = JSON.parse(rawContent);
        return {
          question_number: String(parsed.question_number || q.question_number),
          official_mark_scheme: toText(parsed.official_mark_scheme),
          ai_worked_solution: toText(parsed.ai_worked_solution),
          common_mistakes: toText(parsed.common_mistakes),
          examiner_tips: toText(parsed.examiner_tips),
        };
      } catch (qErr) {
        console.error(`Rubric extraction error for Q${q.question_number}:`, qErr);
        return null;
      }
    };

    // Parallel extraction: all questions extract CONCURRENTLY with bounded concurrency
    // (a small worker pool) so the whole paper's rubrics are extracted in ~1 wave instead
    // of one-at-a-time. Results stay indexed to their questions.
    const runPool = async (items: any[], limit: number, fn: (item: any) => Promise<ExtractedSolution | null>) => {
      const results: Array<ExtractedSolution | null> = new Array(items.length).fill(null);
      let next = 0;
      const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
        while (next < items.length) {
          const idx = next++;
          results[idx] = await fn(items[idx]);
        }
      });
      await Promise.all(workers);
      return results;
    };

    const CONCURRENCY = 4; // parallel extraction calls at a time
    const poolResults = await runPool(questions || [], CONCURRENCY, async (q) => {
      // Retry: a transient OpenAI timeout here would silently leave a question with NO
      // stored rubric, and the grading agent would then invent its own target values.
      let sol: ExtractedSolution | null = null;
      for (let attempt = 0; attempt < 3; attempt++) {
        sol = await extractRubricForQuestion(q);
        if (sol) break;
        console.warn(`Rubric extraction for Q${q.question_number} attempt ${attempt + 1}/3 failed — retrying...`);
        if (attempt < 2) await new Promise(r => setTimeout(r, 5000));
      }
      return sol;
    });
    const extractedSolutions: ExtractedSolution[] = poolResults.filter((s): s is ExtractedSolution => s !== null);

    console.log(`Extracted ${extractedSolutions.length}/${(questions || []).length} structured per-subpart rubrics from the marking scheme (${CONCURRENCY} parallel extraction calls).`);

    // 5. Match solutions to existing questions and upsert into past_paper_solutions
    const qMap = new Map<string, any>();
    for (const q of questions || []) {
      qMap.set(normalizeQNum(q.question_number), q);
      qMap.set(q.question_number, q);
    }

    let matchedCount = 0;
    const rubricDetails: Array<{ question_number: string; rubric_rows: number; rubric_marks_total: number; official_marks: number | null; marks_match: boolean }> = [];

    // Count total marks in a structured rubric by summing its [MARKCODE] tokens (B1/C1/A1/M1...)
    const countRubricMarks = (rubric: any): { rows: number; total: number } => {
      const text = toText(rubric);
      const rows = text.split("\n").filter((l: string) => /\[[A-Z]\s*\d+\s*(?:×\s*\d+)?\]/.test(l));
      let total = 0;
      for (const row of rows) {
        const marksMatch = row.match(/\[[A-Z]\s*(\d+)\s*(?:×\s*(\d+))?\]/);
        if (marksMatch) {
          const base = parseInt(marksMatch[1], 10) || 1;
          const multiplier = marksMatch[2] ? parseInt(marksMatch[2], 10) : 1;
          total += base * multiplier;
        } else {
          total += 1;
        }
      }
      return { rows: rows.length, total };
    };

    for (const sol of extractedSolutions) {
      const qNorm = normalizeQNum(sol.question_number);
      const targetQ = qMap.get(qNorm) || qMap.get(sol.question_number);

      if (!targetQ) {
        console.warn(`Could not match solution for Q${sol.question_number} to any existing question.`);
        continue;
      }

      const cleanRubric = toText(sol.official_mark_scheme);
      const cleanSolution = toText(sol.ai_worked_solution);
      const cleanMistakes = toText(sol.common_mistakes);
      const cleanTips = toText(sol.examiner_tips);

      // Verify: the rubric's marking points should sum to the question's official marks
      const rubricCount = countRubricMarks(cleanRubric);
      const officialMarks = targetQ.marks ? Number(targetQ.marks) : null;
      const marksMatch = officialMarks === null ? true : rubricCount.total === officialMarks;
      if (!marksMatch) {
        console.warn(`Rubric verification for Q${targetQ.question_number}: rubric marks total ${rubricCount.total} != official marks ${officialMarks} — extraction may be incomplete.`);
      }
      rubricDetails.push({
        question_number: String(targetQ.question_number),
        rubric_rows: rubricCount.rows,
        rubric_marks_total: rubricCount.total,
        official_marks: officialMarks,
        marks_match: marksMatch
      });

      const { error: upsertErr } = await supabaseAdmin
        .from("past_paper_solutions")
        .upsert(
          {
            question_id: targetQ.id,
            official_mark_scheme: cleanRubric,
            ai_worked_solution: cleanSolution,
            common_mistakes: cleanMistakes,
            examiner_tips: cleanTips,
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
        message: `Processed marking scheme: ${matchedCount} structured rubrics mapped and saved.`,
        solutions_extracted: extractedSolutions.length,
        solutions_saved: matchedCount,
        rubric_details: rubricDetails
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
