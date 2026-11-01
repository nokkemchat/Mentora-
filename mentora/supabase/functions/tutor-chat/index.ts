import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { parseRubric, computeSubpartScore, isAlgebraicMatch } from "./rubricEngine.ts";
import { buildCriterionEvaluationPrompt, SubpartPerceptionDetails } from "./criterionEvaluation.ts";
import { buildPerceptionPrompt, QuestionPerceptionResult, ObservedSubpartWork } from "./perceptionAgent.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Build precise image editing prompt instructing GPT-Image-2.5-Sunburst to overlay teacher ink
function buildSunburstEditPrompt(
  assessment: any,
  topic: string,
  totalScore: number,
  totalMax: number,
  pageIndex?: number
): string {
  let subparts: any[] = [];
  let isMultiPage = false;
  let isFinalPage = true;
  let pageScore = totalScore;
  let pageMax = totalMax;

  if (typeof pageIndex === 'number' && assessment.pages && assessment.pages[pageIndex]) {
    const pData = assessment.pages[pageIndex];
    isMultiPage = true;
    isFinalPage = pageIndex === assessment.pages.length - 1;
    pageScore = pData.page_score ?? 0;
    pageMax = pData.page_max_score ?? 1;

    // Collect all subparts that belong to THIS SPECIFIC PAGE!
    const directlyTagged = (Array.isArray(pData.subparts) && pData.subparts.length > 0)
      ? pData.subparts
      : (assessment.subparts?.filter((sp: any) => sp.page_index === pageIndex) || []);

    subparts = directlyTagged.length > 0 ? directlyTagged : (assessment.subparts || []);
  } else {
    subparts = Array.isArray(assessment.subparts) ? assessment.subparts : [];
  }

  // Every single subpart belonging to this page must be marked!
  // Never drop, filter out, or omit any subpart!
  const partsToMark = subparts;
  const sheetMarksSum = isMultiPage ? pageScore : partsToMark.reduce((sum: number, sp: any) => sum + (Number(sp.score) || 0), 0);
  // Question-Centric Identification for Stamping
  const questionSummaries: any[] = Array.isArray(assessment.question_summaries) ? assessment.question_summaries : [];
  const pIdx = typeof pageIndex === 'number' ? pageIndex : 0;

  // Determine questions that appear on this page
  const questionsOnThisPage = questionSummaries.filter((qs: any) => {
    const pages = Array.isArray(qs.spanned_pages) ? qs.spanned_pages : [qs.start_page ?? 0];
    return pages.includes(pIdx);
  });

  // Determine questions that START on this page
  const questionsStartingHere = questionSummaries.filter((qs: any) => {
    const startPage = Math.min(...(qs.spanned_pages || [qs.start_page ?? 0]));
    return startPage === pIdx;
  });

  // Determine questions that CONTINUE onto this page from an earlier page
  const questionsContinuingHere = questionSummaries.filter((qs: any) => {
    const startPage = Math.min(...(qs.spanned_pages || [qs.start_page ?? 0]));
    return (qs.spanned_pages || []).includes(pIdx) && pIdx > startPage;
  });

  // Helper to ensure question score is mathematically consistent with the subparts on this page
  const getReconciledQScore = (qs: any) => {
    const qNum = String(qs.question_number || '1');
    let score = Number(qs.score) || 0;
    const maxScore = Number(qs.max_score) || 1;
    if (partsToMark.length > 0) {
      const partsForQ = partsToMark.filter((sp: any) => {
        const spClean = String(sp.part_label || '').toLowerCase();
        const prefixMatch = spClean.match(/^(?:question|q)?\s*(\d+)/i);
        return !prefixMatch || prefixMatch[1] === qNum;
      });
      if (partsForQ.length > 0) {
        const pageEarned = partsForQ.reduce((sum: number, sp: any) => sum + (Number(sp.score) || 0), 0);
        if (pageEarned > score) {
          score = pageEarned;
        }
      }
    }
    return { score, maxScore };
  };

  // Build the prominent teacher stamps for this page:
  const questionStamps: string[] = [];
  if (questionsStartingHere.length > 0) {
    questionsStartingHere.forEach((qs: any) => {
      const { score, maxScore } = getReconciledQScore(qs);
      questionStamps.push(`Question ${qs.question_number} Total: ${score}/${maxScore}`);
    });
  } else if (questionsOnThisPage.length > 0) {
    questionsOnThisPage.forEach((qs: any) => {
      const { score, maxScore } = getReconciledQScore(qs);
      questionStamps.push(`Question ${qs.question_number} Total: ${score}/${maxScore}`);
    });
  } else if (!isMultiPage || questionSummaries.length === 0) {
    const qNum = assessment.identified_question_number || '1';
    const computedSum = partsToMark.reduce((sum: number, sp: any) => sum + (Number(sp.score) || 0), 0);
    const scoreToUse = Math.max(totalScore, computedSum);
    questionStamps.push(`Question ${qNum} Total: ${scoreToUse}/${totalMax}`);
  }

  const continuationStamps: string[] = [];
  questionsContinuingHere.forEach((qs: any) => {
    const startPage = Math.min(...(qs.spanned_pages || [0]));
    continuationStamps.push(`Question ${qs.question_number} (Cont. from Page ${startPage + 1})`);
  });

  // Format bottomStamp: NEVER drop the question total!
  // If this is the final page of a multi-page booklet, include BOTH the question total and the booklet grand total!
  let bottomStamp = "";
  const baseQuestionStamp = questionStamps.length > 0 ? questionStamps.join(' | ') : `Score: ${pageScore}/${pageMax}`;
  if (isFinalPage && isMultiPage) {
    bottomStamp = `${baseQuestionStamp} | Booklet Total: ${totalScore}/${totalMax}`;
  } else {
    bottomStamp = baseQuestionStamp;
  }

  const formattedInstructions = partsToMark.map((sp: any, idx: number) => {
    const label = sp.part_label || `(${idx + 1})`;
    const loc = sp.exact_location || `Ruled line area for Part ${label}`;
    const detected = sp.student_answer_detected ? ` (Student wrote: "${sp.student_answer_detected.substring(0, 80)}")` : '';
    const score = Number(sp.score) || 0;
    const maxScore = Number(sp.max_score) || 1;

    const markingPoints: any[] = Array.isArray(sp.marking_points) ? sp.marking_points : [];
    const constructiveCorrection = sp.constructive_correction || sp.teacher_correction_note || sp.teacher_correction || (sp.deductions && sp.deductions[0]) || '';

    let section = `${idx + 1}. Part ${label} [${loc}]${detected}:\n`;

    // 1. INLINE POINT-BY-POINT TICKS (Put a tick at EACH and EVERY valid point)
    if (markingPoints.length > 0) {
      section += `   - IN-SITU POINT-BY-POINT TICKS (CRITICAL: DO NOT JUST PUT TICKS AT FAR MARGIN END!):\n`;
      let earnedCount = 0;
      markingPoints.forEach((pt: any, ptIdx: number) => {
        if (pt.is_earned || pt.tick_or_cross === 'tick') {
          earnedCount++;
          const phrase = pt.student_phrase ? ` over/beside "${pt.student_phrase}"` : '';
          const pos = pt.inline_location ? ` at ${pt.inline_location}` : '';
          section += `     * Point ${earnedCount} (${pt.mark_code || 'Point'}: ${pt.criterion || 'Earned mark'}): Draw a neat, small red ballpoint pen tick "✓"${phrase}${pos}.\n`;
        }
      });
      if (earnedCount === 0 && score > 0) {
        section += `     * Draw ${score} small red ballpoint ticks "✓" directly beside the correct key phrases/values in the student's text.\n`;
      }
    } else if (score > 0) {
      section += `   - IN-SITU POINT-BY-POINT TICKS (CRITICAL: DO NOT JUST PUT TICKS AT FAR MARGIN END!):\n`;
      section += `     * Place a small, distinct red ballpoint pen tick "✓" directly above or beside EACH correct keyword, formula, step, numerical value, or unit in the student's handwritten response (award ${score} separate ticks for ${score} earned marks).\n`;
    }

    // 2. CONSTRUCTIVE CORRECTIONS FOR MISSED POINTS (HOW IT SHOULD HAVE BEEN DONE)
    if (score < maxScore) {
      section += `   - CONSTRUCTIVE CORRECTION ON HOW TO ANSWER (CRITICAL - DO NOT BE GENERIC!):\n`;
      const missedPoints = markingPoints.filter((pt: any) => !pt.is_earned);
      if (missedPoints.length > 0) {
        missedPoints.forEach((mp: any) => {
          const correction = mp.constructive_correction || constructiveCorrection;
          const phrase = mp.student_phrase ? ` Underline "${mp.student_phrase}" in thin red pen (NEVER strike through valid equations or numbers).` : ' Where this step was missed, draw an insertion caret "^".';
          section += `     * Error/Omission (${mp.mark_code || 'Mark'}: ${mp.criterion || 'Missed criteria'}):${phrase} Write neatly in small red handwriting directly underneath/beside it: "${correction}".\n`;
        });
      } else if (constructiveCorrection) {
        section += `     * Underline the specific incorrect phrase in thin red ink and write directly underneath it in neat, legible red handwriting: "${constructiveCorrection}". Show the student clearly how it should have been done or answered!\n`;
      }
    }

    // 3. RIGHT MARGIN SUB-TOTAL
    if (score > 0) {
      section += `   - RIGHT MARGIN SUB-TOTAL: In the right-hand margin directly level with this answer line, write the red pen fraction "✓ (${score}/${maxScore})".\n`;
    } else {
      section += `   - RIGHT MARGIN SUB-TOTAL: In the right-hand margin directly level with this answer line, write a red pen cross "✕ (0/${maxScore})".\n`;
    }

    return section;
  }).join('\n\n');

  const mathematicalBreakdown = partsToMark.map((sp: any) => {
    const score = Number(sp.score) || 0;
    const maxScore = Number(sp.max_score) || 1;
    const symbol = score > 0 ? '✓' : '✕';
    return `- Part ${sp.part_label}: ${symbol} (${score}/${maxScore}) [Awards: ${score} marks]`;
  }).join('\n');

  return `Generate the marked exam sheet photo by editing the supplied student answer image with authentic red ink teacher markings.
CRITICAL EDITING RULES:
1. PRESERVE ORIGINAL: Keep the student's page, ruled lines, lighting, and blue/black handwriting 100% intact. Do NOT redraw, erase, or alter their work.
2. POINT-BY-POINT INLINE MARKING: Place a small, sharp red ballpoint pen tick (✓) at EACH and EVERY valid point, correct phrase, formula, value, or unit in the student's text — DO NOT just put ticks at the far right end!
3. CONSTRUCTIVE CORRECTIONS ON HOW TO ANSWER: Whenever a student misses a mark, loses credit, or omits a required point, write a constructive red-ink correction note showing EXACTLY how it should have been done or answered (e.g. underline the flawed part with a neat red line and write the correct term, explanation, or step right beside/under it, or draw an insertion caret '^' for missing steps).
   ABSOLUTE PROHIBITION ON STRIKING OUT CORRECT FORMULAS OR WORKING: NEVER draw strike-through lines over formulas like Q = mcΔT, or numerical calculations. Only underline the specific error in neat red pen.
4. RIGHT MARGIN SUBPART TOTALS: Write the subpart mark fraction in the right margin (e.g. "✓ (2/2)", "✓ (1/2)", "✕ (0/1)").
5. QUESTION-CENTRIC MARKS & QUESTION TOTAL STAMP:
   - MANDATORY QUESTION TOTAL: Students MUST know the total number of marks they get per question. Stamp the Question Total prominently: "${bottomStamp}".
   - NEVER omit or forget the Question Total stamp for any question answered on this page!
   - Do NOT write confusing page subtotals like "Page X Subtotal".
   - Continuation badge: ${continuationStamps.length > 0 ? `At top header area write: "${continuationStamps.join(' | ')}".` : 'None.'}

MATHEMATICAL MARK VERIFICATION (EVERY MARK IN THE MARGIN MUST ADD UP EXACTLY):
${mathematicalBreakdown}
-> Total marks marked on this page: ${sheetMarksSum} marks.
-> Prominent badge/stamp: "${bottomStamp}".

EXACT MARKING & POSITIONING INSTRUCTIONS:
${formattedInstructions}

CRITICAL RULES FOR TEACHER PEN MARKS:
1. CHECKMARK (✓) VS CROSS (✕):
   - Write small, clear annotations placed next to or neatly beneath the relevant error.
   - Avoid covering, crossing out, or obscuring the student's original handwriting or diagrams.
2. NUMBERS MUST MATCH:
   - Each fraction in the right margin MUST match the exact score and max marks specified above.
   - The marks marked in the margin MUST mathematically sum up to ${sheetMarksSum}.
3. MANDATORY QUESTION TOTAL STAMP:
   - At the bottom right corner (or designated score box or beside the question header), write the teacher's mark in bold red ballpoint pen: "${bottomStamp}". Every question must have its total clearly displayed.

Call the image_generation tool now to generate the authentic red ink marked exam photo.`;
}

function uint8ArrayToBase64(bytes: Uint8Array): string {
  let binary = "";
  const len = bytes.byteLength;
  const chunkSize = 8192;
  for (let i = 0; i < len; i += chunkSize) {
    const chunk = bytes.subarray(i, Math.min(i + chunkSize, len));
    binary += String.fromCharCode.apply(null, chunk as any);
  }
  return btoa(binary);
}

// Execute image editing using OpenAI Responses API + gpt-image-2.5-sunburst image_generation tool
async function editImageWithSunburst(
  originalImageInput: string,
  editPrompt: string,
  apiKey: string
): Promise<string | null> {
  const model = Deno.env.get("IMAGE_EDIT_MODEL") || "gpt-image-2.5-sunburst";
  const responsesUrl = "https://api.openai.com/v1/responses";

  let finalImageUri = originalImageInput;

  // If remote URL, fetch and convert to base64 data URI to avoid OpenAI upstream download issues
  if (originalImageInput.startsWith("http://") || originalImageInput.startsWith("https://")) {
    try {
      const resp = await fetch(originalImageInput);
      if (resp.ok) {
        const mime = resp.headers.get("content-type") || "image/jpeg";
        const buf = await resp.arrayBuffer();
        const b64 = uint8ArrayToBase64(new Uint8Array(buf));
        finalImageUri = `data:${mime};base64,${b64}`;
      }
    } catch (fetchErr) {
      console.warn("Could not pre-fetch remote image for base64 conversion:", fetchErr);
    }
  }

  const imageContent = { type: "input_image", image_url: finalImageUri };

  try {
    const reqBody: any = {
      model: "gpt-4.1",
      instructions: "You are an automated visual exam marking agent. You must ALWAYS invoke the image_generation tool to edit the supplied student exam sheet photo by overlaying authentic red ballpoint teacher markings, ticks, crosses, margin marks, and constructive handwritten corrections directly onto the student sheet. Never respond with text only, and never apologize.",
      input: [
        {
          role: "user",
          content: [
            { type: "input_text", text: editPrompt },
            imageContent,
          ],
        },
      ],
      tools: [
        {
          type: "image_generation",
          model: model,
          action: "edit",
          quality: "medium",
          size: "1024x1792", // Full portrait A4 height for handwritten exam papers
        },
      ],
      tool_choice: { type: "image_generation" },
    };

    let attempts = 0;
    const maxAttempts = 3;
    let res: Response | null = null;

    while (attempts < maxAttempts) {
      attempts++;
      res = await fetch(responsesUrl, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(reqBody),
      });

      // If 400 Bad Request, fall back size or remove action
      if (!res.ok && res.status === 400) {
        if (reqBody.tools[0]?.size !== "1024x1024") {
          reqBody.tools[0].size = "1024x1024";
          continue;
        }
        if (reqBody.tools[0]?.action) {
          delete reqBody.tools[0].action;
          continue;
        }
      }

      // If 429 Rate Limit or 5xx server error, backoff and retry!
      if (!res.ok && (res.status === 429 || res.status >= 500) && attempts < maxAttempts) {
        const waitMs = attempts * 1200;
        console.warn(`editImageWithSunburst: status ${res.status}. Backing off ${waitMs}ms before retry ${attempts + 1}/${maxAttempts}...`);
        await new Promise((resolve) => setTimeout(resolve, waitMs));
        continue;
      }

      break;
    }

    if (!res || !res.ok) {
      const errText = res ? await res.text() : "No response";
      console.error("editImageWithSunburst: OpenAI Responses API returned", res?.status, "model:", model, "error:", errText.substring(0, 500));
      return `ERROR: ${res?.status} - ${errText}`;
    }

    const data = await res.json();

    // Extract image_generation_call output
    const imageOutputs = (data.output || []).filter(
      (o: any) => o.type === "image_generation_call"
    );

    if (imageOutputs.length > 0) {
      const b64 = imageOutputs[0].result;
      if (b64) {
        return `data:image/png;base64,${b64}`;
      }
    }

    const outputTypes = JSON.stringify(data.output?.map((o: any) => o.type));
    const msgContent = data.output?.find((o: any) => o.type === "message")?.content || "";
    console.warn("editImageWithSunburst: no image_generation_call in response output", outputTypes, JSON.stringify(msgContent));
    return `ERROR: no image_generation_call output. Message: ${JSON.stringify(msgContent)}`;
  } catch (err: any) {
    console.warn("editImageWithSunburst Responses API error:", err);
    return `ERROR: exception ${err?.message || err}`;
  }
}

// Resilient OpenAI Chat Completion caller with model fallback chain (e.g. gpt-6-luna -> gpt-4o-mini / gpt-4o)
// === TEMPORARY PROVIDER OVERRIDE (Caimex gateway) ===
// When the CAIMEX_API_KEY secret is set, all OpenAI-compatible chat calls route through
// the Caimex gateway with CAIMEX_MODEL — the existing OPENAI_API_KEY secret is untouched,
// and removing the CAIMEX_* secrets restores the original OpenAI behavior exactly.
function providerConfig(): { baseUrl: string; apiKey: string; model?: string } {
  const caimexKey = Deno.env.get("CAIMEX_API_KEY");
  if (caimexKey) {
    return {
      baseUrl: Deno.env.get("CAIMEX_BASE_URL") || "https://caimex.econetai.co.zw:2052/v1",
      apiKey: caimexKey,
      model: Deno.env.get("CAIMEX_MODEL") || undefined,
    };
  }
  return { baseUrl: "https://api.openai.com/v1", apiKey: "" };
}

function remapModelForProvider(m: string): string {
  const cfg = providerConfig();
  if (cfg.model) return cfg.model; // single-model gateway override
  return m;
}

// Extract the rubric rows belonging to ONE subpart from the stored mark scheme —
// used by the per-subpart focused grading agent. Lines are "(label) [MARKCODE] criteria"
// or "(label) [LEVEL] ..." — we match the subpart label prefix.
function extractSubpartRubricRows(officialMarkScheme: string | null, subpartLabel: string): string[] {
  if (!officialMarkScheme) return [];
  const clean = String(subpartLabel).toLowerCase().replace(/[^a-z0-9]/g, '');
  const rows: string[] = [];
  for (const line of officialMarkScheme.split('\n')) {
    const t = line.trim();
    if (!t) continue;
    const m = t.match(/^\(?([a-z](?:\(\s*[ivx0-9]+\s*\))?)\)?\s+(.+)/i);
    if (!m) continue;
    const lineLabel = m[1].toLowerCase().replace(/[^a-z0-9]/g, '');
    // Exact match, or the line is a nested subpart of this label (e.g. 'a.i' under 'a')
    if (lineLabel === clean || lineLabel.startsWith(clean)) {
      rows.push(t);
    }
  }
  return rows;
}

// Compute a subpart's printed marks-available from the rubric: the maximum bracketed
// number in its rows (e.g. "(a) [4]" → 4; level-table ranges "4–5" → 5), or null.
function subpartMarksFromRubric(officialMarkScheme: string | null, subpartLabel: string): number | null {
  const rows = extractSubpartRubricRows(officialMarkScheme, subpartLabel);
  let best: number | null = null;
  for (const row of rows) {
    const m = row.match(/(\d{1,2})\s*(?:marks?|\])?\s*$/i);
    if (m) {
      const v = parseInt(m[1], 10);
      if (Number.isFinite(v) && v > 0 && (best === null || v > best)) best = v;
    }
  }
  return best;
}

// Build the focused grading prompt for ONE subpart (the per-subpart marking agent).
function buildSubpartGradingPrompt(
  qNum: string,
  subpartLabel: string,
  rows: string[],
  marksAvailable: number | null
): string {
  return `You are the Mentora Senior Chief Examiner marking ONE SUBPART of Question ${qNum} of the target paper.

TARGET SUBPART: (${subpartLabel}) — marks available: ${marksAvailable ?? 'as printed in the scheme'}.
OFFICIAL RUBRIC ROWS FOR THIS SUBPART (the menu of awardable points / level descriptors):
${rows.join('\n')}

YOUR ONLY JOB:
1. Read the student's handwritten answer to THIS subpart (${subpartLabel}) on the provided page image(s).
2. Award ONE MARK PER DISTINCT VALID POINT the student wrote that matches any rubric row (or a permitted alternative the scheme allows). The rows are a MENU — EACH row the student satisfies earns its mark.
3. SCAN THE ENTIRE ANSWER for this subpart — never stop after the first matching point. A student who wrote 3 valid points for a 4-mark part scores 3.
4. LEVEL TABLES: if the rows are level descriptors (Level 1–5 with mark ranges), find the highest level the student's explanation genuinely reaches and award within that level's range.
5. max_score MUST be the printed marks available (${marksAvailable ?? 'per the scheme'}) — NEVER 1 unless the scheme genuinely prints 1.
6. Relevance still applies: only credit points that genuinely answer THIS subpart of Question ${qNum}.

Return ONLY raw JSON:
{
  "part_label": "(${subpartLabel})",
  "score": number,
  "max_score": ${marksAvailable ?? 'number'},
  "student_answer_detected": "string — brief summary of what the student wrote",
  "marking_points": [
    { "point_number": 1, "criterion": "the rubric row / level awarded", "is_earned": boolean, "mark_code": "string", "student_phrase": "the student's exact words that earned this mark", "flawed_phrase": "" }
  ],
  "teacher_correction_note": "string (empty if full marks)",
  "overall_feedback": "string"
}`;
}

