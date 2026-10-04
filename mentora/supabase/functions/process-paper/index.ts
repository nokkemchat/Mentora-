import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.48.1";
import { extractText, getDocumentProxy } from "npm:unpdf";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ExtractedPart {
  label: string;
  content_text: string;
  marks?: number | null;
  sub_parts?: ExtractedPart[];
}

interface ExtractedQuestion {
  number: string;
  content_text: string;
  marks?: number | null;
  difficulty?: "Easy" | "Medium" | "Hard";
  topic?: string | null;
  subtopic?: string | null;
  skills?: string[];
  parts?: ExtractedPart[];
}

async function insertParts(
  supabase: any,
  parts: ExtractedPart[] | undefined,
  questionId: string,
  parentPartId: string | null = null
) {
  if (!parts || !Array.isArray(parts) || parts.length === 0) return;

  for (const part of parts) {
    const { data: pData, error: pError } = await supabase
      .from("question_parts")
      .insert({
        question_id: questionId,
        parent_part_id: parentPartId,
        part_label: String(part.label || "").trim(),
        content_text: part.content_text || "",
        marks: typeof part.marks === "number" ? part.marks : null,
      })
      .select("id")
      .single();

    if (pError) {
      console.error("Error inserting question part:", pError);
      continue;
    }

    if (part.sub_parts && part.sub_parts.length > 0) {
      await insertParts(supabase, part.sub_parts, questionId, pData.id);
    }
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  let paperIdGlobal: string | null = null;
  let jobIdGlobal: string | null = null;

  try {
    const { paper_id, mark_scheme_url: reqMarkSchemeUrl } = await req.json();
    if (!paper_id) {
      throw new Error("Missing paper_id");
    }
    paperIdGlobal = paper_id;

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const openaiKey = Deno.env.get("OPENAI_API_KEY");
    if (!openaiKey) {
      throw new Error("OPENAI_API_KEY is not configured in Supabase secrets");
    }

    // 1. Fetch paper details
    const { data: paper, error: paperError } = await supabaseAdmin
      .from("papers")
      .select("*")
      .eq("id", paper_id)
      .single();

    if (paperError || !paper) {
      throw new Error(`Paper not found: ${paperError?.message || ""}`);
    }

    // Resolve marking scheme URL from request, paper, or matching type='ms' record
    let markSchemeUrl = reqMarkSchemeUrl || paper.mark_scheme_url;
    if (!markSchemeUrl && paper.curriculum && paper.subject && paper.year && paper.paper_number) {
      const { data: msPaper } = await supabaseAdmin
        .from("papers")
        .select("pdf_url")
        .eq("curriculum", paper.curriculum)
        .eq("subject", paper.subject)
        .eq("year", paper.year)
        .eq("paper_number", paper.paper_number)
        .eq("type", "ms")
        .maybeSingle();

      if (msPaper?.pdf_url) {
        markSchemeUrl = msPaper.pdf_url;
      }
    }

    if (markSchemeUrl && paper.mark_scheme_url !== markSchemeUrl) {
      await supabaseAdmin
        .from("papers")
        .update({ mark_scheme_url: markSchemeUrl })
        .eq("id", paper_id);
      paper.mark_scheme_url = markSchemeUrl;
    }

    // 1b. Check if paper already has questions with visual assets extracted
    const { data: existingQuestions } = await supabaseAdmin
      .from("past_paper_questions")
      .select("id, content_images")
      .eq("paper_id", paper_id);

    const hasImages = existingQuestions && existingQuestions.some((q: any) => Array.isArray(q.content_images) && q.content_images.length > 0);
    if (hasImages) {
      console.log("Paper already has visual assets extracted. Preserving questions and assets.");

      let msResult: any = null;
      if (markSchemeUrl) {
        try {
          console.log(`Processing marking scheme for existing questions (paper ${paper_id})...`);
          const supabaseUrl = Deno.env.get("SUPABASE_URL");
          const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_ANON_KEY");
          if (supabaseUrl && serviceKey) {
            const msRes = await fetch(`${supabaseUrl}/functions/v1/process-marking-scheme`, {
              method: "POST",
              headers: {
                "Authorization": `Bearer ${serviceKey}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                paper_id,
                mark_scheme_url: markSchemeUrl,
              }),
            });
            if (msRes.ok) {
              msResult = await msRes.json();
              console.log("Marking scheme extracted successfully for existing paper:", msResult);
            } else {
              const errText = await msRes.text();
              console.warn("Marking scheme extraction failed:", msRes.status, errText);
            }
          }
        } catch (msErr) {
          console.warn("Error triggering marking scheme for existing paper:", msErr);
        }
      }

      return new Response(
        JSON.stringify({
          success: true,
          message: msResult
            ? `Paper already has questions extracted. Extracted marking scheme: ${msResult.solutions_saved || 0} solutions mapped.`
            : "Paper already has questions with visual diagrams and assets extracted.",
          questions_count: existingQuestions?.length || 0,
          marking_scheme: msResult,
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        }
      );
    }

    // 2. Check if a visual ingestion job is active or queued
    let { data: job } = await supabaseAdmin
      .from("ingestion_jobs")
      .select("id, status")
      .eq("paper_id", paper_id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    // If an ingestion agent is currently actively rendering/extracting, do not clobber it
    const { text_only } = await req.clone().json().catch(() => ({}));
    if (job && job.status === "extracting" && !text_only) {
      console.log(`Ingestion job ${job.id} is actively extracting with Mentora Content Ingestion Agent. Deferring to visual pipeline.`);
      return new Response(
        JSON.stringify({
          success: true,
          message: "Mentora Content Ingestion Agent is actively extracting questions, diagrams, and visual assets.",
          job_id: job.id,
          status: job.status,
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        }
      );
    }

    if (!job) {
      const { data: newJob } = await supabaseAdmin
        .from("ingestion_jobs")
        .insert({
          paper_id,
          mark_scheme_url: paper.mark_scheme_url || null,
          status: "processing",
        })
        .select("id, status")
        .single();
      job = newJob;
    } else {
      await supabaseAdmin
        .from("ingestion_jobs")
        .update({ status: "processing", error_details: null })
        .eq("id", job.id);
    }
    if (job) jobIdGlobal = job.id;

    // 3. Download and extract PDF text
    console.log(`Downloading PDF from ${paper.pdf_url}...`);
    const pdfResponse = await fetch(paper.pdf_url);
    if (!pdfResponse.ok) {
      throw new Error(`Failed to download PDF: ${pdfResponse.statusText}`);
    }
    const pdfBuffer = await pdfResponse.arrayBuffer();

    console.log("Extracting text from PDF...");
    const pdf = await getDocumentProxy(new Uint8Array(pdfBuffer));
    const { text: extractedText } = await extractText(pdf, { mergePages: true });

    if (!extractedText || extractedText.trim().length === 0) {
      throw new Error("No readable text found in the PDF.");
    }

    await supabaseAdmin
      .from("ingestion_jobs")
      .update({ status: "extracting" })
      .eq("id", job.id);

    // 4. Fetch syllabus topics hierarchy if available
    let syllabusHierarchy: Record<string, string[]> = {};
    try {
      let query = supabaseAdmin.from("courses").select("id, title, curriculum");
      if (paper.subject && paper.subject !== "Pending") {
        query = query.ilike("title", `%${paper.subject}%`);
      }
      const { data: matchedCourses } = await query.limit(1);
      if (matchedCourses && matchedCourses.length > 0) {
        const { data: topics } = await supabaseAdmin
          .from("topics")
          .select("id, title, subtopics(title)")
          .eq("course_id", matchedCourses[0].id);

        if (topics) {
          for (const t of topics) {
            const subList = Array.isArray(t.subtopics)
              ? t.subtopics.map((s: any) => s.title)
              : [];
            syllabusHierarchy[t.title] = subList;
          }
        }
      }
    } catch (sErr) {
      console.warn("Could not fetch syllabus hierarchy:", sErr);
    }

    let syllabusContext = "";
    if (Object.keys(syllabusHierarchy).length > 0) {
      syllabusContext = `
=== SYLLABUS TAXONOMY FOR MATCHING ===
When assigning 'topic' and 'subtopic' to each question, you MUST select from the following syllabus structure:
${JSON.stringify(syllabusHierarchy, null, 2)}
`;
    }

    // 5. Send to OpenAI for structured parsing
    const systemPrompt = `
You are an expert examination paper parser and educational content ingestion agent.
Analyze the extracted text of this examination question paper.
Extract:
1. Paper metadata:
   - curriculum: "Cambridge" or "ZIMSEC"
   - subject: subject name (e.g. Physics, Chemistry, Mathematics, Biology)
   - grade_level: e.g. "O-Level", "A-Level", "IGCSE"
   - year: integer 4-digit year
   - session: e.g. "June", "November", "March"
   - paper_number: integer (e.g. 1, 2, 3, 4)
   - variant: string (e.g. "1", "2", "41") or ""
2. Complete questions list:
   - Parse EVERY question sequentially (Question 1, Question 2, Question 3, etc.). Do not skip any question!
   - question_number: string (e.g. "1", "2", "3")
   - content_text: the main body/stem of the question.
   - marks: total marks for this question (integer) or null if not indicated.
   - difficulty: "Easy" | "Medium" | "Hard"
   - topic: matching high-level topic (from syllabus if available)
   - subtopic: matching subtopic
   - skills: array of tested skills (e.g. ["Calculation", "Data Analysis", "Recall", "Application"])
   - parts: array of sub-questions:
     - label: string (e.g. "a", "b", "c", "(i)", "(ii)")
     - content_text: question text for this part
     - marks: integer or null
     - sub_parts: recursive array of nested parts if present (e.g. sub-parts of (a) like (i), (ii))

3. NUMERICAL & SCIENTIFIC DATA FIDELITY (MANDATORY):
   - Transcribe all numbers, values, units, temperatures (e.g. "20 °C" vs "28 °C"), exponents, powers of 10, negative signs, and decimals with 100% precision.
   - Double-check digits that can be visually confused (such as 0 vs 8, 1 vs 7, 5 vs 6) against the context.
   - Never round, hallucinate, omit, or alter any numerical figures, formulas, or constants in question stems, tables, or graphs.

${syllabusContext}

Return ONLY raw valid JSON matching this schema:
{
  "metadata": {
    "curriculum": "Cambridge",
    "subject": "Physics",
    "grade_level": "O-Level",
    "year": 2023,
    "session": "November",
    "paper_number": 2,
    "variant": "1"
  },
  "questions": [
    {
      "number": "1",
      "content_text": "...",
      "marks": 10,
      "difficulty": "Medium",
      "topic": "...",
      "subtopic": "...",
      "skills": ["..."],
      "parts": [
        {
          "label": "a",
          "content_text": "...",
          "marks": 3,
          "sub_parts": []
        }
      ]
    }
  ]
}
`;

    // Limit text length if extremely long, but typically papers are well within 100k chars
    const trimmedText = extractedText.length > 120000 
      ? extractedText.substring(0, 120000) 
      : extractedText;

    console.log("Calling OpenAI for high-precision paper extraction...");
    
    // Attempt with gpt-6.1-sol or gpt-4o for maximum numerical & diagram precision
    const candidateModels = ["gpt-6.1-sol", "gpt-4o", "gpt-4o-mini"];
    let aiResponse: Response | null = null;
    let selectedModelUsed = "gpt-4o";

    for (const modelCandidate of candidateModels) {
      try {
        console.log(`Trying model: ${modelCandidate}...`);
        const resp = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${openaiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: modelCandidate,
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: `Here is the full text of the examination question paper:\n\n${trimmedText}` },
            ],
            response_format: { type: "json_object" },
            temperature: 0.0,
          }),
        });

        if (resp.ok) {
          aiResponse = resp;
          selectedModelUsed = modelCandidate;
          console.log(`Successfully completed extraction using ${modelCandidate}`);
          break;
        } else {
          const errText = await resp.text();
          console.warn(`Model ${modelCandidate} returned status ${resp.status}: ${errText.substring(0, 200)}. Trying next candidate...`);
        }
      } catch (callErr) {
        console.warn(`Call failed for ${modelCandidate}:`, callErr);
      }
    }

    if (!aiResponse) {
      throw new Error("All OpenAI model candidates failed during paper extraction.");
    }

    const aiData = await aiResponse.json();
    const rawContent = aiData.choices?.[0]?.message?.content || "{}";
    const parsed = JSON.parse(rawContent);

    const questions: ExtractedQuestion[] = Array.isArray(parsed.questions) ? parsed.questions : [];
    const metadata = parsed.metadata || {};

    if (questions.length === 0) {
      throw new Error("No questions could be extracted from this paper.");
    }

    console.log(`Successfully extracted ${questions.length} questions.`);

    // 6. Update paper metadata if current values are pending or empty
    const paperUpdate: Record<string, any> = {};
    if (metadata.curriculum && (!paper.curriculum || paper.curriculum === "Cambridge")) {
      paperUpdate.curriculum = metadata.curriculum;
    }
    if (metadata.subject && (!paper.subject || paper.subject === "Pending" || paper.subject === "Extracting...")) {
      paperUpdate.subject = metadata.subject;
    }
    if (metadata.grade_level && (!paper.grade_level || paper.grade_level === "O-Level")) {
      paperUpdate.grade_level = metadata.grade_level;
    }
    if (metadata.year && (!paper.year || paper.year === 2024)) {
      paperUpdate.year = Number(metadata.year) || paper.year;
    }
    if (metadata.session && (!paper.session || paper.session === "November")) {
      paperUpdate.session = metadata.session;
    }
    if (metadata.paper_number && (!paper.paper_number || paper.paper_number === 1)) {
      paperUpdate.paper_number = Number(metadata.paper_number) || paper.paper_number;
    }
    if (metadata.variant && !paper.variant) {
      paperUpdate.variant = String(metadata.variant);
    }

    if (Object.keys(paperUpdate).length > 0) {
      await supabaseAdmin.from("papers").update(paperUpdate).eq("id", paper_id);
    }

    // 7. Delete existing questions if any (to prevent duplicates on re-extraction)
    await supabaseAdmin
      .from("past_paper_questions")
      .delete()
      .eq("paper_id", paper_id);

    // 8. Insert new questions and their nested parts
    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];
      const qNumber = q.number || String(i + 1);

      const { data: qData, error: qError } = await supabaseAdmin
        .from("past_paper_questions")
        .insert({
          paper_id,
          question_number: qNumber,
          content_text: q.content_text || `Question ${qNumber}`,
          marks: typeof q.marks === "number" ? q.marks : null,
          difficulty: q.difficulty || "Medium",
          topic: q.topic || null,
          subtopic: q.subtopic || null,
          skills: Array.isArray(q.skills) ? q.skills : [],
        })
        .select("id")
        .single();

      if (qError) {
        console.error(`Error inserting question ${qNumber}:`, qError);
        continue;
      }

      // Insert parts
      if (q.parts && Array.isArray(q.parts) && q.parts.length > 0) {
        await insertParts(supabaseAdmin, q.parts, qData.id, null);
      }
    }

    // 9. Mark ingestion job completed
    await supabaseAdmin
      .from("ingestion_jobs")
      .update({ status: "completed" })
      .eq("id", job.id);

    // 10. If mark_scheme_url exists, trigger and await process-marking-scheme
    let markingSchemeResult: any = null;
    const finalMsUrl = markSchemeUrl || paper.mark_scheme_url;
    if (finalMsUrl) {
      try {
        console.log(`Extracting marking scheme for paper ${paper_id}...`);
        const supabaseUrl = Deno.env.get("SUPABASE_URL");
        const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_ANON_KEY");
        if (supabaseUrl && serviceKey) {
          const msResponse = await fetch(`${supabaseUrl}/functions/v1/process-marking-scheme`, {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${serviceKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              paper_id,
              mark_scheme_url: finalMsUrl,
            }),
          });
          if (msResponse.ok) {
            markingSchemeResult = await msResponse.json();
            console.log("Successfully processed marking scheme:", markingSchemeResult);
          } else {
            const msErrText = await msResponse.text();
            console.warn("process-marking-scheme returned non-ok status:", msResponse.status, msErrText);
          }
        }
      } catch (triggerErr) {
        console.warn("Could not process marking-scheme:", triggerErr);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: markingSchemeResult
          ? `Successfully extracted ${questions.length} questions and ${markingSchemeResult.solutions_saved || 0} marking scheme solutions for paper ${paper_id}`
          : `Successfully extracted ${questions.length} questions for paper ${paper_id}`,
        questions_count: questions.length,
        marking_scheme: markingSchemeResult,
        metadata: paperUpdate,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error: any) {
    console.error("Error in process-paper:", error);

    if (jobIdGlobal) {
      try {
        const supabaseAdmin = createClient(
          Deno.env.get("SUPABASE_URL") ?? "",
          Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
        );
        await supabaseAdmin
          .from("ingestion_jobs")
          .update({
            status: "failed",
            error_details: { message: error.message, stack: error.stack },
          })
          .eq("id", jobIdGlobal);
      } catch (_) {}
    }

    return new Response(
      JSON.stringify({ error: error.message || "Unknown error" }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      }
    );
  }
});