async function executeChatCompletion(
  apiKey: string,
  modelCandidates: string[],
  bodyPayload: any
): Promise<{ ok: boolean; data: any; modelUsed: string; error?: string }> {
  const provider = providerConfig();
  // When the Caimex override is active, use the gateway's key/model; otherwise the
  // passed-in OpenAI key and the original model candidates apply.
  const effectiveApiKey = provider.model ? provider.apiKey : apiKey;
  let lastErr = "";
  for (const candidate of modelCandidates) {
    const m = remapModelForProvider(candidate);
    try {
      const requestPayload: any = {
        ...bodyPayload,
        model: m,
      };
      // Ensure deterministic results across all evaluations and batch marking runs
      if (requestPayload.seed === undefined) {
        requestPayload.seed = 42;
      }

      // Reasoning models (o1, o3, o4) and GPT-6 models (gpt-6-luna, gpt-6.1-sol) reject custom temperature (e.g. 0.1).
      // They only accept default (1) or omitting the field.
      if (m.startsWith("gpt-6") || m.startsWith("o1") || m.startsWith("o3") || m.startsWith("o4")) {
        delete requestPayload.temperature;
      } else {
        // Enforce deterministic 0.0 temperature for all vision/evaluation models
        requestPayload.temperature = 0.0;
      }

      console.log(`executeChatCompletion: attempting with model candidate ${m}...`);
      const resp = await fetch(`${provider.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${effectiveApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestPayload),
      });

      if (resp.ok) {
        const data = await resp.json();
        console.log(`executeChatCompletion: success with model ${m}`);
        return { ok: true, data, modelUsed: m };
      } else {
        const errText = await resp.text();
        lastErr = `OpenAI API returned ${resp.status} for model ${m}: ${errText.substring(0, 300)}`;
        console.warn(`Model ${m} returned ${resp.status}: ${errText.substring(0, 150)}. Trying fallback candidate...`);
      }
    } catch (e: any) {
      lastErr = `Fetch error with model ${m}: ${e?.message || e}`;
      console.warn(`Fetch error for model ${m}:`, e);
    }
  }
  return { ok: false, data: null, modelUsed: modelCandidates[modelCandidates.length - 1], error: lastErr };
}

// Tool function: Retrieve official question mark scheme strictly for the target paper
async function getQuestionMarkScheme(
  supabaseClient: any,
  paperId: string | null,
  qNum: string,
  context?: any,
  fallbackScheme?: string
): Promise<{
  found: boolean;
  question_number: string;
  topic: string;
  marks: number;
  content_text: string;
  official_mark_scheme: string | null;
}> {
  const cleanQNum = String(qNum || '1').replace(/^Q(?:uestion)?\s*/i, '').trim();

  // 1. Check database if paperId provided - strictly bound to the target paperId
  if (paperId && supabaseClient) {
    try {
      const { data: qData, error: qErr } = await supabaseClient
        .from("past_paper_questions")
        .select("id, question_number, marks, content_text, topic")
        .eq("paper_id", paperId)
        .eq("question_number", cleanQNum)
        .maybeSingle();

      // NEVER swallow DB errors: a failed lookup must be loud, otherwise the grader
      // silently loses the official mark scheme and invents its own rubric/marks.
      if (qErr) {
        console.error(`getQuestionMarkScheme: DB error fetching question ${cleanQNum} for paper ${paperId}:`, qErr);
      }

      if (!qErr && qData) {
        const { data: solData, error: solErr } = await supabaseClient
          .from("past_paper_solutions")
          .select("official_mark_scheme, examiner_tips, ai_worked_solution")
          .eq("question_id", qData.id)
          .maybeSingle();

        if (solErr) {
          console.error(`getQuestionMarkScheme: DB error fetching solution for question ${cleanQNum}:`, solErr);
        }

        const officialScheme = solData?.official_mark_scheme || null;

        if (officialScheme) {
          return {
            found: true,
            question_number: cleanQNum,
            topic: qData.topic || context?.topic || "Science Examination",
            marks: qData.marks || 9,
            content_text: qData.content_text || "",
            official_mark_scheme: officialScheme,
          };
        }

        // Question exists in the target paper but has no stored official mark scheme.
        // Return the target paper's own question content so grading stays bound to THIS paper
        // (never falls back to question text printed on the student's uploaded sheet,
        // which may belong to a completely different paper).
        return {
          found: true,
          question_number: cleanQNum,
          topic: qData.topic || context?.topic || "Science Examination",
          marks: qData.marks || 9,
          content_text: qData.content_text || context?.questionText || "",
          official_mark_scheme: null,
        };
      } else if (!qErr) {
        // Question cleanQNum does NOT exist in the paper being marked!
        // Return found: false with NO official mark scheme so it is never marked against another paper.
        return {
          found: false,
          question_number: cleanQNum,
          topic: context?.topic || "Exam Question",
          marks: context?.maxMarks || 9,
          content_text: "",
          official_mark_scheme: null,
        };
      }
      // On qErr: fall through to the fallbacks below rather than pretending the question exists.
    } catch (e) {
      console.error("getQuestionMarkScheme DB error:", e);
    }
  }

  // 2. Fallback to passed-in mark_scheme ONLY if no paperId was provided (standalone mode)
  if (!paperId && fallbackScheme && fallbackScheme.trim().length > 10) {
    return {
      found: true,
      question_number: cleanQNum,
      topic: context?.topic || "Exam Question",
      marks: context?.maxMarks || 9,
      content_text: context?.questionText || "",
      official_mark_scheme: fallbackScheme.trim(),
    };
  }

  return {
    found: false,
    question_number: cleanQNum,
    topic: context?.topic || "Exam Question",
    marks: context?.maxMarks || 9,
    content_text: context?.questionText || "",
    official_mark_scheme: null,
  };
}

// Helper to extract official subparts from question stem or mark scheme
function extractQuestionSubparts(
  contentText: string,
  markScheme?: string | null
): Array<{ label: string; marks: number; criteria?: string }> {
  const source = (markScheme && markScheme.trim().length > 25) ? markScheme : (contentText || '');
  const regex = /(?:^|\n|\s|\b)(\d*\s*(?:\([a-z0-9]+\))+)\s*([\s\S]*?)(?=(?:\n|\s|\b)(?:\d*\s*(?:\([a-z0-9]+\))+)|$)/gi;
  const map = new Map<string, { marks: number; criteria: string }>();
  let m: RegExpExecArray | null;

  while ((m = regex.exec(source)) !== null) {
    const rawLabel = m[1].replace(/^\d+\s*/, '').trim().toLowerCase();
    const body = m[2].trim();
    if (!rawLabel.startsWith('(')) continue;

    const bracketMatch = body.match(/\[(\d+)\]/) || body.match(/(?:\[|\()(\d+)\s*(?:marks?|m)(?:\]|\)|\b)/i);
    const marks = bracketMatch ? parseInt(bracketMatch[1], 10) : 1;

    if (!map.has(rawLabel)) {
      map.set(rawLabel, { marks: Math.max(1, marks), criteria: body.substring(0, 150) });
    }
  }

  const list: Array<{ label: string; marks: number; criteria?: string }> = [];
  map.forEach((val, label) => {
    list.push({ label, marks: val.marks, criteria: val.criteria });
  });
  return list;
}

// Extract canonical identity key for subparts (e.g. "(a)(i)" -> "a.i", "(b)(i)" -> "b.i", "(b)(ii)" -> "b.ii", "(a)" -> "a")
// to prevent double-counting marks when students write multiple attempts across pages,
// while strictly preserving distinct subparts like (a)(i) and (b)(i).
function getCanonicalSubpartKey(label: string): string {
  if (!label) return 'default';
  let clean = String(label).toLowerCase().trim();

  // Strip leading question number prefixes like "6(a)(i)", "Q6 (a)", "Question 6(b)(i)", "6.1"
  clean = clean.replace(/^(?:question|q)?\s*\d+[\s.:-]*\s*/i, '').trim();
  clean = clean.replace(/^part\s+/i, '').trim();

  // 1. Extract letter component (e.g. 'a', 'b', 'c', 'd', 'e', 'f', 'g', 'h')
  const letterMatch = clean.match(/(?:\((?:part\s*)?([a-h])\)|\b([a-h])(?=[\s.)(]|$))/i);
  const letter = letterMatch ? (letterMatch[1] || letterMatch[2]).toLowerCase() : null;

  // 2. Extract roman numeral component (e.g. 'i', 'ii', 'iii', 'iv', 'v', 'vi', 'vii', 'viii', 'ix', 'x')
  const romanMatch = clean.match(/(?:\((viii|vii|vi|iv|v|ix|x|iii|ii|i)\)|\b(viii|vii|vi|iv|v|ix|x|iii|ii|i)\b)/i);
  const roman = romanMatch ? (romanMatch[1] || romanMatch[2]).toLowerCase() : null;

  // 3. Extract digit component (e.g. '1', '2', '3') if no roman numeral found
  const digitMatch = clean.match(/(?:\((\d+)\)|\b(\d+)\b)/);
  const digit = (!roman && digitMatch) ? (digitMatch[1] || digitMatch[2]) : null;

  // Build composite canonical key preserving subpart hierarchy:
  if (letter && roman) {
    return `${letter}.${roman}`;
  }
  if (letter && digit) {
    return `${letter}.${digit}`;
  }
  if (letter) {
    return letter;
  }
  if (roman) {
    return roman;
  }
  if (digit) {
    return digit;
  }

  // Fallback: strip all non-alphanumeric characters
  const normalized = clean.replace(/[^a-z0-9]/g, '');
  return normalized || clean;
}

/**
 * Computes a numeric sort weight for subparts to guarantee chronological ordering:
 * 'a' -> 100, 'a.i' -> 101, 'a.ii' -> 102, 'b' -> 200, 'b.i' -> 201, 'c' -> 300, etc.
 * Ensures Part 3(a) is ALWAYS sorted and displayed before Part 3(c).
 */
function getSubpartSortWeight(keyOrLabel: string): number {
  if (!keyOrLabel) return 9999;
  const canonical = getCanonicalSubpartKey(keyOrLabel);
  const parts = canonical.split('.');
  const letterPart = parts[0] || '';
  const subPart = parts[1] || '';

  let weight = 0;
  if (/^[a-z]$/i.test(letterPart)) {
    weight += (letterPart.toLowerCase().charCodeAt(0) - 96) * 100;
  } else if (/^\d+$/.test(letterPart)) {
    weight += parseInt(letterPart, 10) * 100;
  } else {
    weight += 5000;
  }

  const romanMap: Record<string, number> = {
    'i': 1, 'ii': 2, 'iii': 3, 'iv': 4, 'v': 5,
    'vi': 6, 'vii': 7, 'viii': 8, 'ix': 9, 'x': 10
  };

  if (romanMap[subPart.toLowerCase()]) {
    weight += romanMap[subPart.toLowerCase()];
  } else if (/^\d+$/.test(subPart)) {
    weight += parseInt(subPart, 10);
  }

  return weight;
}

interface VisualGroundingResult {
  diagram_regions: Array<{
    label: string;
    box_2d: [number, number, number, number];
  }>;
  subpart_groundings: Array<{
    part_label: string;
    label_box?: [number, number, number, number];
    handwriting_box?: [number, number, number, number];
    answer_baseline_y: number; // 0-1000
    has_student_writing?: boolean;
    earned_points?: Array<{
      point_number: number;
      student_phrase?: string;
      box_2d: [number, number, number, number];
    }>;
    mistake_points?: Array<{
      flawed_phrase?: string;
      box_2d: [number, number, number, number];
    }>;
    correction_box?: [number, number, number, number];
  }>;
}

function formatLayoutRegions(layoutMap: VisualGroundingResult): any[] {
  const regions: any[] = [];
  (layoutMap.diagram_regions || []).forEach((d: any, idx: number) => {
    if (Array.isArray(d.box_2d) && d.box_2d.length === 4) {
      regions.push({
        id: `diagram_${(d.label || `fig_${idx + 1}`).replace(/[^a-z0-9]/gi, '_')}`,
        type: 'diagram',
        bbox: {
          x: d.box_2d[1] / 1000,
          y: d.box_2d[0] / 1000,
          width: Math.max(0.05, (d.box_2d[3] - d.box_2d[1]) / 1000),
          height: Math.max(0.05, (d.box_2d[2] - d.box_2d[0]) / 1000)
        },
        confidence: 1.0,
        text_snippet: d.label
      });
    }
  });

  const subparts = (layoutMap as any).subpart_groundings || (layoutMap as any).subpart_regions || [];
  subparts.forEach((s: any) => {
    const effectiveY = (typeof s.answer_baseline_y === 'number' && s.answer_baseline_y > 40)
      ? s.answer_baseline_y
      : ((Array.isArray(s.handwriting_box) && s.handwriting_box[2] > 40)
          ? s.handwriting_box[2]
          : ((Array.isArray(s.label_box) && s.label_box[0] > 40)
              ? s.label_box[0]
              : 100));
    const ymin = Math.max(40, effectiveY);
    const ymax = Math.min(960, ymin + 35);
    const xmin = (Array.isArray(s.handwriting_box) && s.handwriting_box[1] > 40) ? s.handwriting_box[1] : 150;
    const xmax = (Array.isArray(s.handwriting_box) && s.handwriting_box[3] > 40) ? s.handwriting_box[3] : 850;
    regions.push({
      id: `ans_${(s.part_label || 'subpart').replace(/[^a-z0-9]/gi, '_').toLowerCase()}_line`,
      type: 'answer_line',
      bbox: {
        x: xmin / 1000,
        y: ymin / 1000,
        width: Math.max(0.1, (xmax - xmin) / 1000),
        height: Math.max(0.02, (ymax - ymin) / 1000)
      },
      confidence: 1.0,
      subpart_label: s.part_label
    });
  });
  return regions;
}

// Pass 2: Visual Grounding & Positioning Agent (pure coordinate and spatial localization with gpt-6-luna)
async function groundEvaluatedMarks(
  apiKey: string,
  modelCandidates: string[],
  imageUrl: string,
  evaluatedSubparts: any[],
  qNum: string
): Promise<VisualGroundingResult | null> {
  if (!imageUrl || !evaluatedSubparts || evaluatedSubparts.length === 0) return null;

  const targets = evaluatedSubparts.map((sp: any) => {
    const earnedPhrases = Array.isArray(sp.marking_points)
      ? sp.marking_points
          .filter((pt: any) => (pt.is_earned || pt.is_awarded || pt.tick_or_cross === 'tick') && pt.student_phrase)
          .map((pt: any) => ({
            point_number: pt.point_number || pt.point_index || 1,
            student_phrase: pt.student_phrase,
            mark_code: pt.mark_code || 'B1'
          }))
      : [];
    const flawedPhrases = Array.isArray(sp.marking_points)
      ? sp.marking_points
          .filter((pt: any) => !(pt.is_earned || pt.is_awarded) && pt.flawed_phrase)
          .map((pt: any) => ({ flawed_phrase: pt.flawed_phrase }))
      : [];

    return {
      part_label: sp.part_label,
      student_answer_detected: sp.student_answer_detected || "",
      score: sp.score,
      max_score: sp.max_score,
      earned_phrases: earnedPhrases,
      flawed_phrases: flawedPhrases,
      teacher_correction_note: sp.teacher_correction_note || sp.constructive_correction || ""
    };
  });

  const groundingPrompt = `You are the Mentora Visual Grounding & Spatial Positioning Agent.
The Senior Chief Examiner has evaluated Question ${qNum}.
Your SOLE TASK is visual OCR localization on this student's exam sheet.
DO NOT re-grade or change scores. Focus 100% on pinpointing the precise pixel coordinates [ymin, xmin, ymax, xmax] (0-1000 integer scale, top-left [0,0] to bottom-right [1000,1000]).

EVALUATED SUBPARTS & TARGET PHRASES TO LOCATE:
${JSON.stringify(targets, null, 2)}

TASK:
1. DETECT PROTECTED REGIONS:
   - Identify any printed diagrams, graphs, circuits, apparatus illustrations, or tables (e.g. "Fig. 8.1", graphs):
   - "diagram_regions": [
       { "label": "string", "box_2d": [ymin, xmin, ymax, xmax] }
     ]
   - Teacher pen marks and notes MUST NEVER overlap these protected regions.

2. FOR EACH SUBPART:
   - "part_label": string matching the input (e.g. "(a)", "(b)(i)")
   - "label_box": [ymin, xmin, ymax, xmax] bounding the printed question subpart label.
   - "handwriting_box": [ymin, xmin, ymax, xmax] bounding the student's actual handwritten answer / calculation for this subpart. If blank: [0, 0, 0, 0].
   - "answer_baseline_y": integer (0 to 1000) indicating the EXACT vertical level (baseline) where the student's handwritten answer text finishes.
   - "earned_points": For each item in "earned_phrases", locate where that exact phrase or formula appears on the sheet:
     [
       {
         "point_number": number,
         "student_phrase": "string",
         "box_2d": [ymin, xmin, ymax, xmax] // bounding the exact phrase so a red tick (✓) can be placed at it
       }
     ]
   - "mistake_points": For each item in "flawed_phrases", locate where that flawed word appears on the sheet:
     [
       {
         "flawed_phrase": "string",
         "box_2d": [ymin, xmin, ymax, xmax] // bounding the flawed word so a neat underline or caret can be placed
       }
     ]
   - "correction_box": If teacher_correction_note is not empty, specify [ymin, xmin, ymax, xmax] for a clear empty space directly below/beside the error where the teacher's red correction note can be written without overlapping diagrams or the next subpart.

COORDINATE SYSTEM:
All coordinates are normalized integers 0 to 1000 (0,0 is top-left, 1000,1000 is bottom-right).
CRITICAL: The sheet spans 0 to 1000 from top to bottom:
- 0 to 100: Top of page / question header
- 500: Middle of page
- 850 to 950: Bottom lines of handwritten calculations
DO NOT compress coordinates to a 0-500 scale — use the full 0-1000 height of the image canvas!

Return strictly valid JSON matching this schema:
{
  "diagram_regions": [
    { "label": "string", "box_2d": [ymin, xmin, ymax, xmax] }
  ],
  "subpart_groundings": [
    {
      "part_label": "string",
      "label_box": [ymin, xmin, ymax, xmax],
      "handwriting_box": [ymin, xmin, ymax, xmax],
      "answer_baseline_y": number,
      "earned_points": [
        { "point_number": number, "student_phrase": "string", "box_2d": [ymin, xmin, ymax, xmax] }
      ],
      "mistake_points": [
        { "flawed_phrase": "string", "box_2d": [ymin, xmin, ymax, xmax] }
      ],
      "correction_box": [ymin, xmin, ymax, xmax]
    }
  ]
}
Return only JSON.`;

  try {
    const res = await executeChatCompletion(apiKey, modelCandidates, {
      messages: [
        { role: "system", content: "You are the Mentora Visual Grounding & Spatial Positioning Agent. Output strictly valid JSON." },
        {
          role: "user",
          content: [
            { type: "text", text: groundingPrompt },
            { type: "image_url", image_url: { url: imageUrl, detail: "high" } }
          ]
        }
      ],
      response_format: { type: "json_object" }
    });

    if (res.ok && res.data?.choices?.[0]?.message?.content) {
      const cleanJson = res.data.choices[0].message.content.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
      const parsed = JSON.parse(cleanJson);
      return {
        diagram_regions: Array.isArray(parsed.diagram_regions) ? parsed.diagram_regions : [],
        subpart_groundings: Array.isArray(parsed.subpart_groundings) ? parsed.subpart_groundings : []
      };
    }
  } catch (err) {
    console.warn("groundEvaluatedMarks execution error:", err);
  }
  return null;
}

// Detects whether a subpart label is a hallucinated math fragment (like "(5)", "5", "5x", "2x")
// rather than a valid British / Cambridge / ZIMSEC exam subpart identifier.
function isLikelyHallucinatedSubpart(label?: string): boolean {
  if (!label) return false;
  const clean = String(label).trim().replace(/[()[\]\s]/g, '').toLowerCase();
  if (/^\d{1,2}$/.test(clean)) return true;
  if (/^\d+[a-z]?[\-+*/=]/i.test(clean)) return true;
  return false;
}

function sanitizeAndMergeSubparts(subparts: any[], annotations?: any[]): any[] {
  if (!Array.isArray(subparts) || subparts.length === 0) return subparts || [];

  const cleaned: any[] = [];
  const removedLabels: string[] = [];

  subparts.forEach((sp) => {
    if (isLikelyHallucinatedSubpart(sp.part_label) && cleaned.length > 0) {
      const prev = cleaned[cleaned.length - 1];
      removedLabels.push(sp.part_label);
      // Merge score and max score into parent subpart
      prev.score = (Number(prev.score) || 0) + (Number(sp.score) || 0);
      prev.max_score = Math.max(Number(prev.max_score) || 0, prev.score, (Number(prev.max_score) || 0) + (Number(sp.max_score) || 0));
      prev.marks_awarded = [...(prev.marks_awarded || []), ...(sp.marks_awarded || [])];
      prev.marking_points = [...(prev.marking_points || []), ...(sp.marking_points || [])];
      // Update answer line to the lower/final answer line of the working
      if (typeof sp.line_y === 'number' && sp.line_y > (prev.line_y || 0)) {
        prev.line_y = sp.line_y;
      }
      if (sp.student_answer_detected) {
        prev.student_answer_detected = sp.student_answer_detected;
      }
    } else {
      cleaned.push(sp);
    }
  });

  // Also clean up annotations if present
  if (Array.isArray(annotations) && removedLabels.length > 0) {
    const parentLabel = cleaned[cleaned.length - 1]?.part_label;
    for (let i = annotations.length - 1; i >= 0; i--) {
      const ann = annotations[i];
      if (removedLabels.includes(ann.subpart_label)) {
        if (ann.type === 'mark_badge' || (ann.text || '').includes('/')) {
          // Remove duplicate/hallucinated badge
          annotations.splice(i, 1);
        } else {
          // Relabel inline ticks / comments to the parent subpart
          ann.subpart_label = parentLabel;
        }
      }
    }
    // Update parent subpart badge text & position
    const parentBadge = annotations.find(
      (a: any) => (a.type === 'mark_badge' || (a.text || '').includes('/')) && a.subpart_label === parentLabel
    );
    const parentSp = cleaned[cleaned.length - 1];
    if (parentBadge && parentSp) {
      parentBadge.text = `(${parentSp.score}/${parentSp.max_score})`;
      if (typeof parentSp.line_y === 'number' && parentBadge.box_2d) {
        parentBadge.box_2d[0] = Math.max(35, parentSp.line_y - 15);
        parentBadge.box_2d[2] = parentSp.line_y + 15;
      }
    }
  }

  return cleaned;
}

// Master synthesizer: merges Pass 1 pedagogical assessment with Pass 2 visual grounding
function applyVisualGroundingToAssessment(
  assessment: any,
  grounding: VisualGroundingResult | null,
  qNum: string,
  targetPageIndex?: number
): void {
  const pIdx = typeof targetPageIndex === 'number' ? targetPageIndex : 0;
  if (!assessment) return;

  if (Array.isArray(assessment.subparts)) {
    assessment.subparts = sanitizeAndMergeSubparts(assessment.subparts, assessment.annotations);
  }

  if (grounding) {
    assessment.layout_regions = formatLayoutRegions(grounding);
  }

  const subparts: any[] = Array.isArray(assessment.subparts) ? assessment.subparts : [];
  if (subparts.length === 0) return;

  subparts.sort((a: any, b: any) => {
    const wA = getSubpartSortWeight(a.part_label || '');
    const wB = getSubpartSortWeight(b.part_label || '');
    return wA - wB;
  });

  const totalParts = subparts.length;
  const score = assessment.total_score ?? assessment.score ?? 0;
  const maxScore = assessment.total_max_score || assessment.max_score || 1;

  const synthesized: any[] = [
    {
      type: 'total_header',
      text: `Q${qNum} Total: ${score}/${maxScore}`,
      comment: `Question ${qNum} Total Score: ${score}/${maxScore}`,
      box_2d: [840, 770, 880, 960],
      page_index: pIdx
    }
  ];

  let prevBadgeY = 0;

  // Auto-detect if LLM vision returned vertically compressed coordinates (0-500 scale)
  const allGroundingY: number[] = [];
  (grounding?.subpart_groundings || []).forEach((sg: any) => {
    if (typeof sg.answer_baseline_y === 'number' && sg.answer_baseline_y > 40) allGroundingY.push(sg.answer_baseline_y);
    if (Array.isArray(sg.handwriting_box) && sg.handwriting_box[2] > 40) allGroundingY.push(sg.handwriting_box[2]);
  });
  subparts.forEach((sp: any) => {
    if (typeof sp.line_y === 'number' && sp.line_y > 40) allGroundingY.push(sp.line_y);
  });
  const maxDetectedY = allGroundingY.length > 0 ? Math.max(...allGroundingY) : 0;
  const targetMaxY = totalParts >= 4 ? 920 : (totalParts === 3 ? 890 : 850);
  const groundingScale = (totalParts >= 2 && maxDetectedY > 0 && maxDetectedY <= 680)
    ? Math.min(2.1, targetMaxY / maxDetectedY)
    : 1.0;

  subparts.forEach((sp: any, idx: number) => {
    const max = Number(sp.max_score) || 1;
    sp.score = Math.max(0, Math.min(Number(sp.score) || 0, max));
    if (sp.score === max) {
      sp.teacher_correction_note = "";
      sp.constructive_correction = "";
      sp.mistake_details = "";
      sp.misconception_analysis = "";
      sp.how_to_improve = "";
    }

    const cleanPart = (sp.part_label || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const matchedGrounding = grounding?.subpart_groundings?.find((sg: any) => {
      const gPart = (sg.part_label || '').toLowerCase().replace(/[^a-z0-9]/g, '');
      return gPart === cleanPart || gPart.endsWith(cleanPart) || cleanPart.endsWith(gPart);
    });

    // 1. Determine answer baseline Y with coordinate scaling
    let detectedY: number | null = null;
    if (matchedGrounding && typeof matchedGrounding.answer_baseline_y === 'number' && matchedGrounding.answer_baseline_y >= 40 && matchedGrounding.answer_baseline_y <= 950) {
      detectedY = Math.min(940, Math.round(matchedGrounding.answer_baseline_y * groundingScale));
      sp.line_y = detectedY;
    } else if (matchedGrounding && Array.isArray(matchedGrounding.handwriting_box) && matchedGrounding.handwriting_box[2] > 40) {
      detectedY = Math.min(940, Math.round(((matchedGrounding.handwriting_box[0] + matchedGrounding.handwriting_box[2]) / 2) * groundingScale));
      sp.line_y = detectedY;
    } else if (typeof sp.line_y === 'number' && sp.line_y >= 40 && sp.line_y <= 950) {
      detectedY = Math.min(940, Math.round(sp.line_y * groundingScale));
    }

    // Scale earned_points box_2d if present
    if (groundingScale > 1.0 && matchedGrounding && Array.isArray(matchedGrounding.earned_points)) {
      matchedGrounding.earned_points.forEach((ep: any) => {
        if (Array.isArray(ep.box_2d) && ep.box_2d.length === 4) {
          const h = Math.max(15, ep.box_2d[2] - ep.box_2d[0]);
          const newY = Math.min(935, Math.round(ep.box_2d[0] * groundingScale));
          ep.box_2d[0] = newY;
          ep.box_2d[2] = Math.min(960, newY + h);
        }
      });
    }

    const defaultY = Math.round(70 + idx * (800 / Math.max(1, totalParts - 1)));
    const rawY = detectedY && detectedY >= 40 && detectedY <= 950 ? detectedY : defaultY;
    // Align directly with student answer line (no artificial subtraction offset)
    let yMid = Math.max(rawY, 35);

    // Collision prevention with diagrams
    if (grounding?.diagram_regions && grounding.diagram_regions.length > 0) {
      for (const d of grounding.diagram_regions) {
        if (Array.isArray(d.box_2d) && d.box_2d.length === 4) {
          const [dYmin, , dYmax] = d.box_2d;
          if (yMid >= dYmin - 10 && yMid <= dYmax + 10) {
            yMid = Math.min(dYmax + 25, 940);
          }
        }
      }
    }

    // Minimum 38 units separation between margin badges
    if (prevBadgeY > 0 && yMid < prevBadgeY + 38) {
      yMid = prevBadgeY + 38;
    }
    prevBadgeY = yMid;
    sp.line_y = yMid;

    // 2. Right Margin Score Badge: strictly in the right margin column
    const badgeText = `(${sp.score}/${sp.max_score})`;
    synthesized.push({
      type: 'mark_badge',
      text: badgeText,
      comment: sp.score > 0 ? (sp.marks_awarded?.[0] || `Part ${sp.part_label}: ${sp.score}/${sp.max_score} marks`) : (sp.deductions?.[0] || `Part ${sp.part_label}: 0/${sp.max_score} marks`),
      box_2d: [Math.max(yMid - 16, 40), 865, Math.min(yMid + 16, 940), 975],
      subpart_label: sp.part_label,
      page_index: pIdx
    });

    // 3. Point-by-point inline ticks (grounded to specific words/steps)
    let placedTicks = 0;
    const earnedPoints = Array.isArray(sp.marking_points)
      ? sp.marking_points.filter((pt: any) => pt.is_earned || pt.is_awarded || pt.tick_or_cross === 'tick')
      : [];

    earnedPoints.forEach((pt: any, ptIdx: number) => {
      let ptBox: [number, number, number, number] | null = null;
      if (matchedGrounding?.earned_points && matchedGrounding.earned_points.length > 0) {
        const ep = matchedGrounding.earned_points.find((p: any) =>
          p.point_number === (pt.point_number || pt.point_index || ptIdx + 1) ||
          (p.student_phrase && pt.student_phrase && p.student_phrase.toLowerCase().includes(pt.student_phrase.toLowerCase().slice(0, 15)))
        );
        if (ep && Array.isArray(ep.box_2d) && ep.box_2d.length === 4 && (ep.box_2d[0] > 0 || ep.box_2d[2] > 0)) {
          ptBox = ep.box_2d;
          pt.box_2d = ep.box_2d;
        }
      }

      if (!ptBox && Array.isArray(pt.box_2d) && pt.box_2d.length === 4 && (pt.box_2d[0] > 0 || pt.box_2d[2] > 0)) {
        ptBox = pt.box_2d;
      }

      let tickY: number;
      let tickX: number;
      if (ptBox) {
        const lineY = Math.round((ptBox[0] + ptBox[2]) / 2);
        tickY = Math.max(Math.min(lineY, 940), 30);
        tickX = Math.min(Math.max(ptBox[3] + 6, 120), 760);
      } else {
        // If subpart spans a tall handwriting box (e.g. graph + equations, span > 80 units),
        // distribute ticks along that span rather than clustering at the very bottom!
        const hwBox = matchedGrounding?.handwriting_box;
        const hasTallSpan = Array.isArray(hwBox) && hwBox.length === 4 && (hwBox[2] - hwBox[0] > 80);
        if (hasTallSpan) {
          const hwTop = Math.max(hwBox[0], 40);
          const hwBottom = Math.min(hwBox[2], 930);
          const span = hwBottom - hwTop;
          const stepFrac = (ptIdx + 1) / (earnedPoints.length + 1);
          tickY = Math.round(hwTop + span * stepFrac);
          tickX = ptIdx % 2 === 0 ? 560 : 720;
        } else {
          const yOffset = earnedPoints.length === 1 ? 0 : Math.round((ptIdx - (earnedPoints.length - 1) / 2) * 22);
          tickY = Math.max(yMid + yOffset, 40);
          tickX = earnedPoints.length === 1 ? 720 : (ptIdx % 2 === 0 ? 580 : 720);
        }
      }

      const isStrictMarkCode = typeof pt.mark_code === 'string' && /^[A-Z]\d{1,2}$/i.test(pt.mark_code.trim()) && pt.mark_code.trim().length <= 4;
      const cleanMarkCode = isStrictMarkCode ? pt.mark_code.trim().toUpperCase() : '✓';

      synthesized.push({
        type: 'inline_tick',
        text: cleanMarkCode,
        comment: pt.criterion || pt.student_phrase || `Part ${sp.part_label} mark earned`,
        box_2d: [Math.max(tickY - 14, 30), tickX, Math.min(tickY + 14, 940), Math.min(tickX + 40, 795)],
        subpart_label: sp.part_label,
        page_index: pIdx
      });
      placedTicks++;
    });

    // If earned marks > placedTicks, synthesize remaining ticks distributed along the answer line
    if (placedTicks < sp.score) {
      const remaining = Math.min(sp.score - placedTicks, 4);
      for (let k = 0; k < remaining; k++) {
        const tickIdx = placedTicks + k;
        const yOffset = Math.round((tickIdx - (sp.score - 1) / 2) * 22);
        const tickY = Math.max(yMid + yOffset, 40);
        const tickX = sp.score === 1 ? 720 : (tickIdx % 2 === 0 ? 580 : 720);
        synthesized.push({
          type: 'inline_tick',
          text: '✓',
          comment: sp.marks_awarded?.[tickIdx] || `Part ${sp.part_label} mark ${tickIdx + 1} earned`,
          box_2d: [Math.max(tickY - 14, 30), tickX, Math.min(tickY + 14, 940), Math.min(tickX + 35, 840)],
          subpart_label: sp.part_label,
          page_index: pIdx
        });
      }
    }

    // 4. Teacher correction note: positioned safely in blank space, NEVER overlapping the next subpart
    if (sp.score < sp.max_score) {
      const note = (sp.teacher_correction_note || sp.constructive_correction || sp.teacher_correction || sp.deductions?.[0] || sp.feedback || '').replace(/^✎\s*/, '').replace(/^\^\s*/, '').trim();
      if (note) {
        let corrBox: [number, number, number, number];
        if (matchedGrounding && Array.isArray(matchedGrounding.correction_box) && matchedGrounding.correction_box.length === 4 && matchedGrounding.correction_box[0] > 0) {
          corrBox = matchedGrounding.correction_box;
        } else {
          const nextSubpartDefaultY = idx + 1 < totalParts ? Math.round(70 + (idx + 1) * (800 / Math.max(1, totalParts - 1))) : 940;
          const availableGap = nextSubpartDefaultY - yMid;
          const corrY = availableGap >= 45 ? Math.min(yMid + 20, nextSubpartDefaultY - 20) : Math.max(yMid - 20, 45);
          const corrX = availableGap >= 45 ? 160 : 120;
          corrBox = [corrY, corrX, Math.min(corrY + 28, 940), Math.min(corrX + 340, 840)];
        }

        synthesized.push({
          type: 'comment',
          text: note,
          comment: note,
          teacher_correction: note,
          box_2d: corrBox,
          subpart_label: sp.part_label,
          page_index: pIdx
        });
      }
    }
  });

  // 5. Strict 2D Collision Resolution: Ticks and Comments MUST NOT overlap!
  const allTicks = synthesized.filter(m => m.type === 'tick' || m.type === 'inline_tick');
  const allComments = synthesized.filter(m => m.type === 'comment' || m.type === 'teacher_note');

  allComments.forEach(comm => {
    const cBox = comm.box_2d;
    if (!Array.isArray(cBox) || cBox.length < 4) return;

    for (const t of allTicks) {
      const tBox = t.box_2d;
      if (!Array.isArray(tBox) || tBox.length < 4) continue;

      const yOverlap = Math.max(cBox[0], tBox[0] - 8) < Math.min(cBox[2], tBox[2] + 8);
      const xOverlap = Math.max(cBox[1], tBox[1] - 8) < Math.min(cBox[3], tBox[3] + 8);

      if (yOverlap && xOverlap) {
        const tickMidY = (tBox[0] + tBox[2]) / 2;
        const commMidY = (cBox[0] + cBox[2]) / 2;
        const commHeight = Math.max(22, cBox[2] - cBox[0]);

        if (commMidY >= tickMidY) {
          cBox[0] = Math.min(930, tBox[2] + 10);
          cBox[2] = Math.min(950, cBox[0] + commHeight);
        } else {
          cBox[2] = Math.max(30, tBox[0] - 10);
          cBox[0] = Math.max(20, cBox[2] - commHeight);
        }
      }
    }
  });

  assessment.annotations = synthesized;
}

// Prompt builder: targeted per-question grading with explicit mark-scheme injection and anti-hallucination rules
function buildTargetedQuestionGradingPrompt(
  qNum: string,
  schemeData: {
    found: boolean;
    marks: number;
    topic: string;
    content_text: string;
    official_mark_scheme: string | null;
  },
  studentTranscription?: string,
  spannedPages?: number[],
  targetPageIndex?: number,
  paperQuestionsContext?: string
): string {
  const isPageSpecific = typeof targetPageIndex === 'number';
  const pagesText = isPageSpecific
    ? `TARGET EVALUATION FOCUS: BOOKLET PAGE ${targetPageIndex}`
    : (spannedPages && spannedPages.length > 0
        ? `Target Booklet Page(s): ${spannedPages.join(', ')}`
        : `Single-Page Submission`);

  const expectedSubparts = extractQuestionSubparts(schemeData.content_text, schemeData.official_mark_scheme);
  const subpartChecklist = expectedSubparts.length > 0
    ? `======================================================================
MANDATORY OFFICIAL SUBPART REFERENCE (QUESTION ${qNum}):
${expectedSubparts.map(sp => `• Part ${sp.label} [${sp.marks} mark(s)]`).join('\n')}
======================================================================
CRITICAL MANDATORY INSTRUCTION — GRADE EVERY VISIBLE WRITTEN ANSWER ON THIS PAGE:
1. Scan the student page completely from TOP TO BOTTOM.
2. Identify and evaluate EVERY single written answer, formula, calculation, unit, or response visible on this sheet (e.g. (a), (b)(i), (b)(ii), (b)(iii), (c)(i), (c)(ii), etc.).
3. STRICT RELEVANCE & ANTI-WRONG-QUESTION REQUIREMENT:
   - Marks are ONLY awarded for answers, formulas, or calculations that are directly and unambiguously attempting QUESTION ${qNum} of this target paper!
   - If a student's handwritten response answers a DIFFERENT question, addresses an UNRELATED topic, or belongs to a DIFFERENT examination paper, you MUST award ZERO (0) MARKS for that part.
   - Never award marks for formulas or calculations that belong to a different question or paper!
4. In your "subparts" array, output an evaluation entry for EACH subpart present on this sheet.
   Set "page_index": ${isPageSpecific ? targetPageIndex : (spannedPages?.[0] ?? 0)}.
======================================================================`
    : `CRITICAL MANDATORY INSTRUCTION: Scan the student page from TOP TO BOTTOM. Grade EVERY subpart present on this sheet. Marks are ONLY awarded for answers directly attempting Question ${qNum} of this target paper. If answers are for a different question or paper, award 0 marks. Set "page_index": ${isPageSpecific ? targetPageIndex : (spannedPages?.[0] ?? 0)}.`;

  const markSchemeSection = schemeData.found && schemeData.official_mark_scheme
    ? `======================================================================
OFFICIAL AUTHORITATIVE MARK SCHEME (MANDATORY & BINDING GROUND TRUTH FOR QUESTION ${qNum}):
${schemeData.official_mark_scheme}
======================================================================

CRITICAL MARK SCHEME SUPREMACY, UNIVERSAL STANDARDISATION & ANTI-HALLUCINATION RULES:
0. RUBRIC ROWS = OFFICIAL MARKING POINTS: Each line of the official rubric above in the form "(subpart) [MARKCODE] criteria" (e.g. "(b)(i) [C1] line with negative gradient") is ONE official marking point worth that mark code's value (B1/C1/A1/M1 = 1 mark each). The student earns that mark EXACTLY when their answer satisfies that line's criteria. Grade point-by-point against these rows — they are the authoritative decomposition of this question's marks, pre-collected from the official mark scheme. Do NOT invent your own marking points when rows exist for the subpart.
0b. NUMERIC TOLERANCE (BENEFIT OF THE DOUBT): If the student's numeric answer differs from the scheme's target ONLY by rounding or sig-fig convention (e.g. student writes 12.5° where the scheme row says 12°, or 6.2° where the scheme says 6°) AND their working is mathematically sound and consistent, AWARD the mark. NEVER withhold a mark over a rounding difference when the student's derivation is correct.
0c. IMPLIED LOGIC CREDIT (BENEFIT OF THE DOUBT): A marking point is EARNED when the student's reasoning logically entails it, even if the step is not written explicitly. Example: if the scheme row is "total resistance (of circuit) decreases" and the student writes "the supply E is constant, so the total current in the circuit increases", that chain entails total resistance decreased (I = E/R) — AWARD the mark. This also applies to MULTI-STEP DERIVATIONS: if the student's correct FINAL result could only be reached by correctly handling an intermediate scheme row, that row is EARNED. Example: the scheme rows are "[C1] SI base units of D: kg m s–2" and "[A1] base units of η: kg m–1 s–1"; the student writes "D = 6πηrv; η = D/(6πrv); base units of η = kg m–1 s–1" without stating D's units — the correct final η units entail D's units (kg m s–2) were handled correctly, so BOTH rows are earned. Do not withhold a marking point merely because an intermediate step was implied rather than written, provided the physics is sound and consistent with the student's own working. Apply the same implied-logic standard identically on every run and every paper.
0d. ANSWER MARKS — POSITIVE MARKING POLICY (CONSISTENT ON EVERY RUN AND EVERY PAPER):
(a) WORKING + STATED ANSWER: If the student's working produces a different value but their stated/final answer matches the scheme's answer, AWARD the mark for the correct answer. Write the working discrepancy as teacher_correction_note (e.g. "your working used 400 m s–1; should be 320 m s–1, giving 3200 m") — the note NEVER withholds the answer mark. Example: the student calculates ½ × 20 × 400 = 4000 m, then states "the answer is 3.2 km" because the question says "show that... 3.2 km" → AWARD the A mark, and the correction note explains the graph misread.
(b) TWO OFFERED ANSWERS: If the student explicitly offers two answers to the same question, mark the FINAL offered one (their last decision). An explicit self-correction (crossing out the wrong one, or writing "no, actually 3.2 km") counts as the final answer.
(c) AMBIGUOUS SIMULTANEOUS ANSWERS: If two contradictory answers are both left standing with no order or correction (or more options are selected than the question requires), award NO mark for that subpart and write a teacher note: "two answers offered — the intended answer is unclear."
Apply (a)–(c) identically to every subpart on every run and every paper.
0e. MULTI-POINT ESSAY / "ONE MARK PER POINT" SCHEMES (HISTORY, GEOGRAPHY, ENGLISH & SIMILAR — CRITICAL):
Some schemes award ONE MARK PER RELEVANT POINT, up to the part's printed total. These schemes list SEVERAL possible valid points for one subpart (e.g. "(a) [B1] Decrees announcing the right to work / [B1] Creation of National Workshops / [B1] Abolition of the death penalty / [B1] Some taxes..." where part (a) is worth 4 marks), or use phrases like "One mark for each relevant point", "responses may include the following", or LEVEL TABLES for essay parts.
- MARKS-AVAILABLE = the part's PRINTED TOTAL (e.g. 4, 6 or 10) — read it from the official rubric above or the question's mark allocation. NEVER set max_score to 1 for such a part.
- SCAN THE STUDENT'S ENTIRE ANSWER for that subpart, and award ONE MARK FOR EACH DISTINCT valid point they wrote that matches any listed point (or any other relevant correct point the scheme permits, e.g. "or" alternatives). A student who wrote 3 valid points for a 4-mark part scores 3 — not 1.
- The listed points are a MENU of possibilities, not a single required answer: EACH listed row the student satisfies earns its mark.
- For LEVEL-TABLE essay parts ((b)/(c) style: Level 2 "Explains one reason... 4–5"): mark against the LEVEL DESCRIPTORS — find the highest level the student's explanation genuinely reaches and award within that level's mark range. Do not reduce a level-marked essay to 1.
- ESSAY ANSWERS ARE SCANNED IN FULL: never award only the first matching point you find and stop — read the whole answer and credit EVERY distinct valid point, up to the part's total.
1. BINDING GROUND TRUTH: The official mark scheme above is the SUPREME BINDING CRITERIA. You MUST NOT invent outside rules, unmentioned jargon, or deductions not present in this official scheme.

2. UNIVERSAL EXAMINER CODE OF PRACTICE & MANDATORY RELEVANCE REQUIREMENT (CAMBRIDGE / EDEXCEL / ZIMSEC / IB):
   - Under standard examination board regulations, RELEVANCE IS MANDATORY FOR ANY MARK:
     * Marks can ONLY be awarded if the student's answer is an attempt at the specific question asked (Question ${qNum}).
     * If the student's handwritten response answers a different question, addresses an unrelated topic, or comes from a different examination paper:
       - YOU MUST AWARD STRICTLY ZERO (0) MARKS for this question and for all its subparts.
       - ABSOLUTE ZERO-TOLERANCE BAN ON COINCIDENTAL MATCHES: Never award marks for isolated keywords (e.g. 'increase', 'decrease', 'electrons', 'filter', 'copper'), common units (e.g. 'm/s', 'J', 'N', '°C'), standard equations, or isolated numbers that happen to match a marking point when the student is writing about an unrelated question or different paper!
       - In real examinations, an answer to an unasked question receives STRICTLY 0 MARKS.
   - BENEFIT OF THE DOUBT (BOD) STRICT LIMITATION:
     * Benefit of the Doubt (BOD) applies ONLY when an answer is genuinely attempting Question ${qNum} and demonstrates authentic scientific knowledge of this specific scenario.
     * BOD NEVER applies across different questions, different topics, or different exam papers!
   - When an attempt is genuine and addresses Question ${qNum}:
     * Do NOT penalize or withhold marks for:
       - Unlabelled reference letters or points on diagrams when the placement itself unambiguously satisfies the marking point.
       - Stray marks, faint pencil lines, erased attempts, or unintentional ink smudges near printed text.
       - Minor phonetic spelling or handwriting slips where the meaning is unambiguous.
   - DETERMINISTIC CONSISTENCY GUARANTEE:
     * Identical student answers MUST receive identical scores every single time without variance.
     * Never apply subjective harshness on one run and leniency on another.

3. UNIVERSAL MANDATORY RULE FOR MULTIPLE CHOICE, WORD LISTS, AND SELECTION QUESTIONS (UNDERLINE / CIRCLE / TICK):
   - Whenever a question presents a word bank or multiple options (e.g. "Underline two words from the list: ..."):
   - INSPECT THE PEN INK CLOSELY: A word is ONLY selected if the student has actively underlined it, circled it, or ticked beside it.
   - The printed text of options does NOT mean the student selected all of them!
   - POSITIVE MARKING (CAMBRIDGE & ZIMSEC PRINCIPLE): NEVER hallucinate that un-underlined words were chosen, and NEVER cancel out correct marks with imaginary selections!

4. MATHEMATICAL & CALCULATION VERIFICATION:
   - Carefully verify the student's mathematical steps, formulas, and arithmetic.
   - ABSOLUTE BAN ON SELF-CONTRADICTION: Under NO circumstances mark a student step incorrect if your own proposed correction note repeats the exact formula, numbers, or answer the student wrote!
5. "ANY N FROM" CRITERIA:
   - If the mark scheme states "any two from [A, B, C]" or "any three from [D, E, F]", and the student states that required number of valid concepts, award FULL MARKS.
6. SUBPART MARKS BUDGET INTEGRITY:
   - The max marks for each subpart are strictly defined by the mark scheme.
7. ZERO OVER-CORRECTION ON FULL-MARK ANSWERS:
   - When a student scores full marks on a subpart, set teacher_correction_note: "", constructive_correction: "", mistake_details: "".
   - Never write red correction notes or underlines over correct answers or drawings.`
    : `======================================================================
OFFICIAL MARK SCHEME STATUS:
[NO OFFICIAL MARK SCHEME STORED IN DATABASE FOR QUESTION ${qNum} OF THE TARGET PAPER]
- Grade strictly against the TARGET PAPER's stored question content above (and the target paper question context provided in this prompt, if any) using standard Cambridge / ZIMSEC / IB syllabus principles.
- Do NOT grade against question text printed on the student's uploaded sheet — the uploaded pages may belong to a different paper.
- If the uploaded sheet contains answers to a different paper or question, award ZERO (0) marks.
- ANTI-INVENTED-TARGET RULE (CRITICAL): NEVER invent specific numeric target values (angles, voltages, currents, wavelengths, etc.) that are not stated in the provided question content or context. If the student's working is mathematically and scientifically correct, AWARD the mark (Benefit of the Doubt). Do NOT deduct marks for rounding differences (e.g. 12.5° vs 12°), and do NOT reject a correct answer against a target value you invented yourself.
======================================================================`;

  return `You are the Mentora Senior Chief Examiner and Master Pedagogical Teacher.
You evaluate student answers under the guiding philosophy:
"MARK LIKE AN EXAMINER, EXPLAIN LIKE A TEACHER, AND ANNOTATE LIKE A PROFESSIONAL TEACHER."

TARGET QUESTION TO EVALUATE:
Question Number: ${qNum}
Total Maximum Marks: ${schemeData.marks}
Topic: ${schemeData.topic}
${pagesText}

EXAM QUESTION TEXT & STEM (TARGET PAPER — AUTHORITATIVE):
${schemeData.content_text || "Refer to the target paper's stored question content provided in this prompt — NEVER to question text printed on the student's uploaded sheet."}

${subpartChecklist}

${markSchemeSection}

TARGET PAPER CONSISTENCY & ANTI-WRONG-PAPER RULES (CRITICAL):
- The student submitted these answer pages INTO the target paper (whose questions and mark schemes are provided in this prompt). EVERY page must be evaluated strictly against the TARGET PAPER.
- If the uploaded pages contain answers to a DIFFERENT question paper (e.g. the student uploaded another paper's answer sheets):
  * YOU MUST AWARD ZERO (0) MARKS for all subparts of Question ${qNum}!
  * Under NO circumstances should you cherry-pick isolated formulas, single words, common units, or numbers from an unrelated paper to award marks!
  * Set total_score: 0, set every subpart score: 0, set all marking_points is_earned: false.
  * In deductions, state: "Submitted work appears to be from a different exam paper or question; does not attempt Question ${qNum} of this target paper (0 marks)."
  * In teacher_correction_note, state: "Unrelated paper/question — 0 marks awarded".
  * Set is_attempting_target_question: false.
- NEVER adopt question text, topics, or mark schemes printed on the student's uploaded sheet if they belong to a different paper.
- MISMATCH ≠ DIFFERENT QUESTION (CRITICAL): If the student's answers on the page ATTEMPT the target question but their values differ from the scheme's expected values (e.g. they misread a graph and wrote 20 m s–2 where the scheme expects 16 m s–2, or 4000 m where the scheme expects 3200 m), you MUST STILL GRADE those subparts — output a subpart entry for each, awarding what is earned and deducting what is wrong. NEVER omit an attempted subpart from the "subparts" array. Omitting an attempted subpart is a marking failure, as bad as awarding a wrong mark. The different-paper zero-rule above applies ONLY when the whole submission clearly belongs to a different exam paper — not when individual answers simply disagree with the expected values.
- MATCH BY CONTENT, NOT HANDWRITTEN LABELS (CRITICAL): Students sometimes mislabel parts on their own pages (e.g. write "2." or "(c)" next to what is actually the target question's next part). Match page content to the rubric rows by SUBJECT MATTER (same figures, equations, quantities, final answers), NOT by the handwritten numbering. If the page's working matches the rubric's rows for the target question (same quantities/equations/energy values), you MUST grade it as the target question's subpart even if the handwritten label differs.
- RUBRIC ROWS DEFINE SCOPE (CRITICAL): The official rubric rows above are the authoritative definition of what the target question contains. If the "EXAM QUESTION TEXT & STEM" is short, truncated, or only describes the first part of the question (e.g. it only mentions the definition while the rubric rows cover later parts with calculations), that does NOT make the later parts a different question. Any answer on the page that matches a rubric row of the target question belongs to the target question — grade it. NEVER zero-out or skip an answer as "a different part of the question" or "unrelated to the target question" when that answer matches one of the target question's rubric rows.
${paperQuestionsContext && !schemeData.official_mark_scheme ? `
TARGET PAPER FULL QUESTION CONTEXT (AUTHORITATIVE — use this to locate this question's content and mark scheme):
${paperQuestionsContext}
` : ""}
STUDENT SUBMISSION NOTES / TRANSCRIPTION:
${studentTranscription || "Refer to attached handwriting image(s)."}

PROFESSIONAL EXAMINER & PEDAGOGICAL TEACHER PROTOCOL:
1. RIGOROUS MARK SCHEME GRADING & EXACT PHRASE EXTRACTION:
   - Grade every subpart strictly against the official mark scheme.
   - For every marking point in "marking_points":
     * "point_number": integer (1, 2, ...)
     * "criterion": string (mark scheme criteria)
     * "is_earned": boolean (true if earned, false otherwise)
     * "mark_code": string (STRICT 2-3 char code only, e.g. "B1", "M1", "A1", "C1". NEVER write sentences or explanations in mark_code)
     * "student_phrase": the EXACT word, phrase, equation, or number from the student's handwritten response that earned this mark (e.g. 'distillation', 'Q = mcΔT', '2.5 A'). If not earned, leave empty "".
     * "flawed_phrase": if missed due to an incorrect response, the specific flawed word or value written by the student (e.g. 'conduction', 'inverted', 'real'). If omitted entirely, leave empty "".
   - NOTE: You do not need to guess pixel coordinates; the Visual Grounding Agent will localize them in Pass 2 using these target phrases!
2. CONSTRUCTIVE CORRECTIONS & DEDUCTION TRANSPARENCY (CRITICAL):
   - NO SILENT DEDUCTIONS: If score < max_score, you MUST explicitly state each lost point and reason in "deductions" (e.g. ["Missed [A1]: Final answer was 48.7 instead of 48.69", "Missed [B1]: Incomplete reason for cyclic quadrilateral"]). NEVER deduct marks silently without specifying the exact lost mark in "deductions"!
   - If full marks (score == max_score): teacher_correction_note: "", constructive_correction: "", mistake_details: "", deductions: [].
   - If a student makes an error, write a concise correction note (MAXIMUM 10-12 words). Keep it very short so it fits on one line and never overlaps student writing!

REQUIRED JSON OUTPUT SCHEMA:
{
  "identified_question_number": "${qNum}",
  "identified_topic": "${schemeData.topic}",
  "is_attempting_target_question": boolean, // MANDATORY: true ONLY if the student's page genuinely attempts Question ${qNum} of the target paper (same topic, same sub-parts, same figures/context). If the page answers a different question or belongs to a different exam paper, it MUST be false and every score MUST be 0.
  "total_score": number,
  "total_max_score": ${schemeData.marks},
  "percentage": number,
  "subparts": [
    {
      "part_label": "string (e.g. '(a)', '(b)(i)', '(b)(ii)', '(b)(iii)')",
      "line_y": number, // integer 0-1000 indicating vertical level of student's answer line
      "score": number,
      "max_score": number, // MUST equal the official marks for that subpart from the mark scheme above — NEVER invent subpart labels or max marks that are not in the official mark scheme
      "student_answer_detected": "string",
      "marks_awarded": ["string"],
      "deductions": ["string"],
      "teacher_correction_note": "string (empty if full marks)",
      "constructive_correction": "string (empty if full marks)",
      "mistake_details": "string (empty if full marks)",
      "page_index": number, // MANDATORY: ${isPageSpecific ? `MUST BE ${targetPageIndex}` : `Exact booklet page index where this subpart was written (${spannedPages?.join(', ') || 0})`}
      "marking_points": [
        {
          "point_number": 1,
          "criterion": "string",
          "is_earned": boolean,
          "mark_code": "string",
          "student_phrase": "string",
          "flawed_phrase": "string"
        }
      ]
    }
  ],
  "annotations": [
    {
      "type": "inline_tick" | "tick" | "cross" | "underline" | "total_header",
      "text": "string",
      "comment": "string",
      "box_2d": [ymin, xmin, ymax, xmax],
      "subpart_label": "string",
      "page_index": number // MANDATORY: ${isPageSpecific ? `MUST BE ${targetPageIndex}` : `Page index where this annotation belongs (${spannedPages?.join(', ') || 0})`}
    }
  ],
  "overall_feedback": "string",
  "examiner_model_solution": "string",
  "recommended_next_step": "string"
}
Return only JSON. No surrounding markdown backticks.`;
}

// Relevance gate: cheap per-cluster check that the student's pages genuinely attempt
// this specific question of the target paper BEFORE spending the expensive grading passes.
// A confident "not relevant" verdict forces a 0-score evaluation instead of letting the
// grader award marks on answers that belong to a different paper.
async function checkQuestionRelevance(
  openaiApiKey: string | undefined,
  modelCandidates: string[],
  qNum: string,
  officialQuestion: any | null,
  schemeData: { found: boolean; marks: number; topic: string; content_text: string; official_mark_scheme: string | null },
  pageImages: string[]
): Promise<{ relevant: boolean; confidence: string; reason: string } | null> {
  if (!openaiApiKey || !pageImages || pageImages.length === 0) return null;

  const questionDescription = [
    officialQuestion?.topic ? `Topic: ${officialQuestion.topic}` : "",
    officialQuestion?.content_text && officialQuestion.content_text !== "No text provided"
      ? `Question content: ${String(officialQuestion.content_text).slice(0, 600)}`
      : (schemeData.content_text ? `Question content: ${String(schemeData.content_text).slice(0, 600)}` : ""),
    schemeData.official_mark_scheme ? `Official mark scheme: ${String(schemeData.official_mark_scheme).slice(0, 800)}` : ""
  ].filter(Boolean).join("\n");

  const gatePrompt = `You are a strict exam-paper relevance checker.
TARGET QUESTION of the paper being marked against:
Question Number: ${qNum}
${questionDescription || "(No stored question content — judge by question number and topic context.)"}

TASK: Examine the student's handwritten page(s) below and decide whether they contain answers genuinely attempting THIS SPECIFIC question — same topic, same sub-parts, same figures/context.
- Merely being the same SUBJECT is NOT enough: the answers must plausibly correspond to this question's specific parts, figures, and context.
- If the page clearly answers a DIFFERENT question, or belongs to a different exam paper, it is NOT relevant.

Return strictly valid JSON:
{ "relevant": boolean, "confidence": "high" | "medium" | "low", "reason": "short explanation" }`;

  const userParts: any[] = [{ type: "text", text: gatePrompt }];
  pageImages.forEach((img, idx) => {
    userParts.push({ type: "text", text: `--- STUDENT PAGE ${idx + 1} ---` });
    userParts.push({ type: "image_url", image_url: { url: img, detail: "low" } });
  });

  try {
    const gateRes = await executeChatCompletion(openaiApiKey, modelCandidates, {
      messages: [
        { role: "system", content: "You are an automated exam-paper relevance checker. Output strictly valid JSON." },
        { role: "user", content: userParts }
      ],
      response_format: { type: "json_object" },
      temperature: 0.0
    });

    if (gateRes.ok && gateRes.data?.choices?.[0]?.message?.content) {
      const cleanJson = gateRes.data.choices[0].message.content.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
      const parsed = JSON.parse(cleanJson);
      return {
        relevant: parsed.relevant !== false,
        confidence: String(parsed.confidence || "low"),
        reason: String(parsed.reason || "")
      };
    }
  } catch (e) {
    console.warn(`checkQuestionRelevance error for Question ${qNum}:`, e);
  }
  return null; // inconclusive → allow grading to proceed
}

// Compute the EFFECTIVE booklet total from the paper's answer rules.
// - "Answer all" papers: sum of all questions (identical to legacy behavior).
// - Sectioned papers: sum of required sections + the best N of each elective section
//   (e.g. Section A: all = 42, Section B: any 4 of 6 = sum of the 4 highest marks).
// - "Answer any N" with no sections: sum of the N highest question marks.
function computeEffectiveBookletTotal(
  officialPaperQuestions: any[],
  answerRules: any | null
): number {
  const marksOf = (q: any) => Number(q.marks) || 0;

  // No rules → "answer all": sum everything (legacy behavior, no regression).
  if (!answerRules) {
    return officialPaperQuestions.reduce((s: number, q: any) => s + marksOf(q), 0);
  }

  const sections: any[] = Array.isArray(answerRules.sections) ? answerRules.sections : [];
  const defaultRule = answerRules.default_rule || 'all';

  // No explicit sections but "answer any N": best N marks overall.
  if (sections.length === 0) {
    if (defaultRule === 'any' && Number(answerRules.default_count) > 0) {
      const sorted = officialPaperQuestions.map(marksOf).sort((a: number, b: number) => b - a);
      return sorted.slice(0, Number(answerRules.default_count)).reduce((s: number, m: number) => s + m, 0);
    }
    return officialPaperQuestions.reduce((s: number, q: any) => s + marksOf(q), 0);
  }

  // Sectioned paper: required sections sum fully; elective sections contribute best-N marks.
  let total = 0;
  for (const sec of sections) {
    const label = String(sec.label || '').trim().toUpperCase();
    const secQuestions = officialPaperQuestions.filter((q: any) =>
      String(q.section || '').trim().toUpperCase() === label
    );
    if (secQuestions.length === 0) continue; // section label not matched — skip (falls back below)
    if (sec.requirement === 'any' && Number(sec.count) > 0) {
      const sorted = secQuestions.map(marksOf).sort((a: number, b: number) => b - a);
      total += sorted.slice(0, Number(sec.count)).reduce((s: number, m: number) => s + m, 0);
    } else {
      // "all" — or invalid requirement — sum the section fully
      total += secQuestions.reduce((s: number, q: any) => s + marksOf(q), 0);
    }
  }

  // Fallback: if section labels didn't match any questions (bad extraction), use the legacy sum
  if (total === 0) {
    return officialPaperQuestions.reduce((s: number, q: any) => s + marksOf(q), 0);
  }
  return total;
}

// Compute the student's earned score under the answer rules:
// - questions in "all" sections: always counted
// - questions in "any N" sections: best N by score (over-answering keeps the best N)
// - unmatched/sectionless questions on rule-less papers: all counted
function computeEffectiveEarnedScore(
  evaluatedQuestions: any[],
  officialPaperQuestions: any[],
  answerRules: any | null
): number {
  const rulesBySection = new Map<string, any>();
  (answerRules?.sections || []).forEach((sec: any) => {
    rulesBySection.set(String(sec.label || '').trim().toUpperCase(), sec);
  });

  let earned = 0;
  const pendingElective: { section: string; score: number }[] = [];

  for (const qEval of evaluatedQuestions) {
    const qNum = String(qEval.question_number || qEval.identified_question_number || '').trim();
    const officialQ = officialPaperQuestions.find((oq: any) => String(oq.question_number).trim() === qNum);
    const section = String(officialQ?.section || '').trim().toUpperCase();
    const score = Number(qEval.score ?? qEval.total_score ?? 0);

    const rule = section ? rulesBySection.get(section) : undefined;
    if (rule && rule.requirement === 'any' && Number(rule.count) > 0) {
      pendingElective.push({ section, score });
    } else {
      earned += score; // required section, or no rules — count it
    }
  }

  // For each elective section, keep the best N attempts
  const bySection = new Map<string, number[]>();
  pendingElective.forEach(pe => {
    if (!bySection.has(pe.section)) bySection.set(pe.section, []);
    bySection.get(pe.section)!.push(pe.score);
  });
  bySection.forEach((scores, section) => {
    const rule = rulesBySection.get(section);
    const n = Number(rule?.count) || scores.length;
    const best = scores.sort((a, b) => b - a).slice(0, n);
    earned += best.reduce((s, v) => s + v, 0);
  });

  return earned;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const payload = await req.json();
    const { 
      action, 
      message, 
      context, 
      sessionId, 
      question_text, 
      mark_scheme, 
      student_answer, 
      image_url, 
      document_text,
      model_override,
      generate_marked_image,
      assessment: reqAssessment,
      chatHistory: incomingHistory,
      paper_id: payloadPaperId
    } = payload;

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY") ?? ""
    );

    const openaiApiKey = payload.openai_api_key || Deno.env.get("OPENAI_API_KEY");

    // 0. Standalone AI Hand-Marked Exam Photo Editing (GPT-Image-2.5-Sunburst)
    if (action === "generate_marked_image") {
      if (!openaiApiKey) {
        return new Response(JSON.stringify({ error: "Missing OPENAI_API_KEY" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 400,
        });
      }

      const assessmentData = reqAssessment || {};
      const topic = assessmentData.identified_topic || "Chemistry / Science";
      const totalScore = assessmentData.total_score !== undefined ? assessmentData.total_score : (assessmentData.score || 0);
      const totalMax = assessmentData.total_max_score !== undefined ? assessmentData.total_max_score : (assessmentData.max_score || 10);
      
      const targetPageIndex = typeof payload.page_index === 'number' ? payload.page_index : undefined;
      let originalImage = image_url || payload?.original_image_url;
      if (typeof targetPageIndex === 'number' && assessmentData.pages && assessmentData.pages[targetPageIndex]) {
        originalImage = assessmentData.pages[targetPageIndex].original_image_url || originalImage;
      } else if (!originalImage && assessmentData.original_image_url) {
        originalImage = assessmentData.original_image_url;
      }

      if (!originalImage) {
        return new Response(JSON.stringify({ error: "Missing original student image for editing" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 400,
        });
      }

      const editPrompt = buildSunburstEditPrompt(assessmentData, topic, totalScore, totalMax, targetPageIndex);
      const editedUrl = await editImageWithSunburst(originalImage, editPrompt, openaiApiKey);

      if (editedUrl && !editedUrl.startsWith("ERROR:")) {
        return new Response(JSON.stringify({ 
          image_url: editedUrl,
          page_index: targetPageIndex 
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      } else {
        const errorMsg = editedUrl || "Failed to edit image with gpt-image-2.5-sunburst";
        console.error("generate_marked_image: editImageWithSunburst failed:", errorMsg.substring(0, 300));
        return new Response(JSON.stringify({ error: errorMsg, debug: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        });
      }
    }

    // 0.4 Update Topic Workspace Template (Admin/Teacher chapter materials)
    if (action === "update_topic") {
      const topicId = payload.topic_id;
      const workspaceTemplate = payload.workspace_template;
      if (!topicId) {
        return new Response(JSON.stringify({ error: "Missing topic_id" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 400,
        });
      }
      const { data, error } = await supabaseClient
        .from("topics")
        .update({ workspace_template: workspaceTemplate })
        .eq("id", topicId)
        .select();

      if (error) {
        return new Response(JSON.stringify({ error: error.message }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 500,
        });
      }

      return new Response(JSON.stringify({ success: true, data }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }


    // 1. Direct Assessment Action with Vision & Sub-Part Orchestration Support
    if (action === "assess_attempt") {
      let allQuestionsContext = payload.all_questions_context || context?.allQuestionsContext || "";
      const paperId = payloadPaperId || context?.paperId || context?.paper_id;

      let officialPaperQuestions: any[] = [];
      let paperAnswerRules: any = null;
      if (paperId && supabaseClient) {
        try {
          // Fetch the paper's answer rules (section requirements) for effective-total marking
          const { data: paperRow } = await supabaseClient
            .from("papers")
            .select("answer_rules")
            .eq("id", paperId)
            .maybeSingle();
          paperAnswerRules = paperRow?.answer_rules || null;

          // Fetch all questions for this paper (valid schema columns only)
          const { data: qData } = await supabaseClient
            .from("past_paper_questions")
            .select("id, question_number, marks, topic, content_text, subtopic, section")
            .eq("paper_id", paperId);

          if (qData && qData.length > 0) {
            // Sort questions numerically (1, 2, 3... 9, 10) so paper questions never scramble
            qData.sort((a: any, b: any) => {
              const numA = parseInt(String(a.question_number).match(/\d+/)?.[0] || '0', 10);
              const numB = parseInt(String(b.question_number).match(/\d+/)?.[0] || '0', 10);
              if (numA !== numB) return numA - numB;
              return String(a.question_number).localeCompare(String(b.question_number), undefined, { numeric: true });
            });
            officialPaperQuestions = qData;

            if (!allQuestionsContext) {
              const qIds = qData.map((q: any) => q.id).filter(Boolean);
              let solMap: Record<string, string> = {};
              if (qIds.length > 0) {
                const { data: solData } = await supabaseClient
                  .from("past_paper_solutions")
                  .select("question_id, official_mark_scheme")
                  .in("question_id", qIds);
                if (solData && solData.length > 0) {
                  solData.forEach((s: any) => { solMap[s.question_id] = s.official_mark_scheme; });
                }
              }

              // Build full question context block with official mark schemes & subparts
              allQuestionsContext = qData.map((q: any) => {
                const content = q.content_text || "";
                const ms = solMap[q.id] || "[Official syllabus marking criteria apply]";
                const totalMarks = q.marks || 9;
                return `======================================================================
QUESTION ${q.question_number} [${totalMarks} MARKS] — Topic: ${q.topic || "Exam Topic"}
======================================================================
EXAM QUESTION CONTENT:
${content}

OFFICIAL MARK SCHEME (AUTHORITATIVE EXAMINER CRITERIA & ALLOWED ANSWERS):
${ms}
======================================================================`;
              }).join("\n\n");
            }
          }
        } catch (dbErr) {
          console.warn("assess_attempt: failed to fetch paper questions from DB:", dbErr);
        }
      }

      // If specific mark_scheme was passed directly in payload, append it prominently
      if (mark_scheme && mark_scheme.trim().length > 10 && !allQuestionsContext.includes(mark_scheme.trim())) {
        allQuestionsContext += `\n\n======================================================================\nTARGET QUESTION OFFICIAL MARK SCHEME:\n${mark_scheme.trim()}\n======================================================================`;
      }

      // If still no context, use the client-provided question text.
      // No hardcoded paper content is ever injected: without stored or provided
      // content the examiner grades from the printed question on the student's sheet.
      if ((!allQuestionsContext || allQuestionsContext.length < 50) && question_text && question_text.length > 150) {
        allQuestionsContext = question_text;
      }
      if (!allQuestionsContext || allQuestionsContext.trim().length < 50) {
        allQuestionsContext = "[No stored exam paper questions or official mark schemes are available for this submission. Read the printed question text directly from the student's uploaded sheet and grade it using standard Cambridge / ZIMSEC / IB syllabus principles.]";
      }

      let rawImages: string[] = Array.isArray(payload.images) && payload.images.length > 0
        ? payload.images
        : (Array.isArray(payload.answer_files) && payload.answer_files.length > 0
          ? payload.answer_files.map((f: any) => f.base64 || f.uri).filter(Boolean)
          : (image_url ? [image_url] : []));

      const requestedModel = model_override || "gpt-4o";
      const pass1Candidates = [requestedModel, "gpt-4o-mini", "gpt-4o"];
      const pass2Candidates = [requestedModel, "gpt-4o", "gpt-4o-mini"];

      let multiPageError: string | null = null;
      if (openaiApiKey && rawImages.length >= 1) {
        try {
          console.log(`assess_attempt: submission detected (${rawImages.length} page(s)). Starting assessment with multi-subagent perception & deterministic rubric engine.`);

          // =========================================================================
          // PASS 1: BOOKLET INDEXER (Fast vision scan with gpt-6-luna to build script_map)
          // =========================================================================
          const indexPrompt = `You are the Senior Chief Examiner indexing exam booklet pages submitted by a student.
There are ${rawImages.length} scanned pages (Page 0 to Page ${rawImages.length - 1} in sequential order).

EXAM PAPER QUESTIONS & OFFICIAL MARK SCHEMES:
${allQuestionsContext}

YOUR TASK:
0. SUBMISSION AUTHENTICITY & TARGET PAPER VERIFICATION (CRITICAL MANDATORY CHECK):
   - Compare the printed question stems, headers, diagrams, and student answers on the scanned pages with the TARGET EXAM PAPER questions listed under "EXAM PAPER QUESTIONS & OFFICIAL MARK SCHEMES" above.
   - Determine whether this student submission is attempting the TARGET EXAM PAPER, or if the student uploaded answer sheets from a DIFFERENT examination paper (e.g. wrong subject, wrong year, or different syllabus/paper).
   - In your JSON response, set:
     * "is_unrelated_paper": boolean (true if the uploaded pages clearly belong to a different exam paper or unrelated topics)
     * "detected_submission_nature": "target_paper" | "unrelated_paper" | "mixed"
     * "detected_paper_summary": string explaining what paper or topic the student uploaded vs what the target paper is (e.g. 'Student uploaded Biology answers with plant cells and enzymes, but target paper is Physics 5054 Mechanics/Electricity')

1. Examine all ${rawImages.length} pages in sequential order.
2. CRITICAL: Identify where each question STARTS and ENDS.
   - Look at the question headings at the top or margins of each page (e.g. "3 (a)", "3 (c)", "4 (a)").
   - Questions frequently span multiple pages!
     For example:
     - Question 3 begins on one page (with parts 3(a), 3(b)) and continues onto another page (with parts 3(c)(i), 3(c)(ii), 3(c)(iii), 3(c)(iv)).
     - BOTH pages belong to QUESTION 3!
     - DO NOT split Question 3 into separate questions just because it continues onto another page!
3. CRITICAL SUBPART & CHRONOLOGICAL PAGE ORDERING MANDATE:
   - Students frequently upload images in random order! (e.g. uploading the page containing 3(c) BEFORE the page containing 3(a)).
   - In "spanned_pages", YOU MUST ARRANGE the pages in chronological subpart reading order:
     Part (a) MUST ALWAYS COME FIRST, followed by part (b), then part (c), then (d), etc.
   - For example: If Page 3 contains 3(c) and Page 4 contains 3(a), then for Question 3, "spanned_pages" MUST BE [4, 3], NEVER [3, 4]!
   - Under "page_details", explicitly record every page index and the subparts found on that page, along with the "earliest_subpart" (e.g. 'a', 'b', 'c').
4. Detect all questions present in the booklet and their exact pages.
5. Return strictly valid JSON matching this schema:
{
  "is_unrelated_paper": boolean,
  "detected_submission_nature": "target_paper" | "unrelated_paper" | "mixed",
  "detected_paper_summary": "string",
  "script_map": [
    {
      "question_number": "string (e.g. '1', '2', '3', '6')",
      "topic": "string",
      "start_page": number, // 0-based page index where this question begins chronologically (with earliest subpart e.g. (a))
      "end_page": number,   // 0-based page index where this question finishes chronologically
      "spanned_pages": [number], // ordered chronologically by subpart flow (e.g. [4, 3] if Page 4 has 3(a) and Page 3 has 3(c))
      "page_details": [
        {
          "page": number,
          "subparts": ["string (e.g. 'a', 'b(i)', 'b(ii)')"],
          "earliest_subpart": "string (e.g. 'a')"
        }
      ],
      "notes": "string"
    }
  ]
}`;

          const indexUserParts: any[] = [{ type: "text", text: indexPrompt }];
          rawImages.forEach((img, idx) => {
            indexUserParts.push({
              type: "text",
              text: `--- BOOKLET / SUBMISSION PAGE ${idx} ---`
            });
            indexUserParts.push({
              type: "image_url",
              image_url: { url: img, detail: "low" }
            });
          });

          const indexRes = await executeChatCompletion(openaiApiKey, pass1Candidates, {
            messages: [
              { role: "system", content: "You are the Senior Chief Examiner indexing exam booklet pages. Output strictly valid JSON." },
              { role: "user", content: indexUserParts }
            ],
            response_format: { type: "json_object" },
            temperature: 0.0
          });

          let scriptMap: any[] = [];
          let isUnrelatedSubmission = false;
          let detectedPaperSummary = "";

          if (indexRes.ok && indexRes.data?.choices?.[0]?.message?.content) {
            try {
              const cleanIndexJson = indexRes.data.choices[0].message.content.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
              const parsed = JSON.parse(cleanIndexJson);
              scriptMap = Array.isArray(parsed.script_map) ? parsed.script_map : [];
              if (parsed.is_unrelated_paper === true || parsed.submission_matches_target_paper === false || parsed.detected_submission_nature === "unrelated_paper") {
                isUnrelatedSubmission = true;
                detectedPaperSummary = parsed.detected_paper_summary || parsed.unrelated_paper_summary || "Uploaded pages belong to a different exam paper/topic.";
              }
            } catch (e) {
              console.warn("Pass 1 script_map JSON parse error:", e);
            }
          }

          // If the student uploaded answer sheets from a completely different question paper,
          // immediately assign an authoritative 0 / total score under standard exam board regulations!
          if (isUnrelatedSubmission) {
            console.log(`Pass 1 detected UNRELATED examination paper submission: ${detectedPaperSummary}`);
            const grandTotalMax = officialPaperQuestions.reduce((s: number, q: any) => s + (Number(q.marks) || 0), 0) || 60;
            const questionSummaries = (officialPaperQuestions.length > 0 ? officialPaperQuestions : [{ question_number: "1", marks: grandTotalMax, topic: "Examination Paper" }]).map((oq: any) => ({
              question_number: String(oq.question_number),
              topic: oq.topic || "Exam Topic",
              score: 0,
              max_score: Number(oq.marks) || 0,
              percentage: 0,
              spanned_pages: [],
              subparts: [],
              unattempted: true,
              notes: `Unrelated exam paper submitted (${detectedPaperSummary || 'different examination paper'}). 0 marks awarded.`
            }));

            const pages = rawImages.map((imgUrl, pIdx) => ({
              page_index: pIdx,
              original_image_url: imgUrl,
              page_score: 0,
              page_max_score: Math.round(grandTotalMax / rawImages.length) || 10,
              questions_present: [],
              annotations: [
                {
                  type: 'total_header',
                  text: `Unrelated Paper: 0/${grandTotalMax}`,
                  comment: `Submitted script belongs to a different exam paper (${detectedPaperSummary || 'different syllabus/topic'})`,
                  box_2d: [40, 680, 85, 960],
                  page_index: pIdx
                },
                {
                  type: 'cross',
                  text: '0',
                  comment: 'Unrelated paper (0 marks)',
                  box_2d: [150, 450, 250, 550],
                  page_index: pIdx
                }
              ],
              subparts: [],
              layout_regions: []
            }));

            const unrelatedAssessment: any = {
              identified_question_number: questionSummaries.map(q => q.question_number).join(', '),
              identified_topic: officialPaperQuestions[0]?.topic || "Examination Script",
              total_score: 0,
              total_max_score: grandTotalMax,
              score: 0,
              max_score: grandTotalMax,
              percentage: 0,
              subparts: [],
              layout_regions: [],
              annotations: pages.flatMap(p => p.annotations),
              question_summaries: questionSummaries,
              pages: pages,
              overall_feedback: `⚠️ UNRELATED EXAM PAPER SUBMISSION DETECTED: The answer sheets uploaded belong to a different question paper (${detectedPaperSummary || 'different syllabus/topic'}) and do not correspond to this target paper. Under standard Cambridge / Edexcel / ZIMSEC / IB examination rules, answers written for a different paper are awarded 0 out of ${grandTotalMax} marks (0%). Please ensure you upload the correct handwritten answer sheets for this specific question paper.`,
              examiner_model_solution: "Refer to the target paper's mark scheme for full official worked solutions.",
              recommended_next_step: "Upload the answer sheets corresponding to this specific question paper.",
              model_used: indexRes.modelUsed || "gpt-4o"
            };

            return new Response(JSON.stringify({
              assessment: unrelatedAssessment,
              marked_image_url: null
            }), {
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }

          if (!scriptMap || scriptMap.length === 0) {
            // Intelligent Per-Page Fallback: Each page is treated as an individual question candidate
            scriptMap = rawImages.map((_, i) => ({
              question_number: String(i + 1),
              topic: "Science / Examination Paper",
              start_page: i,
              end_page: i,
              spanned_pages: [i],
              notes: `Submission page ${i + 1}`
            }));
          } else {
            // CRITICAL LOOPHOLE CLOSURE: Ensure EVERY page in rawImages is represented in scriptMap!
            const coveredPages = new Set<number>();
            scriptMap.forEach((sm: any) => {
              (sm.spanned_pages || []).forEach((p: number) => coveredPages.add(Number(p)));
              if (typeof sm.start_page === 'number') coveredPages.add(Number(sm.start_page));
              if (typeof sm.end_page === 'number') coveredPages.add(Number(sm.end_page));
            });

            rawImages.forEach((_, pIdx) => {
              if (!coveredPages.has(pIdx)) {
                console.log(`Loophole closed: Page ${pIdx} was omitted by indexer. Adding to scriptMap.`);
                scriptMap.push({
                  question_number: String(pIdx + 1),
                  topic: "Science / Examination Script",
                  start_page: pIdx,
                  end_page: pIdx,
                  spanned_pages: [pIdx],
                  notes: `Auto-included page ${pIdx + 1}`
                });
              }
            });
          }

          console.log(`Pass 1 completed (${indexRes.modelUsed}). Found ${scriptMap.length} question clusters:`, JSON.stringify(scriptMap));

          // =========================================================================
          // CANONICAL QUESTION & SUBPART ORDER REORDERING:
          // Sort pages so that:
          // 1. Question 1 starts first, Question 2 second, etc.
          // 2. Within any multi-page question, subpart (a) starts first, (b) second, (c) third, etc.
          // Even if students upload images in completely random order (e.g. Q3c before Q3a, Q2 before Q1),
          // the marked papers are delivered and viewed in perfect chronological order!
          // =========================================================================
          scriptMap.sort((a: any, b: any) => {
            const numA = parseInt(String(a.question_number || '').replace(/[^0-9]/g, ''), 10) || 999;
            const numB = parseInt(String(b.question_number || '').replace(/[^0-9]/g, ''), 10) || 999;
            if (numA !== numB) return numA - numB;
            return getSubpartSortWeight(String(a.question_number || '')) - getSubpartSortWeight(String(b.question_number || ''));
          });

          // Helper to extract the earliest subpart weight for a specific page of a question
          const getPageSubpartWeight = (entry: any, pNum: number): number => {
            // 1. Check page_details array if returned by indexer
            if (Array.isArray(entry.page_details)) {
              const pd = entry.page_details.find((d: any) => Number(d.page) === pNum);
              if (pd) {
                const sub = pd.earliest_subpart || (Array.isArray(pd.subparts) && pd.subparts[0]);
                if (sub) return getSubpartSortWeight(sub);
              }
            }
            // 2. Parse notes string if mentions specific page e.g. "Page 4 shows part (a)"
            const notesStr = String(entry.notes || '');
            const pageMatch = notesStr.match(new RegExp(`(?:Page|P)\\s*${pNum}[^.]*?(?:part|parts|shows|contains)?\\s*\\(?([a-h])\\)?`, 'i'));
            if (pageMatch && pageMatch[1]) {
              return getSubpartSortWeight(pageMatch[1]);
            }
            return 9999;
          };

          const canonicalPageOrder: number[] = [];
          scriptMap.forEach((entry: any) => {
            const rawPages = (Array.isArray(entry.spanned_pages) ? entry.spanned_pages : [entry.start_page ?? 0])
              .map(Number)
              .filter((p: number) => !isNaN(p) && p >= 0 && p < rawImages.length);

            // Sort pages within this question by subpart sequence ('a' before 'b' before 'c')
            const sortedPages = [...rawPages].sort((p1: number, p2: number) => {
              const w1 = getPageSubpartWeight(entry, p1);
              const w2 = getPageSubpartWeight(entry, p2);
              if (w1 !== w2 && w1 !== 9999 && w2 !== 9999) {
                return w1 - w2;
              }
              // If weights equal or unknown, preserve the order returned in spanned_pages
              return rawPages.indexOf(p1) - rawPages.indexOf(p2);
            });

            // Update entry.spanned_pages to match the subpart-sorted order
            entry.spanned_pages = sortedPages;

            sortedPages.forEach((pNum: number) => {
              if (!canonicalPageOrder.includes(pNum)) {
                canonicalPageOrder.push(pNum);
              }
            });
          });

          // Append any unindexed pages at the end
          rawImages.forEach((_, idx) => {
            if (!canonicalPageOrder.includes(idx)) {
              canonicalPageOrder.push(idx);
            }
          });

          console.log("Canonical Question Page Reordering mapping (old -> new):", canonicalPageOrder);

          // Reorder rawImages so Question 1 is page 0 and 3a comes before 3c!
          rawImages = canonicalPageOrder.map((oldIdx) => rawImages[oldIdx]);

          // Remap spanned_pages, start_page, end_page in scriptMap to new 0-based indices
          scriptMap.forEach((sm: any) => {
            const remapped = (sm.spanned_pages || [sm.start_page ?? 0])
              .map((oldIdx: number) => canonicalPageOrder.indexOf(Number(oldIdx)))
              .filter((p: number) => p >= 0);
            sm.spanned_pages = remapped.length > 0 ? remapped : [0];
            sm.start_page = Math.min(...sm.spanned_pages);
            sm.end_page = Math.max(...sm.spanned_pages);
          });

          console.log("Reordered scriptMap after canonical sorting:", JSON.stringify(scriptMap));

          // =========================================================================
          // PASS 2: QUESTION-CENTRIC TARGETED GRADING (Isolated Prompt + Bound Mark Scheme)
          // =========================================================================
          const questionEvaluations = await Promise.all(
            scriptMap.map(async (qEntry: any) => {
              const qNum = String(qEntry.question_number || '1');
              const spannedPages: number[] = Array.isArray(qEntry.spanned_pages) && qEntry.spanned_pages.length > 0
                ? qEntry.spanned_pages
                : [0];

              // === STRICT TARGET-PAPER ENFORCEMENT (code-level, not model-level) ===
              // Snap the cluster's question number to the official paper's question list.
              const officialQ = officialPaperQuestions.find((oq: any) => {
                const oNum = String(oq.question_number).trim();
                const cNum = qNum.trim();
                if (oNum === cNum) return true;
                const leadingDigits = cNum.match(/^\d+/)?.[0];
                return !!leadingDigits && oNum === leadingDigits;
              });
              const officialMarks = officialQ ? (Number(officialQ.marks) || 0) : 0;
              const isUnmatchedQuestion = officialPaperQuestions.length > 0 && !officialQ;

              // A cluster whose question number does not exist in the paper being marked
              // is graded 0 with a note — it can never be marked against another paper.
              if (isUnmatchedQuestion) {
                console.log(`Strict enforcement: Question ${qNum} does not exist in the target paper. Awarding 0 with note.`);
                return {
                  identified_question_number: qNum,
                  question_number: qNum,
                  identified_topic: qEntry.topic || "Unmatched",
                  total_score: 0,
                  score: 0,
                  total_max_score: 0,
                  max_score: 0,
                  percentage: 0,
                  unmatched: true,
                  subparts: [],
                  annotations: [],
                  layout_regions: [],
                  spanned_pages: spannedPages,
                  start_page: Math.min(...spannedPages),
                  end_page: Math.max(...spannedPages),
                  overall_feedback: `The pages assigned to Question ${qNum} do not correspond to any question in this paper, so they were graded 0.`,
                  examiner_model_solution: "",
                  recommended_next_step: "Upload the answer sheets corresponding to this specific question paper.",
                  model_used: "code-enforcement"
                };
              }

              // Tool Call: Retrieve official mark scheme for this specific question from DB or syllabus
              const schemeData = await getQuestionMarkScheme(
                supabaseClient,
                paperId,
                qNum,
                context,
                mark_scheme
              );

              // Note: Relevance is checked directly by Subagent 1 (Visual Perception Agent)
              // which examines the student's handwritten script against Question qNum.
              let relevanceBlocked = false;
              let relevanceReason = "";

              // Grade the whole cluster (all spanned pages) — wrapped in a local function so
              // an under-graded result can be detected and retried (completeness check below).
              const gradeCluster = async (): Promise<any> => {
              // Evaluate EACH page of this question with dedicated focus so that NO subpart on ANY page is ever missed!
              const pageEvals = await Promise.all(
                spannedPages.map(async (pIdx: number) => {
                  // PASS 1 FOR THIS PAGE: Pedagogical Examiner Agent (focused marking with gpt-6-luna)
                  console.log(`Page ${pIdx}: Running Pass 1 (Examiner Agent with gpt-6-luna)...`);
                  const targetedPrompt = buildTargetedQuestionGradingPrompt(
                    qNum,
                    schemeData,
                    student_answer || document_text,
                    spannedPages,
                    pIdx,
                    allQuestionsContext
                  );

                  const qUserParts: any[] = [{ type: "text", text: targetedPrompt }];
                  // Primary target page image to evaluate
                  if (rawImages[pIdx]) {
                    qUserParts.push({
                      type: "text",
                      text: `--- PRIMARY BOOKLET PAGE TO GRADE: PAGE ${pIdx} (Target Question ${qNum}) ---`
                    });
                    qUserParts.push({
                      type: "image_url",
                      image_url: { url: rawImages[pIdx], detail: "high" }
                    });
                  }
                  // Secondary reference pages (if any other pages in spannedPages)
                  spannedPages.forEach((refIdx) => {
                    if (refIdx !== pIdx && rawImages[refIdx]) {
                      qUserParts.push({
                        type: "text",
                        text: `--- REFERENCE CONTEXT: BOOKLET PAGE ${refIdx} ---`
                      });
                      qUserParts.push({
                        type: "image_url",
                        image_url: { url: rawImages[refIdx], detail: "low" }
                      });
                    }
                  });

                  try {
                    const qRes = await executeChatCompletion(openaiApiKey, pass2Candidates, {
                      messages: [
                        { role: "system", content: `You are the Mentora Senior Chief Examiner. Evaluate and mark student handwriting on Page ${pIdx} strictly against Question ${qNum} of the TARGET PAPER. MANDATORY RELEVANCE: Marks are ONLY awarded for answers that genuinely attempt Question ${qNum}. If the student wrote an answer to a different question, or if this sheet belongs to a different exam paper/topic, you MUST award ZERO (0) marks for all subparts. Never award marks for coincidental words, standard units, or generic formulas. Output strictly valid JSON.` },
                        { role: "user", content: qUserParts }
                      ],
                      response_format: { type: "json_object" },
                      temperature: 0.0
                    });

                    if (qRes.ok && qRes.data?.choices?.[0]?.message?.content) {
                      const cleanQJson = qRes.data.choices[0].message.content.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
                      const parsed = JSON.parse(cleanQJson);
                      parsed.model_used = qRes.modelUsed;

                      // Enforce zero marks if question evaluation detected unrelated work or different paper
                      if (parsed.is_attempting_target_question === false || parsed.is_unrelated_paper === true) {
                        parsed.total_score = 0;
                        parsed.score = 0;
                        if (Array.isArray(parsed.subparts)) {
                          parsed.subparts.forEach((sp: any) => {
                            sp.score = 0;
                            sp.marks_awarded = [];
                            sp.deductions = [`Work belongs to a different question or paper; does not attempt Question ${qNum} (0 marks).`];
                            sp.teacher_correction_note = "Unrelated question/paper — 0 marks";
                            if (Array.isArray(sp.marking_points)) {
                              sp.marking_points.forEach((mp: any) => { mp.is_earned = false; });
                            }
                          });
                        }
                      }

                      if (Array.isArray(parsed.subparts)) {
                        parsed.subparts.forEach((sp: any) => {
                          sp.page_index = pIdx; // Enforce exact target page binding!
                          const notesLower = `${sp.student_answer_detected || ''} ${sp.teacher_correction_note || ''} ${sp.deductions?.join(' ') || ''}`.toLowerCase();
                          if (notesLower.includes('different paper') || notesLower.includes('unrelated paper') || notesLower.includes('different question') || notesLower.includes('unrelated question') || notesLower.includes('unrelated topic')) {
                            sp.score = 0;
                            sp.marks_awarded = [];
                          }
                        });
                      }

                      // PASS 2 FOR THIS PAGE: Visual Grounding & Positioning Agent (spatial localization with gpt-6-luna)
                      let pageGrounding: VisualGroundingResult | null = null;
                      if (rawImages[pIdx] && Array.isArray(parsed.subparts) && parsed.subparts.length > 0) {
                        console.log(`Page ${pIdx}: Running Pass 2 (Visual Grounding Agent with gpt-6-luna)...`);
                        pageGrounding = await groundEvaluatedMarks(
                          openaiApiKey,
                          pass1Candidates,
                          rawImages[pIdx],
                          parsed.subparts,
                          qNum
                        );
                        if (pageGrounding) {
                          console.log(`Page ${pIdx}: Pass 2 grounding detected ${pageGrounding.subpart_groundings.length} subparts and ${pageGrounding.diagram_regions.length} diagrams.`);
                        }
                      }

                      // Master synthesis: apply grounded coordinates, synthesize point-by-point inline ticks, margin badges, and comments
                      applyVisualGroundingToAssessment(parsed, pageGrounding, qNum, pIdx);

                      return parsed;
                    }
                  } catch (pErr) {
                    console.warn(`Error grading Question ${qNum} on Page ${pIdx}:`, pErr);
                  }
                  return null;
                })
              );

              const validPageEvals = pageEvals.filter(Boolean);
              if (validPageEvals.length === 0) return null;

              // Aggregate all subparts and annotations across all pages of this question
              const allQSubparts = validPageEvals.flatMap((pe: any) => pe.subparts || []);
              const allQAnnotations = validPageEvals.flatMap((pe: any) => pe.annotations || []);

              // Normalize subparts and enforce anti-hallucination / zero over-correction rules
              allQSubparts.forEach((sp: any) => {
                const spMax = Number(sp.max_score) || 1;
                sp.score = Math.max(0, Math.min(Number(sp.score) || 0, spMax));

                // Anti-overcorrection rule: full marks require no correction notes
                if (sp.score === spMax) {
                  sp.teacher_correction_note = "";
                  sp.constructive_correction = "";
                  sp.mistake_details = "";
                  sp.misconception_analysis = "";
                  sp.how_to_improve = "";
                }

                if (Array.isArray(sp.marking_points)) {
                  sp.marking_points.forEach((mp: any) => {
                    if (typeof mp.page_index !== 'number') {
                      mp.page_index = sp.page_index;
                    }
                  });
                }
              });

              // Strictly sort subparts in chronological order so 3(a) comes before 3(b) comes before 3(c)
              allQSubparts.sort((a: any, b: any) => {
                const wA = getSubpartSortWeight(a.part_label || '');
                const wB = getSubpartSortWeight(b.part_label || '');
                return wA - wB;
              });

              // Deduplicate subparts across pages for this question using canonical subpart keys.
              // Under Cambridge/GCSE rules, repeated attempts at the same subpart do not award double marks:
              // the student receives the score of their best attempt for each subpart.
              const subpartsByCanonicalKey = new Map<string, any[]>();
              allQSubparts.forEach((sp: any) => {
                const key = getCanonicalSubpartKey(sp.part_label);
                if (!subpartsByCanonicalKey.has(key)) {
                  subpartsByCanonicalKey.set(key, []);
                }
                subpartsByCanonicalKey.get(key)!.push(sp);
              });

              let canonicalScoreSum = 0;
              let canonicalMaxSum = 0;

              subpartsByCanonicalKey.forEach((partsList) => {
                const bestScore = Math.max(...partsList.map((p: any) => Number(p.score) || 0));
                const partMax = Math.max(...partsList.map((p: any) => Number(p.max_score) || 1));
                canonicalScoreSum += bestScore;
                canonicalMaxSum += partMax;
              });

              // Direct sum of all subparts for this question
              const allEarnedSum = allQSubparts.reduce((sum: number, sp: any) => sum + (Number(sp.score) || 0), 0);
              // STRICT: the question's max comes ONLY from the official paper (DB) —
              // the model may never inflate it by inventing subpart max scores.
              const maxPossible = officialMarks > 0
                ? officialMarks
                : (schemeData.found && schemeData.marks ? schemeData.marks : (canonicalMaxSum || validPageEvals[0]?.total_max_score || 10));
              
              // If all subparts are on a single page, or if all subparts are distinct, use the accurate earned sum
              const resolvedScore = (spannedPages.length <= 1 && allEarnedSum > 0)
                ? allEarnedSum
                : Math.max(canonicalScoreSum, (subpartsByCanonicalKey.size === allQSubparts.length ? allEarnedSum : canonicalScoreSum));

              const finalQScore = Math.min(maxPossible, resolvedScore);

              return {
                identified_question_number: qNum,
                question_number: qNum,
                identified_topic: validPageEvals[0]?.identified_topic || schemeData.topic || "Science",
                total_score: finalQScore,
                score: finalQScore,
                total_max_score: maxPossible,
                max_score: maxPossible,
                percentage: maxPossible > 0 ? Math.round((finalQScore / maxPossible) * 100) : 0,
                subparts: allQSubparts,
                annotations: allQAnnotations,
                layout_regions: validPageEvals.flatMap((pe: any) => pe.layout_regions || []),
                spanned_pages: spannedPages,
                start_page: Math.min(...spannedPages),
                end_page: Math.max(...spannedPages),
                overall_feedback: validPageEvals.map((pe: any) => pe.overall_feedback).filter(Boolean).join(' ') || "",
                examiner_model_solution: validPageEvals[0]?.examiner_model_solution || "",
                recommended_next_step: validPageEvals[0]?.recommended_next_step || "",
                model_used: validPageEvals[0]?.model_used || "gpt-4o"
              };
              }; // end gradeCluster

              let clusterResult = await gradeCluster();

              // === SUBAGENT 1: VISUAL PERCEPTION AGENT (The Examiner's Eyes) ===
              // Before judging any rubric criteria, Subagent 1 inventories the student's
              // handwritten text, calculations, mathematical working, and drawn diagrams/graphs
              // across the question's spanned pages. It strictly records what is physically
              // present on the page without judging correctness or computing scores.
              let questionPerception: QuestionPerceptionResult | null = null;
              try {
                if (Array.isArray(clusterResult?.subparts) && clusterResult.subparts.length > 0) {
                  const expectedSubsForPerception = clusterResult.subparts.map((sp: any) => ({
                    label: String(sp.part_label || '').replace(/^\(?|\)?$/g, ''),
                    marks: Number(sp.max_score) || 1
                  }));
                  const perceptionPrompt = buildPerceptionPrompt(
                    qNum,
                    expectedSubsForPerception,
                    schemeData.topic,
                    schemeData.content_text
                  );
                  const perceptionUserParts: any[] = [{ type: "text", text: perceptionPrompt }];
                  for (const fp of spannedPages) {
                    if (rawImages[fp]) {
                      perceptionUserParts.push({ type: "text", text: `--- STUDENT SCRIPT PAGE ${fp} (Question ${qNum}) ---` });
                      perceptionUserParts.push({ type: "image_url", image_url: { url: rawImages[fp], detail: "high" } });
                    }
                  }

                  const perceptionRes = await executeChatCompletion(openaiApiKey, pass2Candidates, {
                    messages: [
                      { role: "system", content: "You are the Senior Chief Examiner's Perception Specialist. Strictly record physical handwriting, math working, diagrams, and selections on the page. Do NOT score or judge correctness. Output strictly valid JSON." },
                      { role: "user", content: perceptionUserParts }
                    ],
                    response_format: { type: "json_object" },
                    temperature: 0.0,
                    seed: 42
                  });

                  if (perceptionRes.ok && perceptionRes.data?.choices?.[0]?.message?.content) {
                    const cleanPerception = perceptionRes.data.choices[0].message.content
                      .replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
                    questionPerception = JSON.parse(cleanPerception) as QuestionPerceptionResult;
                    console.log(`Q${qNum}: Subagent 1 (Visual Perception) inventoried ${questionPerception?.subparts?.length || 0} subparts.`);
                    if (questionPerception && questionPerception.is_attempting_target_question === false) {
                      console.log(`Q${qNum}: Subagent 1 determined student work is unrelated (${questionPerception.relevance_reason || 'unrelated'}).`);
                      clusterResult.score = 0;
                      clusterResult.total_score = 0;
                      clusterResult.relevance_blocked = true;
                      if (Array.isArray(clusterResult.subparts)) {
                        clusterResult.subparts.forEach((sp: any) => {
                          sp.score = 0;
                          sp.marks_awarded = [];
                          sp.deductions = [`Work does not attempt Question ${qNum}: ${questionPerception?.relevance_reason || 'unrelated'}`];
                          sp.teacher_correction_note = "Unrelated question/paper — 0 marks";
                        });
                      }
                    }
                  }
                }
              } catch (perceptErr) {
                console.warn(`Subagent 1 (Visual Perception) failed for Q${qNum} (falling back to cluster detected text):`, perceptErr);
              }

              // === SUBAGENT 2 & DETERMINISTIC ENGINE: PER-SUBPART EVALUATION ===
              try {
                if (schemeData.official_mark_scheme && Array.isArray(clusterResult?.subparts) && clusterResult.subparts.length > 0) {
                  const refined = await Promise.all(clusterResult.subparts.map(async (sp: any) => {
                    if (!sp?.part_label) return sp;
                    const label = String(sp.part_label).replace(/^\(?|\)?$/g, '');
                    // SINGLE PARSER: the rubric engine's own parseRubric is the sole
                    // source of structural truth.
                    const rubricCheck = parseRubric(label, schemeData.official_mark_scheme);
                    const hasCriteria = rubricCheck.criteria.length >= 1 || rubricCheck.criteria.some((c: any) => c.isLevel);
                    if (!hasCriteria) {
                      if (rubricCheck.criteria.length === 0 && String(schemeData.official_mark_scheme || '').trim().length > 50) {
                        console.warn(`⚠️ RUBRIC PARSE WARNING: Q${qNum}(${label}) — stored mark scheme has ${String(schemeData.official_mark_scheme).length} chars but parsed to 0 criteria. Unknown dialect? Engine skipped; cluster marks stand.`);
                        sp.rubric_parse_warning = 'stored mark scheme could not be parsed (unknown format) — deterministic engine skipped';
                      }
                      return sp;
                    }

                    // Printed marks for this subpart: prefer the STORED part data from DB,
                    // then rubric text, then cluster's own max.
                    let printedMax: number | null = null;
                    try {
                      if (officialQ?.id && supabaseClient) {
                        const labelClean = String(label).toLowerCase().replace(/[^a-z0-9]/g, '');
                        const { data: dbParts } = await supabaseClient
                          .from("question_parts")
                          .select("part_label, marks")
                          .eq("question_id", officialQ.id);
                        const dbPart = (dbParts || []).find((p: any) =>
                          String(p.part_label).toLowerCase().replace(/[^a-z0-9]/g, '') === labelClean);
                        if (dbPart && Number(dbPart.marks) > 0) printedMax = Number(dbPart.marks);
                      }
                    } catch (dbPartErr) {
                      console.warn(`Q${qNum}(${label}): stored part lookup failed:`, dbPartErr);
                    }
                    if (printedMax === null) printedMax = subpartMarksFromRubric(schemeData.official_mark_scheme, label);

                    const clusterScore = Number(sp.score) || 0;
                    const clusterMax = Number(sp.max_score) || 1;

                    const focusPages = Array.from(new Set([
                      ...(typeof sp.page_index === 'number' ? [sp.page_index] : []),
                      ...spannedPages
                    ])).filter((p: number) => rawImages[p]);

                    // Match perceived work from Subagent 1
                    const normLabel = (l: string) => String(l || '').toLowerCase().replace(/[^a-z0-9]/g, '');
                    const perceivedSubpart = questionPerception?.subparts?.find((p: ObservedSubpartWork) => {
                      const pl = normLabel(p.part_label);
                      const sl = normLabel(label);
                      return pl === sl || pl.endsWith(sl) || sl.endsWith(pl);
                    });

                    const subpartPerception: SubpartPerceptionDetails = {
                      written_text: perceivedSubpart?.written_text || String(sp.student_answer_detected || ''),
                      math_steps: perceivedSubpart?.math_steps || [],
                      diagram_features: perceivedSubpart?.diagram_features || [],
                      selections: perceivedSubpart?.selections || []
                    };

                    if (perceivedSubpart?.written_text && !sp.student_answer_detected) {
                      sp.student_answer_detected = perceivedSubpart.written_text;
                    }

                    // === DETERMINISTIC RUBRIC ENGINE (two-stage) ===
                    // Stage A (LLM Subagent 2): judge each rubric criterion — satisfied? with concrete evidence.
                    // Stage B (code): compute the score via overlap-aware, capped arithmetic.
                    const rubricParsed = parseRubric(label, schemeData.official_mark_scheme);
                    const overlapMemberGroups = new Map<number, number[]>();
                    rubricParsed.criteria.forEach((c: any) => {
                      const g = c.overlapGroup ?? c.index;
                      if (!overlapMemberGroups.has(g)) overlapMemberGroups.set(g, []);
                      overlapMemberGroups.get(g)!.push(c.index);
                    });
                    const overlapGroups = [...overlapMemberGroups.entries()]
                      .filter(([, members]) => members.length > 1)
                      .map(([group, members]) => ({ group, memberIndices: members }));

                    const evalPrompt = buildCriterionEvaluationPrompt(
                      qNum,
                      label,
                      rubricParsed.criteria.map((c: any) => ({ index: c.index, code: c.code, value: c.value, text: c.text, isLevel: c.isLevel, guidance: c.guidance || '' })),
                      printedMax ?? clusterMax,
                      overlapGroups,
                      subpartPerception
                    );

                    const subUserParts: any[] = [{ type: "text", text: evalPrompt }];
                    for (const fp of focusPages) {
                      subUserParts.push({ type: "text", text: `--- STUDENT SCRIPT PAGE ${fp} (find part (${label}) of Question ${qNum}) ---` });
                      subUserParts.push({ type: "image_url", image_url: { url: rawImages[fp], detail: "high" } });
                    }

                    try {
                      console.log(`Q${qNum}(${label}): Subagent 2 (Rubric Judge) evaluating (${rubricParsed.criteria.length} criteria, ${overlapGroups.length} overlap groups)...`);

                    // Evaluator function for Subagent 2
                    const evalOnce = async (voteIdx: number): Promise<any[] | null> => {
                      const subRes = await executeChatCompletion(openaiApiKey, pass2Candidates, {
                        messages: [
                          { role: "system", content: `You are the Mentora Senior Chief Examiner. Judge EACH criterion of subpart (${label}) of Question ${qNum} independently against the student's answer (handwriting, calculations, or drawn diagrams). Universal Benefit of the Doubt (BOD) and scientific equivalence apply. Concrete evidence (verbatim phrase, math calculation step, or drawn diagram feature) is MANDATORY for every satisfied verdict — if not demonstrated in the student's work, verdict is satisfied: false with evidence: "". Output strictly valid JSON.` },
                          { role: "user", content: subUserParts }
                        ],
                        response_format: { type: "json_object" },
                        temperature: 0.0,
                        seed: 42 + voteIdx
                      });
                      if (!subRes.ok || !subRes.data?.choices?.[0]?.message?.content) return null;
                      try {
                        const cleanSub = subRes.data.choices[0].message.content.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
                        const subParsed = JSON.parse(cleanSub);
                        const rv: any[] = Array.isArray(subParsed.verdicts) ? subParsed.verdicts : [];
                        return rv.map((v: any) => ({
                          criterionIndex: Number(v.criterion_index),
                          satisfied: !!v.satisfied && !!(String(v.evidence || '').trim().length > 0),
                          evidence: String(v.evidence || '').trim()
                        }));
                      } catch (_) { return null; }
                    };

                    const voteRounds = rubricParsed.schemeType === 'levels' ? 3 : 1;
                    const voteResults = (await Promise.all(
                      Array.from({ length: voteRounds }, (_, vi) => evalOnce(vi))
                    )).filter(Boolean) as any[][];

                    if (voteResults.length > 0) {
                      const allIndices = new Set<number>();
                      voteResults.forEach(votes => votes.forEach(v => allIndices.add(v.criterionIndex)));
                      const validatedVerdicts = [...allIndices].map((idx: number) => {
                        const perCriterion = voteResults.map(votes => votes.find(v => v.criterionIndex === idx)).filter(Boolean) as any[];
                        const yes = perCriterion.filter(v => v.satisfied).length;
                        const satisfied = perCriterion.length > 0 && yes * 2 > perCriterion.length; // strict majority
                        const firstYes = perCriterion.find(v => v.satisfied);
                        return { criterionIndex: idx, satisfied, evidence: firstYes?.evidence || '' };
                      });

                      const studentAns = String(sp.student_answer_detected || subpartPerception?.written_text || '').trim();
                      const criterionByIndex = new Map(rubricParsed.criteria.map((c: any) => [c.index, c]));

                      // Deterministic algebraic & numerical pre-pass:
                      // If student's answer text directly matches the criterion target (e.g. "(x+3)/(2y+5)" or "150"),
                      // ensure satisfied is true so LLM stochasticity or formatting differences cannot deduct marks!
                      validatedVerdicts.forEach((v: any) => {
                        const c = criterionByIndex.get(v.criterionIndex);
                        if (c && !v.satisfied && studentAns) {
                          if (isAlgebraicMatch(studentAns, c.text)) {
                            v.satisfied = true;
                            v.evidence = studentAns;
                          }
                        }
                      });

                      // === DETERMINISTIC SCORE (overlap-aware, capped at printed max) ===
                      const engineScore = computeSubpartScore(
                        rubricParsed,
                        validatedVerdicts.map(v => ({ criterionIndex: v.criterionIndex, satisfied: v.satisfied })),
                        printedMax ?? Math.max(clusterMax, 1)
                      );
                      const subScore = engineScore.score;
                      const subMax = printedMax ?? Math.max(clusterMax, 1);
                      const isFullMarks = subScore >= subMax;
                      const waivedSet = new Set(engineScore.waivedFallbacks || []);

                      // Map verdicts back into marking_points for the annotation layer
                      const engineMarkingPoints = validatedVerdicts.map((v: any) => {
                        const c = criterionByIndex.get(v.criterionIndex) || {} as any;
                        const isWaived = waivedSet.has(v.criterionIndex) || (isFullMarks && c.isFallback);
                        return {
                          point_number: v.criterionIndex + 1,
                          criterion: c.text || '',
                          mark_code: c.code || 'B1',
                          is_earned: v.satisfied || isWaived,
                          student_phrase: v.satisfied ? (v.evidence || '') : (isWaived ? 'Waived (primary criterion earned full marks)' : ''),
                          flawed_phrase: '',
                          page_index: typeof sp.page_index === 'number' ? sp.page_index : focusPages[0]
                        };
                      });

                      const unearnedCriteria = validatedVerdicts
                        .filter((v: any) => !v.satisfied && !waivedSet.has(v.criterionIndex))
                        .map((v: any) => {
                          const c = criterionByIndex.get(v.criterionIndex) as any;
                          return c?.text ? `Missed [${c.code || 'Mark'}]: ${c.text}` : '';
                        }).filter(Boolean);

                      const resolvedDeductions = isFullMarks
                        ? []
                        : (Array.isArray(sp.deductions) && sp.deductions.length > 0
                            ? sp.deductions
                            : (unearnedCriteria.length > 0
                                ? unearnedCriteria
                                : [`Lost ${subMax - subScore} mark(s) on incomplete criteria or working.`]));

                      console.log(`Q${qNum}(${label}): Subagent 2 score ${subScore}/${subMax} replaces cluster ${clusterScore}/${clusterMax}.`);
                      return {
                        ...sp,
                        score: subScore,
                        max_score: subMax,
                        student_answer_detected: sp.student_answer_detected,
                        marking_points: engineMarkingPoints,
                        teacher_correction_note: isFullMarks ? '' : sp.teacher_correction_note,
                        deductions: resolvedDeductions,
                        mistake_details: isFullMarks ? '' : (sp.mistake_details || (unearnedCriteria.length > 0 ? unearnedCriteria.join('; ') : '')),
                        misconception_analysis: isFullMarks ? '' : sp.misconception_analysis,
                        constructive_correction: isFullMarks ? '' : sp.constructive_correction,
                        marks_awarded: validatedVerdicts.filter((v: any) => v.satisfied).map((v: any) => {
                          const c = criterionByIndex.get(v.criterionIndex) as any;
                          return c?.text || '';
                        }),
                        focused_agent: true,
                        rubric_engine: true,
                        overlap_capped: engineScore.cappedByOverlap
                      };
                    }
                  } catch (subErr) {
                    console.warn(`Q${qNum}(${label}) criterion evaluation failed (keeping cluster result):`, subErr);
                  }
                  return sp;
                }));
                clusterResult.subparts = refined;

                  // === BADGE & STAMP RESYNCHRONIZATION ===
                  // The annotation layer (margin badges, inline ticks, Q-total stamps) was
                  // synthesized from the CLUSTER scores before refinement. Update every
                  // mark badge to the refined score and drop stale inline ticks whose
                  // points no longer exist, so the rendered paper shows the actual marks.
                  const refinedByLabel = new Map<string, any>();
                  refined.forEach((x: any) => refinedByLabel.set(String(x.part_label || '').toLowerCase(), x));

                  if (Array.isArray(clusterResult.annotations)) {
                    clusterResult.annotations = clusterResult.annotations.map((ann: any) => {
                      const target = refinedByLabel.get(String(ann.subpart_label || '').toLowerCase());
                      if (!target) return ann;
                      if (ann.type === 'mark_badge') {
                        const newText = `(${target.score}/${target.max_score})`;
                        if (ann.text !== newText) {
                          return {
                            ...ann,
                            text: newText,
                            comment: target.score > 0
                              ? (target.marks_awarded?.[0] || `Part ${target.part_label}: ${target.score}/${target.max_score} marks`)
                              : (target.deductions?.[0] || `Part ${target.part_label}: 0/${target.max_score} marks`)
                          };
                        }
                        return ann;
                      }
                      if (ann.type === 'inline_tick' || ann.type === 'tick') {
                        // Drop ticks that no longer correspond to an earned refined point
                        const earnedPhrases = new Set(
                          (target.marking_points || [])
                            .filter((mp: any) => mp.is_earned)
                            .map((mp: any) => String(mp.student_phrase || mp.criterion || '').toLowerCase().slice(0, 30))
                        );
                        const tickText = String(ann.comment || ann.text || '').toLowerCase().slice(0, 30);
                        if (earnedPhrases.size > 0 && ![...earnedPhrases].some(p => tickText.includes(p.slice(0, 15)) || p.includes(tickText))) {
                          return null; // stale tick — remove
                        }
                      }
                      return ann;
                    }).filter(Boolean);
                  }

                  // Recompute the cluster totals from the refined subparts
                  const refinedScore = refined.reduce((s: number, x: any) => s + (Number(x.score) || 0), 0);
                  const refinedMax = refined.reduce((s: number, x: any) => s + (Number(x.max_score) || 0), 0);
                  if (refinedMax > 0) {
                    clusterResult.total_score = refinedScore;
                    clusterResult.score = refinedScore;
                    clusterResult.total_max_score = refinedMax;
                    clusterResult.max_score = refinedMax;
                    clusterResult.percentage = Math.round((refinedScore / refinedMax) * 100);
                  }
                }
              } catch (refineErr) {
                console.warn(`Per-subpart refinement failed for Q${qNum} (keeping cluster result):`, refineErr);
              }

              return clusterResult;
            })
          );

          const validQuestions = questionEvaluations.filter(Boolean);

          // =========================================================================
          // PASS 3: PAGE AGGREGATION & RECONCILED BOOKLET TOTALS
          // =========================================================================
          const allSubparts: any[] = [];
          const allAnnotations: any[] = [];
          const questionSummaries: any[] = [];
          let grandTotalScore = 0;
          // grandTotalMax is computed from the answer rules at the end of aggregation:
          // "answer all" papers sum every question (legacy); sectioned papers sum the
          // effective total (required sections + best-N of elective sections).
          const hasAnswerRules = !!paperAnswerRules && (
            (paperAnswerRules.sections && paperAnswerRules.sections.length > 0) ||
            paperAnswerRules.default_rule === 'any'
          );

          // NOTE: `officialPaperQuestions` is fetched once at the top of assess_attempt
          // (already sorted numerically). Do NOT re-declare it here — shadowing it with a
          // second `let` puts the earlier uses in this block into the temporal dead zone.

          // Build the official marks lookup — STRICT: totals come from the DB, never the model
          const officialMarksMap = new Map<string, number>();
          officialPaperQuestions.forEach((oq: any) => {
            officialMarksMap.set(String(oq.question_number).trim(), Number(oq.marks) || 0);
          });

          // Build a set of question numbers the student actually attempted (snapped to official
          // numbering). Gated/unmatched evaluations still leave their question "unattempted" so
          // its official marks are added to the booklet total by the loop below.
          const attemptedQNums = new Set(
            validQuestions
              .filter((q: any) => q.unmatched !== true && q.relevance_blocked !== true)
              .map((q: any) => {
                const qn = String(q.identified_question_number || q.question_number || "").trim();
                return qn.match(/^\d+/)?.[0] || qn;
              })
          );

          // Add zero-score entries for every unattempted official question
          if (officialPaperQuestions.length > 0) {
            for (const oq of officialPaperQuestions) {
              const oqNum = String(oq.question_number);
              if (!attemptedQNums.has(oqNum)) {
                questionSummaries.push({
                  question_number: oqNum,
                  topic: oq.topic || "Exam Topic",
                  score: 0,
                  max_score: Number(oq.marks) || 0,
                  percentage: 0,
                  spanned_pages: [],
                  subparts: [],
                  unattempted: true
                });
              }
            }
          }

          const seenOfficialQs = new Set<string>();
          validQuestions.forEach((qEval: any) => {
            const rawQNum = String(qEval.identified_question_number || qEval.question_number || "1").trim();
            const snappedQNum = rawQNum.match(/^\d+/)?.[0] || rawQNum;
            const officialMax = officialMarksMap.get(snappedQNum) ?? officialMarksMap.get(rawQNum);
            const qScore = Number(qEval.total_score ?? qEval.score ?? 0);
            const isUnmatched = qEval.unmatched === true || (officialPaperQuestions.length > 0 && officialMax === undefined);

            // STRICT: per-question max comes ONLY from the official paper marks (DB) — never the model.
            // Unmatched questions (not part of this paper) contribute 0/0 and never inflate the total.
            const qMax = officialMax !== undefined
              ? officialMax
              : (isUnmatched ? 0 : Number(qEval.total_max_score ?? qEval.max_score ?? 10));

            const wasGraded = !isUnmatched && qEval.relevance_blocked !== true;
            grandTotalScore += wasGraded ? qScore : 0;
            // NOTE: grandTotalMax is computed once after aggregation from the answer
            // rules (see below) — never accumulated per-question here.

            // Gated/unmatched evaluations merge into the unattempted summary the loop above created
            const existingUnattempted = questionSummaries.find((qs: any) => {
              const qsNum = String(qs.question_number).trim();
              return qs.unattempted && (qsNum === snappedQNum || (qsNum.match(/^\d+/)?.[0] || qsNum) === snappedQNum);
            });
            if (existingUnattempted && (isUnmatched || qEval.relevance_blocked === true)) {
              existingUnattempted.notes = existingUnattempted.notes || (isUnmatched
                ? "Content does not correspond to any question in this paper. 0 marks awarded."
                : ((qEval.overall_feedback || "").slice(0, 160) || "Answers did not correspond to this question. 0 marks awarded."));
              existingUnattempted.spanned_pages = (qEval.spanned_pages && qEval.spanned_pages.length > 0) ? qEval.spanned_pages : existingUnattempted.spanned_pages;
            } else {
            // Merge duplicate summaries for the same official question (best attempt wins)
            const existingSummary = questionSummaries.find((qs: any) => {
              const qsNum = String(qs.question_number).trim();
              return !qs.unattempted && (qsNum === snappedQNum || (qsNum.match(/^\d+/)?.[0] || qsNum) === snappedQNum);
            });
            if (existingSummary) {
              existingSummary.score = Math.max(Number(existingSummary.score) || 0, isUnmatched ? 0 : qScore);
              existingSummary.subparts = [...(existingSummary.subparts || []), ...(qEval.subparts || [])];
              existingSummary.spanned_pages = Array.from(new Set([...(existingSummary.spanned_pages || []), ...(qEval.spanned_pages || [])]));
              existingSummary.percentage = existingSummary.max_score > 0 ? Math.round((existingSummary.score / existingSummary.max_score) * 100) : 0;
            } else {
              questionSummaries.push({
                question_number: rawQNum,
                topic: qEval.identified_topic || qEval.topic || "Exam Topic",
                score: isUnmatched ? 0 : qScore,
                max_score: qMax,
                percentage: qMax > 0 ? Math.round((isUnmatched ? 0 : qScore) / qMax * 100) : 0,
                spanned_pages: qEval.spanned_pages || [0],
                subparts: qEval.subparts || [],
                unmatched: isUnmatched || undefined,
                notes: isUnmatched ? "Content does not correspond to any question in this paper. 0 marks awarded." : undefined
              });
            }
            }

            if (Array.isArray(qEval.subparts)) {
              allSubparts.push(...qEval.subparts);
            }
            if (Array.isArray(qEval.annotations)) {
              allAnnotations.push(...qEval.annotations);
            }
          });

          // =========================================================================
          // BOOKLET TOTAL — ANSWER-RULES AWARE (effective total)
          // "Answer all" papers: sum of all official questions (legacy, no regression).
          // Sectioned / "any N" papers: required sections sum fully; elective sections
          // contribute their best-N question marks. The student's earned score also
          // keeps only the best N of over-answered elective questions.
          // =========================================================================
          let grandTotalMax: number;
          if (hasAnswerRules && officialPaperQuestions.length > 0) {
            grandTotalMax = computeEffectiveBookletTotal(officialPaperQuestions, paperAnswerRules);
            const rulesEarned = computeEffectiveEarnedScore(validQuestions, officialPaperQuestions, paperAnswerRules);
            if (rulesEarned > grandTotalScore) grandTotalScore = rulesEarned;
            grandTotalScore = Math.min(grandTotalScore, grandTotalMax);
            console.log(`Answer rules applied: effective booklet total ${grandTotalMax} (full paper sum: ${officialPaperQuestions.reduce((s: number, q: any) => s + (Number(q.marks) || 0), 0)})`);
          } else {
            grandTotalMax = officialPaperQuestions.length > 0
              ? officialPaperQuestions.reduce((s: number, q: any) => s + (Number(q.marks) || 0), 0)
              : validQuestions.reduce((s: number, q: any) => s + (Number(q.total_max_score ?? q.max_score ?? 0) || 10), 0);
          }

          // Build per-page evaluations
          const pages: any[] = rawImages.map((imgUrl, pIdx) => {
            const isLastPage = pIdx === rawImages.length - 1;
            const pageSubparts = allSubparts.filter((sp: any) => sp.page_index === pIdx);
            const pageScore = pageSubparts.reduce((sum: number, sp: any) => sum + (Number(sp.score) || 0), 0);
            const pageMax = pageSubparts.reduce((sum: number, sp: any) => sum + (Number(sp.max_score) || 0), 0) || 5;

            const pageAnnotations = allAnnotations.filter((ann: any) => ann.page_index === pIdx);

            // 1–2. Per-question "Q Total" badges and "Cont." labels are intentionally NOT
            // generated anymore — they cluttered every page's top. Per-question scores live
            // in the subpart margin badges (✓ 2/2) and the explanations panel.

            // 3. Stamp the overall booklet total at the TOP-LEFT of the FIRST page.
            // (Previously the bottom of the final page — it overlapped the last question's
            // total badge, since all total stamps rendered in the same bottom-right spot.)
            if (pIdx === 0) {
              const finalBadgeText = `Booklet Total: ${grandTotalScore}/${grandTotalMax}`;
              pageAnnotations.push({
                type: 'total_header',
                text: finalBadgeText,
                comment: `Overall Booklet Total: ${grandTotalScore}/${grandTotalMax} marks`,
                box_2d: [12, 20, 52, 420],
                page_index: pIdx
              });
            }

            const questionsPresent = Array.from(new Set(
              pageSubparts.map((sp: any) => sp.part_label?.split('(')?.[0]?.trim() || '')
                .filter(Boolean)
                .concat(
                  scriptMap.filter((sm: any) => sm.spanned_pages?.includes(pIdx)).map((sm: any) => String(sm.question_number))
                )
            ));

            const pageLayoutRegions = validQuestions
              .filter((q: any) => q.spanned_pages?.includes(pIdx))
              .flatMap((q: any) => q.layout_regions || []);

            return {
              page_index: pIdx,
              original_image_url: imgUrl,
              page_score: pageScore,
              page_max_score: pageMax,
              questions_present: questionsPresent.length > 0 ? questionsPresent : [`${pIdx + 1}`],
              annotations: pageAnnotations,
              subparts: pageSubparts,
              layout_regions: pageLayoutRegions
            };
          });

          const multiPageAssessment: any = {
            identified_question_number: questionSummaries.map(q => q.question_number).join(', '),
            identified_topic: validQuestions[0]?.identified_topic || "Multi-Page Exam Script",
            total_score: grandTotalScore,
            total_max_score: grandTotalMax || 10,
            score: grandTotalScore,
            max_score: grandTotalMax || 10,
            percentage: grandTotalMax > 0 ? Math.round((grandTotalScore / grandTotalMax) * 100) : 0,
            subparts: allSubparts,
            layout_regions: validQuestions.flatMap((q: any) => q.layout_regions || []),
            annotations: allAnnotations,
            question_summaries: questionSummaries,
            pages: pages,
            overall_feedback: validQuestions.map(q => q.overall_feedback).filter(Boolean).join(' ') || `Completed multi-page booklet evaluation across ${rawImages.length} pages. Scored ${grandTotalScore}/${grandTotalMax} marks.`,
            examiner_model_solution: validQuestions.map(q => q.examiner_model_solution).filter(Boolean).join('\n\n'),
            recommended_next_step: validQuestions[0]?.recommended_next_step || "Review teacher constructive corrections on the marked booklet pages.",
            model_used: validQuestions[0]?.model_used || indexRes.modelUsed || "gpt-4o"
          };

          // Concurrently generate authentic teacher red-ink marked images for ALL pages!
          // No paper is EVER left unmarked or missed!
          if (generate_marked_image !== false) {
            try {
              const topic = multiPageAssessment.identified_topic || "Science";
              console.log(`Starting concurrent marked image generation for all ${rawImages.length} booklet pages...`);
              await Promise.all(
                rawImages.map(async (imgUrl, pIdx) => {
                  try {
                    // Stagger by 350ms to prevent burst rate-limiting on OpenAI
                    if (pIdx > 0) {
                      await new Promise((r) => setTimeout(r, pIdx * 350));
                    }
                    const editPrompt = buildSunburstEditPrompt(multiPageAssessment, topic, grandTotalScore, grandTotalMax, pIdx);
                    const editedUrl = await editImageWithSunburst(imgUrl, editPrompt, openaiApiKey);
                    if (editedUrl && !editedUrl.startsWith("ERROR:")) {
                      if (multiPageAssessment.pages && multiPageAssessment.pages[pIdx]) {
                        multiPageAssessment.pages[pIdx].marked_image_url = editedUrl;
                      }
                      if (pIdx === 0) {
                        multiPageAssessment.generated_marked_image_url = editedUrl;
                      }
                      console.log(`Successfully generated authentic teacher marked image for Page ${pIdx}`);
                    } else {
                      console.warn(`Marked image generation for Page ${pIdx} returned error:`, editedUrl);
                    }
                  } catch (pErr) {
                    console.warn(`Marked image generation for Page ${pIdx} failed:`, pErr);
                  }
                })
              );

              const attemptId = payload?.attempt_id;
              if (attemptId && supabaseClient) {
                try {
                  const updates: any = {};
                  if (multiPageAssessment.pages[0]?.marked_image_url) {
                    updates.generated_marked_image_url = multiPageAssessment.pages[0].marked_image_url;
                  }
                  updates.assessment_result = multiPageAssessment;
                  await supabaseClient
                    .from("student_attempts")
                    .update(updates)
                    .eq("id", attemptId);
                } catch (_) {}
              }
            } catch (bgErr) {
              console.warn("Multi-page Sunburst generation failed:", bgErr);
            }
          }

          return new Response(JSON.stringify({
            assessment: multiPageAssessment,
            marked_image_url: multiPageAssessment.generated_marked_image_url || null
          }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });

        } catch (multiPageErr: any) {
          console.error("Multi-page assessment pipeline error, falling back to standard evaluator:", multiPageErr);
          multiPageError = String(multiPageErr?.message || multiPageErr);
        }
      }

      // =========================================================================
      // SINGLE-PAGE ASSESSMENT (Targeted Mark Scheme & Anti-Hallucination)
      // =========================================================================
      const singleImageUrl = rawImages[0] || image_url;

      // PASS 1: Pedagogical Examiner Agent (focused marking with gpt-6-luna)
      console.log(`Single-page: Running Pass 1 (Pedagogical Examiner Agent with gpt-6-luna)...`);
      const singleTargetedPrompt = `You are the Mentora Senior Chief Examiner and Master Pedagogical Teacher.
You evaluate student exam answers under the guiding philosophy:
"MARK LIKE AN EXAMINER, EXPLAIN LIKE A TEACHER, AND ANNOTATE LIKE A PROFESSIONAL TEACHER."

EXAM PAPER QUESTIONS & OFFICIAL MARK SCHEMES:
${allQuestionsContext}

STUDENT SUBMISSION NOTES / TRANSCRIPTION:
${student_answer || document_text || "Refer to attached handwriting image."}

ACTIVE CLIENT TAB: Question ${context?.questionNumber || '1'}

YOUR GRADING PROTOCOL:
0. TARGET PAPER CONSISTENCY (CRITICAL):
   - The student submitted these answers INTO the exam paper whose questions are listed under "EXAM PAPER QUESTIONS & OFFICIAL MARK SCHEMES" above (the TARGET paper).
   - The uploaded sheet may belong to a different paper (e.g. the student uploaded another paper's answers by mistake). Question numbers, headings, and topics printed on the uploaded sheet may NOT match the target paper — IGNORE them completely.
   - Grade the ENTIRE submission against the target paper's questions and official mark schemes above. NEVER grade against question text printed on the student's uploaded sheet, and NEVER adopt question numbering read off the uploaded pages.
1. QUESTION MATCHING:
   - Inspect the student's handwritten working, headings (e.g. "(a)(i)", "(a)(ii)", "(b)(i)", "(b)(ii)"), diagrams, and formulas.
   - Match the student's work to the EXACT question in the exam paper above.
   - For example: if the exam paper context above shows a question about electric fields and the student's working defines an electric field and draws field lines, set "identified_question_number" to that question's exact number.
   - Grade strictly against THAT question's official mark scheme! Do NOT mark the student's work against a different question's mark scheme!

2. MARK SCHEME COMPLIANCE & INTEGRITY:
   - The official mark scheme is the SUPREME BINDING GROUND TRUTH.
   - UNIVERSAL BENEFIT OF THE DOUBT (BOD) RULE (APPLIES TO ALL PAPERS):
     * Award marks whenever student demonstrates valid scientific understanding.
     * Do NOT dock marks for unlabelled reference points on diagrams if physically plausible, minor spelling slips, or faint stray smudges.
     * Enforce strict deterministic consistency across all papers.
   - Carefully verify student calculation steps, formulas, and values.
   - SELECTION & WORD LIST QUESTIONS (UNIVERSAL RULE):
     * When options are listed (e.g. underline / circle / tick):
     * Look ONLY at the words the student actively underlined or circled.
     * Do NOT assume unselected prompt options were chosen!
     * Positive marking: If the student underlined the required correct terms, award full credit!

3. COMPLETE SUBPART GRADING — DO NOT STOP EARLY:
   - Scan the entire student page completely from TOP TO BOTTOM.
   - Grade EVERY subpart present on the sheet (for example (a), (b)(i), (b)(ii), (b)(iii)).
   - ABSOLUTE BAN ON EARLY STOPPING: Never omit or stop after the first subpart or paragraph! If the student answered calculations or further parts below, you MUST evaluate them and award marks.
   - Output an entry in "subparts" for EVERY subpart visible on the sheet.

4. EXACT PHRASE EXTRACTION FOR POINT-BY-POINT GROUNDING:
   - For every marking point in "marking_points":
     * "point_number": integer (1, 2, ...)
     * "criterion": string (mark scheme criteria)
     * "is_earned": boolean (true if earned, false otherwise)
     * "mark_code": string (e.g. "B1", "M1", "A1")
     * "student_phrase": the EXACT word, phrase, equation, or number from the student's handwritten response that earned this mark (e.g. 'distillation', 'Q = mcΔT', '2.5 A'). If not earned, leave empty "".
     * "flawed_phrase": if missed due to an incorrect response, the specific flawed word or value written by the student (e.g. 'conduction', 'inverted', 'real'). If omitted entirely, leave empty "".
   - NOTE: You do not need to guess pixel coordinates; the Visual Grounding Agent will localize them in Pass 2 using these target phrases!

Return strictly valid JSON matching this schema:
{
  "identified_question_number": "string (e.g. '6')",
  "identified_topic": "string",
  "total_score": number,
  "total_max_score": number,
  "score": number,
  "max_score": number,
  "percentage": number,
  "subparts": [
    {
      "part_label": "string (e.g. '(a)(i)')",
      "line_y": number, // integer 0-1000 indicating vertical level of student's answer line
      "max_score": number,
      "score": number,
      "student_answer_detected": "string",
      "marks_awarded": ["string"],
      "deductions": ["string"],
      "teacher_correction_note": "string (empty if full marks)",
      "constructive_correction": "string (empty if full marks)",
      "mistake_details": "string (empty if full marks)",
      "marking_points": [
        {
          "point_number": 1,
          "criterion": "string",
          "is_earned": boolean,
          "mark_code": "string",
          "student_phrase": "string",
          "flawed_phrase": "string"
        }
      ]
    }
  ],
  "overall_feedback": "string",
  "examiner_model_solution": "string",
  "recommended_next_step": "string"
}
Return only JSON.`;

      const messages: any[] = [
        { role: "system", content: "You are the Mentora Senior Chief Examiner. Mark every subpart strictly according to the official mark scheme with vision accuracy. Output strictly valid JSON." }
      ];

      if (singleImageUrl) {
        messages.push({
          role: "user",
          content: [
            { type: "text", text: singleTargetedPrompt },
            { type: "image_url", image_url: { url: singleImageUrl, detail: "high" } }
          ]
        });
      } else {
        messages.push({ role: "user", content: singleTargetedPrompt });
      }

      if (openaiApiKey) {
        const evalRes = await executeChatCompletion(openaiApiKey, pass2Candidates, {
          messages,
          response_format: { type: "json_object" },
          temperature: 0.0
        });

        if (!evalRes.ok) {
          console.error("OpenAI assessment error:", evalRes.error);
          return new Response(JSON.stringify({ error: evalRes.error || "OpenAI Assessment Error" }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 400,
          });
        }
        if (evalRes.data?.choices && evalRes.data.choices[0]) {
          const rawContent = evalRes.data.choices[0].message.content;
          const cleanJson = rawContent.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
          const assessment = JSON.parse(cleanJson);
          assessment.model_used = evalRes.modelUsed;

          const identifiedQNum = String(assessment.identified_question_number || context?.questionNumber || '6');
          const schemeData = await getQuestionMarkScheme(
            supabaseClient,
            paperId,
            identifiedQNum,
            context,
            mark_scheme
          );

          // STRICT TARGET-PAPER ENFORCEMENT (code-level):
          // 1. If the identified question does not exist in the paper being marked → 0.
          // 2. The question's max comes ONLY from the official paper marks (DB).
          // 3. If the model reports the page is not attempting this question → 0.
          const snappedQNum = identifiedQNum.trim().match(/^\d+/)?.[0] || identifiedQNum.trim();
          const officialQSingle = officialPaperQuestions.find((oq: any) => {
            const oNum = String(oq.question_number).trim();
            return oNum === snappedQNum || oNum === identifiedQNum.trim();
          });
          const officialMarksSingle = officialQSingle ? (Number(officialQSingle.marks) || 0) : 0;
          const isUnmatchedSingle = officialPaperQuestions.length > 0 && !officialQSingle;

          if (isUnmatchedSingle || assessment.is_attempting_target_question === false) {
            console.log(`Strict enforcement (single-page): Question ${identifiedQNum} ${isUnmatchedSingle ? "does not exist in the target paper" : "was reported as not attempted"}. Awarding 0.`);
            assessment.total_score = 0;
            assessment.score = 0;
            assessment.total_max_score = officialMarksSingle;
            assessment.max_score = officialMarksSingle;
            assessment.percentage = 0;
            if (Array.isArray(assessment.subparts)) {
              assessment.subparts.forEach((sp: any) => {
                sp.score = 0;
                sp.marks_awarded = [];
                sp.teacher_correction_note = isUnmatchedSingle
                  ? "Content does not correspond to any question in this paper — 0 marks"
                  : "Does not attempt this question — 0 marks";
                if (Array.isArray(sp.marking_points)) {
                  sp.marking_points.forEach((mp: any) => { mp.is_earned = false; });
                }
              });
            }
          } else if (officialMarksSingle > 0) {
            assessment.total_max_score = officialMarksSingle;
            assessment.max_score = officialMarksSingle;
          } else if (schemeData.found && schemeData.marks) {
            assessment.total_max_score = schemeData.marks;
            assessment.max_score = schemeData.marks;
          }

          // Clamp subpart scores between 0 and max_score and enforce anti-overcorrection
          if (assessment.subparts && Array.isArray(assessment.subparts)) {
            assessment.subparts.sort((a: any, b: any) => {
              const wA = getSubpartSortWeight(a.part_label || '');
              const wB = getSubpartSortWeight(b.part_label || '');
              return wA - wB;
            });
            assessment.subparts.forEach((sp: any) => {
              const max = Number(sp.max_score) || 1;
              sp.score = Math.max(0, Math.min(Number(sp.score) || 0, max));
              if (sp.score === max) {
                sp.teacher_correction_note = "";
                sp.constructive_correction = "";
                sp.mistake_details = "";
                sp.misconception_analysis = "";
                sp.how_to_improve = "";
              }
            });
            const subpartsTotal = assessment.subparts.reduce((sum: number, sp: any) => sum + (Number(sp.score) || 0), 0);
            assessment.total_score = subpartsTotal;
            assessment.score = subpartsTotal;
            if (assessment.total_max_score) {
              assessment.percentage = Math.round((subpartsTotal / assessment.total_max_score) * 100);
            }
          }

          // PASS 2: Visual Grounding & Positioning Agent (spatial localization with gpt-6-luna)
          let singlePageGrounding: VisualGroundingResult | null = null;
          if (singleImageUrl && Array.isArray(assessment.subparts) && assessment.subparts.length > 0) {
            console.log(`Single-page: Running Pass 2 (Visual Grounding Agent with gpt-6-luna)...`);
            singlePageGrounding = await groundEvaluatedMarks(
              openaiApiKey,
              pass1Candidates,
              singleImageUrl,
              assessment.subparts,
              identifiedQNum
            );
            if (singlePageGrounding) {
              console.log(`Single-page: Pass 2 Grounding complete: detected ${singlePageGrounding.subpart_groundings.length} subparts and ${singlePageGrounding.diagram_regions.length} diagrams.`);
            }
          }

          // Master synthesis: apply grounded coordinates, synthesize point-by-point inline ticks, margin badges, and comments
          applyVisualGroundingToAssessment(assessment, singlePageGrounding, identifiedQNum, 0);

          // 2. Image Annotation Agent (GPT-Image-2.5-Sunburst)
          if (openaiApiKey && singleImageUrl && generate_marked_image !== false) {
            try {
              const topic = assessment.identified_topic || "Chemistry / Science";
              const totalScore = assessment.total_score !== undefined ? assessment.total_score : (assessment.score || 0);
              const totalMax = assessment.total_max_score !== undefined ? assessment.total_max_score : (assessment.max_score || 10);
              const editPrompt = buildSunburstEditPrompt(assessment, topic, totalScore, totalMax);
              
              // Run Sunburst image generation with a strict 10s budget so the response is returned promptly
              const editPromise = editImageWithSunburst(singleImageUrl, editPrompt, openaiApiKey);
              const timeoutPromise = new Promise<null>((resolve) => setTimeout(() => resolve(null), 10000));
              const editedUrl = await Promise.race([editPromise, timeoutPromise]);
              if (editedUrl && !editedUrl.startsWith("ERROR:")) {
                assessment.generated_marked_image_url = editedUrl;

                const attemptId = payload?.attempt_id;
                if (attemptId && supabaseClient) {
                  try {
                    await supabaseClient
                      .from("student_attempts")
                      .update({ generated_marked_image_url: editedUrl })
                      .eq("id", attemptId);
                  } catch (_) {}
                }
              }
            } catch (bgErr) {
              console.warn("Image Annotation Agent (Sunburst) failed:", bgErr);
            }
          }

          // Wrap single-page result in pages & question_summaries for universal booklet compatibility
          assessment.pages = [
            {
              page_index: 0,
              original_image_url: singleImageUrl,
              marked_image_url: assessment.generated_marked_image_url,
              page_score: assessment.total_score ?? assessment.score ?? 0,
              page_max_score: assessment.total_max_score ?? assessment.max_score ?? 10,
              questions_present: [assessment.identified_question_number || "1"],
              annotations: assessment.annotations || [],
              subparts: assessment.subparts || []
            }
          ];

          assessment.question_summaries = [
            {
              question_number: assessment.identified_question_number || "1",
              topic: assessment.identified_topic,
              score: assessment.total_score ?? assessment.score ?? 0,
              max_score: assessment.total_max_score ?? assessment.max_score ?? 10,
              percentage: assessment.percentage ?? 0,
              spanned_pages: [0],
              subparts: assessment.subparts || []
            }
          ];

          return new Response(JSON.stringify({
            assessment,
            marked_image_url: assessment.generated_marked_image_url || null,
            multi_page_error: multiPageError || undefined
          }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      }
    }

    // 2. Standard Tutor Chat Orchestration Loop with OpenAI LLM
    if (!message) {
      return new Response(JSON.stringify({ error: "Missing message" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      });
    }

    // Fetch Session State & History if sessionId provided
    let chatHistory = incomingHistory || [];
    if (sessionId) {
      try {
        const { data: sessionData } = await supabaseClient
          .from("learning_sessions")
          .select("chat_history, current_stage, learning_mode, paper_id, question_id, question_number")
          .eq("id", sessionId)
          .single();

        if (sessionData?.chat_history && (!chatHistory || chatHistory.length === 0)) {
          chatHistory = sessionData.chat_history;
        }
      } catch (_e) {
        // Ignore session lookup error
      }
    }

    const paperTitle = context?.paperTitle || context?.title || "Past Exam Paper";
    const subject = context?.subject || "Science / Mathematics";
    const curriculum = context?.curriculum || "Cambridge / ZIMSEC / IB";
    const activeQNum = context?.questionNumber || "1";
    const activeQText = context?.questionText || "";
    const activeMarkScheme = context?.markScheme || "";
    const activeTopic = context?.topic || "";
    const hasOfficialScheme = !!(activeMarkScheme && activeMarkScheme.trim().length > 15 && !activeMarkScheme.includes("Method Mark (M1): Accurate application"));

    const systemPrompt = `You are the Mentora Question Paper AI Tutor, a friendly, intelligent, and expert human-like tutor for ${subject} (${curriculum}).
You are actively helping a student working through the exam paper: "${paperTitle}".

ACTIVE CONTEXT:
- Paper: "${paperTitle}"
- Subject: ${subject}
- Active Question: Question ${activeQNum} ${activeTopic ? `(${activeTopic})` : ''}
${activeQText ? `- Question Content: "${activeQText}"` : ''}
${hasOfficialScheme ? `- Official Mark Scheme / Criteria: "${activeMarkScheme}"` : '- Mark Scheme Status: No official mark scheme document is currently attached to this paper.'}
${context?.assessmentSummary ? `\n- LATEST ASSESSMENT & DETECTED STUDENT WORKING:\n${context.assessmentSummary}` : ''}

TUTORING INSTRUCTIONS:
1. Talk naturally, warmly, and conversationally like an experienced 1-on-1 tutor (NOT a robotic system).
2. ONLY do what the student explicitly asks — NEVER proactively explain, summarise, or break down questions unless the student directly requests it. If the student greets you or makes casual conversation, respond warmly and casually — do NOT launch into explanations of questions unprompted.
3. When the student explicitly asks how to solve a question or to explain it: Provide a clear, step-by-step educational breakdown with concepts, formulas, and working.
4. When the student asks for a hint: Give a helpful progressive hint that guides their understanding without spoiling the full answer.
5. When the student asks about marking criteria:
   - If an official mark scheme is provided above: Clearly outline what examiners look for, key terms, and common pitfalls based on the official scheme.
   - If NO official mark scheme is attached: Transparently state that while this paper does not have an official published mark scheme attached, you have derived the full examiner marking criteria and model solution from first principles based on ${curriculum} examination standards (${context?.marks || 'standard'} marks). Then display the exact point breakdown.
6. When the student makes short conversational remarks (e.g. "What's up", "Hey", "Thanks", "Cool", "I see"): Respond naturally and conversationally — keep it brief and friendly. Do NOT use their greeting as a trigger to explain question content.
7. When the student submits their answer or photo: Evaluate it rigorously against the marking criteria, award marks, applaud correct points, and explain how to improve.
8. Use rich, beautiful Markdown formatting:
   - Use clear section headings (e.g. ### Step 1: ..., ### Key Concepts).
   - Use bold (**term**) for key examiner keywords and scientific principles.
   - Format chemical formulas and ions clearly (e.g. H₂O, CO₂, PbBr₂, Zn²⁺, Cl⁻, SO₄²⁻, ²³₁₁Na).
   - Format reaction equations cleanly with state symbols and arrows (e.g. 2HI(g) ⇌ I₂(g) + H₂(g), Pb²⁺(aq) + 2Br⁻(aq) → PbBr₂(s)).
   - Use clean bullet points and numbered steps for readability.
9. PRESENTATION & CLEAN CONSISTENT STYLING:
   - NEVER wrap calculation lines or equations in display brackets like \\[ ... \\] or $$ ... $$.
   - Write equations and calculations directly and cleanly on their own lines or bullet points.
   - Maintain a standardized, professional look: do not randomly bold isolated numbers or mix random colors. Use bold only for clear step titles or key terminology.
10. FOLLOW-UP DISCUSSIONS & REVIEWING SUBPARTS:
    - When the student asks about a specific subpart (e.g. "Bro are you sure c(ii) is correct?", "why did I lose marks on (b)(i)?", "is my reasoning for (c) right?"):
      * Look directly at their detected student working from the assessment above, the official mark scheme criteria, and the underlying scientific principles.
      * Answer immediately, conversationally, warmly, and thoroughly! NEVER give generic delay responses like "If you want, I can help you go through it step by step. Just let me know!"—give them the real, helpful answer directly right now.
      * If they ask whether a part is correct, examine what they wrote, cross-reference the official mark scheme criteria and the underlying science, and explain clearly why marks were awarded or withheld while validating their scientific awareness!`;

    const formattedHistory = chatHistory
      .filter((m: any) => m.content && (m.role === 'user' || m.role === 'assistant'))
      .map((m: any) => ({
        role: m.role,
        content: m.content
      }));

    const userMessageParts: any[] = [];
    userMessageParts.push({ type: "text", text: message });

    // 1. Question diagrams, graphs, tables (passed to vision model)
    if (context?.questionAssets && Array.isArray(context.questionAssets)) {
      for (const assetUrl of context.questionAssets) {
        if (assetUrl && typeof assetUrl === 'string' && (assetUrl.startsWith('http://') || assetUrl.startsWith('https://') || assetUrl.startsWith('data:image/'))) {
          userMessageParts.push({
            type: "image_url",
            image_url: { url: assetUrl }
          });
        }
      }
    }

    // 2. Student uploaded handwritten attempt / photo
    if (image_url && typeof image_url === 'string') {
      userMessageParts.push({
        type: "image_url",
        image_url: { url: image_url }
      });
    }

    const userMessageContent: any = userMessageParts.length > 1
      ? userMessageParts
      : message;

    const messages: any[] = [
      { role: "system", content: systemPrompt },
      ...formattedHistory.slice(-14),
      { role: "user", content: userMessageContent }
    ];

    if (!openaiApiKey) {
      return new Response(JSON.stringify({ 
        reply: `I'm your AI Tutor for **${paperTitle}**.\n\nLooking at **Question ${activeQNum}** (${activeTopic || subject}):\n\nHow can I help you with this? You can ask for a hint, the step-by-step solution method, or the examiner marking criteria.`
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Call OpenAI LLM to generate the direct conversational tutoring response
    const chatCandidates = ["gpt-4o-mini", "gpt-4o"];
    const chatRes = await executeChatCompletion(openaiApiKey, chatCandidates, {
      messages,
      temperature: 0.4
    });

    if (!chatRes.ok) {
      console.error("OpenAI API error:", chatRes.error);
      return new Response(JSON.stringify({ error: chatRes.error || "OpenAI API returned an error" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      });
    }
    const reply = chatRes.data?.choices?.[0]?.message?.content || "I'm reviewing your question paper. Let's work through this step by step.";

    // Save Updated Session History if sessionId is present
    if (sessionId) {
      try {
        await supabaseClient
          .from("learning_sessions")
          .update({
            chat_history: [...messages, { role: "assistant", content: reply }].slice(-12),
            updated_at: new Date().toISOString()
          })
          .eq("id", sessionId);
      } catch (_e) {
        // Ignore background save error
      }
    }

    return new Response(JSON.stringify({ reply }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500
    });
  }
});
