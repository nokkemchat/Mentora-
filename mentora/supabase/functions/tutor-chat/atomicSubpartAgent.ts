/**
 * ATOMIC SUBPART EVALUATION AGENT
 * 
 * Phase 3 & Phase 4 of the Deterministic Marking Architecture:
 * 
 * Phase 3: Atomic Evaluation (1 Agent per Subquestion)
 * - Evaluates each subpart completely independently.
 * - Passes the FULL high-resolution page image where the subpart lives.
 * - NO physical cropping and NO external OCR — full margin calculations, scratch space,
 *   and diagrams are completely visible to the agent.
 * - Targeted prompt instructs the model to inspect ONLY the target subpart and its margins.
 * 
 * Phase 4: Deterministic Scoring & Cap Enforcement (Pure TypeScript via rubricEngine.ts)
 * - The LLM NEVER computes scores.
 * - TypeScript matches verdicts against parsed rubric criteria, collapses overlap groups,
 *   and strictly enforces DB marks.
 */

import {
  parseRubric,
  computeSubpartScore,
  canonicalLabel,
  ParsedRubric,
  RubricCriterion
} from "./rubricEngine.ts";
import { getSubpartSortWeight } from "./pageFingerprinter.ts";

export interface SubpartDefinition {
  part_label: string;          // e.g. "(a)", "(b)(i)", "(b)(ii)"
  canonical_label: string;      // e.g. "a", "b.i", "b.ii"
  marks: number;               // marks available for this subpart
}

export interface AtomicSubpartInput {
  questionNumber: string;
  partLabel: string;
  canonicalLabel: string;
  marksAvailable: number;
  officialMarkScheme: string | null;
  canonicalPageIndex: number;
  pageImageUrl: string;
  defaultAnswerLineY?: number;
  previousAnswerSnippet?: string;
  topic?: string;
}

export interface AtomicSubpartOutput {
  question_number: string;
  part_label: string;
  canonical_label: string;
  score: number;
  max_score: number;
  line_y: number;
  page_index: number;
  student_answer_detected: string;
  marks_awarded: string[];
  deductions: string[];
  teacher_correction_note: string;
  constructive_correction?: string;
  mistake_details?: string;
  marking_points: Array<{
    point_number: number;
    criterion: string;
    is_earned: boolean;
    mark_code: string;
    student_phrase?: string;
    flawed_phrase?: string;
    box_2d?: [number, number, number, number];
  }>;
  overlap_capped?: number;
  focused_agent: true;
  rubric_engine: boolean;
  verdicts?: Array<{ criterion_index: number; satisfied: boolean; evidence: string }>;
}

/**
 * Extracts all unique subpart definitions for a question from the stored mark scheme and DB parts.
 */
export function extractQuestionSubparts(
  questionNumber: string,
  questionMarks: number,
  officialMarkScheme: string | null,
  dbQuestionParts?: Array<{ part_label: string; marks?: number }>
): SubpartDefinition[] {
  const cleanQ = String(questionNumber || '1').replace(/^Q(?:uestion)?\s*/i, '').trim();
  const subpartsMap = new Map<string, SubpartDefinition>();

  // 1. Scan official mark scheme for subpart headings e.g. "(a) [B1]", "(4(b)(ii)) [ANSWER — 3 marks]"
  if (officialMarkScheme) {
    for (const raw of officialMarkScheme.split('\n')) {
      const t = raw.trim();
      if (!t) continue;
      const m = t.match(/^\((\d{0,2}\(?[a-z0-9()]*[a-z0-9]\)*)\)\s*\[([^\]]+)\]/i)
        || t.match(/^\(?([a-z][ivx0-9().]*|\d{0,2}[a-z](?:\([ivx0-9]+\))*)\)?\s*\[([^\]]+)\]/i);
      if (!m) continue;
      
      const rawLabel = m[1];
      const canon = canonicalLabel(rawLabel);
      if (!canon) continue;

      if (!subpartsMap.has(canon)) {
        // Format display label e.g. "(b)(ii)"
        const displayLabel = canon.includes('.')
          ? `(${canon.split('.').join(')(')})`
          : `(${canon})`;

        subpartsMap.set(canon, {
          part_label: displayLabel,
          canonical_label: canon,
          marks: 1 // placeholder, resolved below
        });
      }
    }
  }

  // 2. Incorporate database question_parts if available with parent/container awareness
  if (Array.isArray(dbQuestionParts) && dbQuestionParts.length > 0) {
    const byId = new Map<string, any>();
    const parentIds = new Set<string>();
    dbQuestionParts.forEach((p: any) => {
      if (p.id) byId.set(p.id, p);
      if (p.parent_part_id) parentIds.add(p.parent_part_id);
    });

    for (const p of dbQuestionParts) {
      // If this part is a parent container for other subparts, skip it!
      if (p.id && parentIds.has(p.id)) continue;

      let fullLabel = p.part_label || "";
      if (p.parent_part_id && byId.has(p.parent_part_id)) {
        const parent = byId.get(p.parent_part_id);
        fullLabel = `${parent.part_label}.${p.part_label}`;
      }

      const canon = canonicalLabel(fullLabel);
      if (!canon) continue;

      const pMarks = Number(p.marks);
      const existing = subpartsMap.get(canon);
      if (existing) {
        if (!isNaN(pMarks) && pMarks > 0) existing.marks = pMarks;
      } else {
        const displayLabel = canon.includes('.')
          ? `(${canon.split('.').join(')(')})`
          : `(${canon})`;
        subpartsMap.set(canon, {
          part_label: displayLabel,
          canonical_label: canon,
          marks: !isNaN(pMarks) && pMarks > 0 ? pMarks : 1
        });
      }
    }
  }

  // 3. Hierarchical container pruning:
  // If "a.i" exists, "a" is a container and must NOT be marked separately!
  const allKeys = Array.from(subpartsMap.keys());
  for (const k of allKeys) {
    const isPrefixOfOther = allKeys.some(other => other !== k && other.startsWith(k + "."));
    if (isPrefixOfOther) {
      subpartsMap.delete(k);
    }
  }

  // 4. Detached child merging:
  // If "i" exists without parent prefix, but "a.i" exists, merge/delete "i"
  for (const k of Array.from(subpartsMap.keys())) {
    if (!k.includes(".")) {
      const parentWithChild = Array.from(subpartsMap.keys()).find(other => other.endsWith("." + k));
      if (parentWithChild) {
        subpartsMap.delete(k);
      }
    }
  }

  const subpartList = Array.from(subpartsMap.values());

  // If no subparts found, this question has no subdivisions (graded as a single atomic question)
  if (subpartList.length === 0) {
    return [
      {
        part_label: `(${cleanQ})`,
        canonical_label: 'whole',
        marks: questionMarks > 0 ? questionMarks : 10
      }
    ];
  }

  // 3. For any subparts whose marks are still 1 (or unassigned), infer from the parsed rubric
  if (officialMarkScheme) {
    for (const sp of subpartList) {
      if (sp.marks <= 1) {
        // First check if any row explicitly declares the total marks:
        // e.g. "[ANSWER — 3 marks]", "[3 marks]", "[TOTAL] 8", or "(5a) [8]"
        let declaredMarks: number | null = null;
        for (const raw of officialMarkScheme.split('\n')) {
          const t = raw.trim();
          if (!t) continue;
          const m = t.match(/^\((\d{0,2}\(?[a-z0-9()]*[a-z0-9]\)*)\)\s*\[([^\]]+)\]\s*(.*)$/i)
            || t.match(/^\(?([a-z][ivx0-9().]*|\d{0,2}[a-z](?:\([ivx0-9]+\))*)\)?\s*\[([^\]]+)\]\s*(.*)$/i);
          if (!m) continue;
          if (canonicalLabel(m[1]) !== sp.canonical_label) continue;

          const code = m[2].trim();
          const text = m[3].trim();

          // Check code for "ANSWER — X marks" or "X marks" or pure number "[3]"
          const codeMarks = code.match(/(\d+)\s*marks?/i) || (code.match(/^\d+$/) ? [null, code] : null);
          if (codeMarks) {
            const v = parseInt(codeMarks[1], 10);
            if (v > 0 && (declaredMarks === null || v > declaredMarks)) declaredMarks = v;
          }
          // Check text for "— X marks"
          const textMarks = text.match(/(?:[\u2013\u2014-]|\[)\s*(\d+)\s*marks?(?:\]|\s|$)/i);
          if (textMarks) {
            const v = parseInt(textMarks[1], 10);
            if (v > 0 && (declaredMarks === null || v > declaredMarks)) declaredMarks = v;
          }
        }

        if (declaredMarks !== null && declaredMarks > 0) {
          sp.marks = declaredMarks;
        } else {
          const parsed = parseRubric(sp.canonical_label, officialMarkScheme);
          // Sum max values of distinct overlap groups (excluding fallbacks and alternatives)
          const groupMax = new Map<number, number>();
          for (const c of parsed.criteria) {
            if (c.isLevel || c.isFallback) continue;
            const g = c.overlapGroup ?? c.index;
            const cur = groupMax.get(g) ?? 0;
            if (c.value > cur) groupMax.set(g, c.value);
          }
          const rubricSum = Array.from(groupMax.values()).reduce((s, v) => s + v, 0);
          if (rubricSum > 1) {
            sp.marks = rubricSum;
          }
        }
      }
    }
  }

  // Sort subparts in canonical sequence (a before b before c)
  subpartList.sort((a, b) => getSubpartSortWeight(a.canonical_label) - getSubpartSortWeight(b.canonical_label));

  return subpartList;
}

/**
 * Builds the focused evaluation prompt for a single subpart.
 */
export function buildAtomicSubpartPrompt(
  qNum: string,
  subpartLabel: string,
  marksAvailable: number,
  rubricCriteria: RubricCriterion[],
  overlapGroups: Array<{ group: number; memberIndices: number[] }>,
  previousAnswerSnippet?: string
): string {
  const criteriaText = rubricCriteria.map(c =>
    `${c.index}. [${c.code}] ${c.text}${c.guidance ? `\n   GUIDANCE: ${c.guidance}` : ''}`
  ).join('\n');

  const overlapNote = overlapGroups.length > 0
    ? `\nNOTE — The following criteria express THE SAME UNDERLYING IDEA (award evidence separately for each, but the scoring engine will count the group once):\n${overlapGroups.map(g => `  Group ${g.group}: criteria ${g.memberIndices.join(', ')}`).join('\n')}\n`
    : '';

  return `You are the Senior Chief Examiner evaluating ONE SPECIFIC SUBPART of Question ${qNum}.
SUBPART TO EVALUATE: Question ${qNum} Part (${subpartLabel})
TOTAL MARKS AVAILABLE FOR THIS SUBPART: ${marksAvailable}

OFFICIAL MARK SCHEME CRITERIA FOR THIS SUBPART:
${criteriaText}
${overlapNote}
${previousAnswerSnippet ? `\nCANDIDATE'S PREVIOUS SUBPART ANSWER (for Follow-Through / FT credit if applicable):\n"${previousAnswerSnippet}"\n` : ''}

CRITICAL RULES FOR ATOMIC SUBPART MARKING:
1. ISOLATED SUBPART FOCUS:
   - Your ONLY job is to evaluate subpart (${subpartLabel}) on the attached page image.
   - Look at the student's handwritten working in the designated answer space for (${subpartLabel}) AND ANY SCRATCH WORK OR CALCULATIONS IN THE MARGINS OR WORKSPACE NEAR THIS SUBPART.
   - Ignore all other subparts or questions on this page.
2. CANDIDATE INK ONLY (CRITICAL):
   - Evidence MUST come exclusively from what the candidate wrote, calculated, or drew with pen or pencil.
   - Pre-printed exam paper text, diagrams, and figures belong to the exam board. NEVER credit pre-printed elements as candidate work!
3. CALCULATIONS, METHOD (M), AND ACCURACY (A):
   - Check formulas, substitutions, intermediate steps, and final numbers.
   - Numerical values: accept standard rounding, fractions (e.g. 63/395, 56/80), or equivalent algebraic forms.
   - If the student wrote a valid intermediate working step in the margins or scratch area (e.g. "56/80" or "9/79"), credit it as evidence!
4. CRITERION VERDICTS:
   - For EACH criterion listed above (by index 0..N-1), judge whether it is satisfied (true or false).
   - If satisfied, quote the candidate's exact handwritten words, mathematical expression, or drawn feature in "evidence".
   - If not satisfied, "evidence" must be empty "".
5. ANSWER LINE COORDINATE & STUDENT DETECTED ANSWER:
   - "answer_line_y": estimate the 0-1000 vertical coordinate where the printed answer line or student's final answer sits on the page.
   - "student_answer_detected": transcribe the student's final answer or conclusion.
   - "teacher_correction_note": concise 1-sentence note if marks were lost (EMPTY string if full marks earned).
   - "constructive_correction": concise explanation of what the student should have done to earn full marks.

OUTPUT STRICTLY VALID JSON MATCHING THIS SCHEMA:
{
  "student_answer_detected": "string — student final answer or main conclusion",
  "transcription_notes": "string — summary of working steps seen in answer space and margins",
  "answer_line_y": number,
  "verdicts": [
    {
      "criterion_index": number,
      "satisfied": boolean,
      "evidence": "string"
    }
  ],
  "teacher_correction_note": "string (empty if full marks)",
  "constructive_correction": "string"
}`;
}

/**
 * Evaluates a single subpart atomically using an isolated LLM call and deterministic scoring.
 */
export async function evaluateSubpartAtomically(
  input: AtomicSubpartInput,
  callChatCompletion: (messages: any[], temperature?: number, seed?: number) => Promise<any>
): Promise<AtomicSubpartOutput> {
  const {
    questionNumber,
    partLabel,
    canonicalLabel: canonLabel,
    marksAvailable,
    officialMarkScheme,
    canonicalPageIndex,
    pageImageUrl,
    defaultAnswerLineY,
    previousAnswerSnippet
  } = input;

  const rubric = officialMarkScheme
    ? parseRubric(canonLabel, officialMarkScheme)
    : { subpart: canonLabel, criteria: [], schemeType: 'points', printedMax: marksAvailable, overlapGroups: 0 } as ParsedRubric;

  // Group overlap members for prompt guidance
  const overlapMemberGroups = new Map<number, number[]>();
  rubric.criteria.forEach((c: RubricCriterion) => {
    const g = c.overlapGroup ?? c.index;
    if (!overlapMemberGroups.has(g)) overlapMemberGroups.set(g, []);
    overlapMemberGroups.get(g)!.push(c.index);
  });
  const overlapPromptList = Array.from(overlapMemberGroups.entries())
    .filter(([_, members]) => members.length > 1)
    .map(([group, memberIndices]) => ({ group, memberIndices }));

  const hasStructuredCriteria = rubric.criteria.length > 0;

  let prompt = "";
  if (hasStructuredCriteria) {
    prompt = buildAtomicSubpartPrompt(
      questionNumber,
      partLabel,
      marksAvailable,
      rubric.criteria,
      overlapPromptList,
      previousAnswerSnippet
    );
  } else {
    // Fallback prompt for questions without structured rubric rows
    prompt = `You are the Senior Chief Examiner evaluating Question ${questionNumber} Part (${partLabel}).
MARKS AVAILABLE: ${marksAvailable}

INSTRUCTIONS:
1. Examine the candidate's handwritten response in the answer space AND in the margins/scratch workspace for this part on the attached page image.
2. Grade under standard Cambridge / ZIMSEC / IB syllabus principles for ${marksAvailable} marks.
3. Identify candidate ink only (ignore pre-printed text/diagrams).
4. Provide score (0 to ${marksAvailable}), list marks awarded and deductions, and locate the vertical answer_line_y (0-1000).

OUTPUT STRICTLY VALID JSON:
{
  "score": number,
  "student_answer_detected": "string",
  "marks_awarded": ["string"],
  "deductions": ["string"],
  "answer_line_y": number,
  "teacher_correction_note": "string (empty if full marks)",
  "constructive_correction": "string"
}`;
  }

  const userContent: any[] = [
    { type: "text", text: prompt },
    { type: "image_url", image_url: { url: pageImageUrl, detail: "high" } }
  ];

  let evalError = "";
  try {
    const res = await callChatCompletion(
      [
        { role: "system", content: "You are the Senior Chief Examiner evaluating ONE subquestion. Output strictly valid JSON." },
        { role: "user", content: userContent }
      ],
      0.0,
      42
    );

    if (res?.ok && res?.data?.choices?.[0]?.message?.content) {
      const cleanJson = res.data.choices[0].message.content
        .replace(/^```(?:json)?\s*/i, '')
        .replace(/\s*```$/i, '')
        .trim();
      const parsed = JSON.parse(cleanJson);

      let finalScore = 0;
      let marksAwarded: string[] = [];
      let deductions: string[] = [];
      let markingPoints: any[] = [];
      let overlapCapped = 0;

      const detectedY = typeof parsed.answer_line_y === 'number' && parsed.answer_line_y >= 20 && parsed.answer_line_y <= 980
        ? Math.round(parsed.answer_line_y)
        : (defaultAnswerLineY || 500);

      if (hasStructuredCriteria && Array.isArray(parsed.verdicts)) {
        // DETERMINISTIC ENGINE (Stage B): Compute score via pure TypeScript code
        const scoring = computeSubpartScore(
          rubric,
          parsed.verdicts.map((v: any) => ({
            criterionIndex: Number(v.criterion_index),
            satisfied: v.satisfied === true,
            evidence: String(v.evidence || '')
          })),
          marksAvailable
        );

        finalScore = scoring.score;
        overlapCapped = scoring.cappedByOverlap;

        // Build point-by-point marking records
        rubric.criteria.forEach((crit: RubricCriterion) => {
          const v = parsed.verdicts.find((x: any) => Number(x.criterion_index) === crit.index);
          const isSatisfied = v?.satisfied === true && Boolean(v?.evidence?.trim());
          const isWaived = scoring.waivedFallbacks.includes(crit.index);

          markingPoints.push({
            point_number: crit.index + 1,
            criterion: crit.text,
            is_earned: isSatisfied,
            mark_code: crit.code,
            student_phrase: isSatisfied ? String(v?.evidence || '') : undefined,
            flawed_phrase: !isSatisfied && !isWaived ? String(v?.evidence || '') : undefined
          });

          if (isSatisfied) {
            marksAwarded.push(`[${crit.code}] ${crit.text}${v?.evidence ? ` (${v.evidence})` : ''}`);
          } else if (!isWaived && !crit.isLevel) {
            deductions.push(`[${crit.code}] ${crit.text}`);
          }
        });
      } else {
        // Fallback scoring for unstructured questions
        const rawScore = Number(parsed.score);
        finalScore = Math.max(0, Math.min(isNaN(rawScore) ? 0 : rawScore, marksAvailable));
        marksAwarded = Array.isArray(parsed.marks_awarded) ? parsed.marks_awarded : [];
        deductions = Array.isArray(parsed.deductions) ? parsed.deductions : [];
      }

      // Teacher correction note: empty on full marks to keep student script uncluttered!
      let teacherNote = "";
      if (finalScore < marksAvailable) {
        teacherNote = parsed.teacher_correction_note?.trim() ||
          (deductions.length > 0 ? deductions[0] : `Lost ${marksAvailable - finalScore} mark(s) on Part ${partLabel}.`);
      }

      return {
        question_number: questionNumber,
        part_label: partLabel,
        canonical_label: canonLabel,
        score: finalScore,
        max_score: marksAvailable,
        line_y: detectedY,
        page_index: canonicalPageIndex,
        student_answer_detected: String(parsed.student_answer_detected || '').trim(),
        marks_awarded: marksAwarded,
        deductions: deductions,
        teacher_correction_note: teacherNote,
        constructive_correction: parsed.constructive_correction || "",
        mistake_details: deductions.join('; '),
        marking_points: markingPoints,
        overlap_capped: overlapCapped,
        focused_agent: true,
        rubric_engine: hasStructuredCriteria,
        verdicts: parsed.verdicts
      };
    } else {
      evalError = res?.error || (res ? JSON.stringify(res).substring(0, 200) : "No response from callChatCompletion");
      console.warn(`[AtomicEvaluation] Failed for Q${questionNumber}${partLabel}: ${evalError}`);
    }
  } catch (err: any) {
    console.warn(`Atomic evaluation failed for Q${questionNumber}${partLabel}:`, err);
    return {
      question_number: questionNumber,
      part_label: partLabel,
      canonical_label: canonLabel,
      score: 0,
      max_score: marksAvailable,
      line_y: defaultAnswerLineY || 500,
      page_index: canonicalPageIndex,
      student_answer_detected: "",
      marks_awarded: [],
      deductions: [`Subpart evaluation error: ${err?.message || err}`],
      teacher_correction_note: `Part ${partLabel}: 0/${marksAvailable} marks`,
      marking_points: [],
      focused_agent: true,
      rubric_engine: false
    };
  }

  // Graceful fallback if call failed
  return {
    question_number: questionNumber,
    part_label: partLabel,
    canonical_label: canonLabel,
    score: 0,
    max_score: marksAvailable,
    line_y: defaultAnswerLineY || 500,
    page_index: canonicalPageIndex,
    student_answer_detected: "",
    marks_awarded: [],
    deductions: [`Subpart evaluation incomplete: ${evalError || 'unknown'}`],
    teacher_correction_note: `Part ${partLabel}: 0/${marksAvailable} marks`,
    marking_points: [],
    focused_agent: true,
    rubric_engine: false
  };
}

/**
 * Concurrency helper: processes an array of tasks with at most `concurrency` tasks in flight at once.
 */
export async function runWithConcurrencyLimit<T, R>(
  items: T[],
  concurrency: number,
  taskFn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let currentIndex = 0;

  async function worker() {
    while (currentIndex < items.length) {
      const idx = currentIndex++;
      try {
        results[idx] = await taskFn(items[idx], idx);
      } catch (err: any) {
        console.error(`Worker error at index ${idx}:`, err);
        results[idx] = {
          question_number: (items[idx] as any)?.qNum || "unknown",
          part_label: (items[idx] as any)?.input?.partLabel || "unknown",
          canonical_label: (items[idx] as any)?.input?.canonicalLabel || "unknown",
          score: 0,
          max_score: (items[idx] as any)?.input?.marksAvailable || 1,
          line_y: 500,
          page_index: (items[idx] as any)?.input?.canonicalPageIndex || 0,
          student_answer_detected: "",
          marks_awarded: [],
          deductions: [`Fatal worker error: ${err?.message || err}`],
          teacher_correction_note: `Worker crash: ${err?.message || err}`,
          marking_points: [],
          focused_agent: true,
          rubric_engine: false
        } as any;
      }
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

export interface BookletEvaluationResult {
  questionEvaluations: any[];
  allSubparts: AtomicSubpartOutput[];
  grandTotalScore: number;
  grandTotalMax: number;
  percentage: number;
}

/**
 * Orchestrates atomic evaluation across the entire booklet:
 * 1. Extracts subparts for every official question.
 * 2. Maps each subpart to its canonical page image via layout.
 * 3. Evaluates all subparts in parallel with concurrency limiting.
 * 4. Deterministically clamps scores and groups results by question.
 */
export async function evaluateBookletAtomically(
  canonicalImages: string[],
  layout: any, // BookletLayout
  officialPaperQuestions: any[],
  solutionsMap: Record<string, string>,
  dbPartsMap: Record<string, any[]>,
  callChatCompletion: (messages: any[], temperature?: number, seed?: number) => Promise<any>
): Promise<BookletEvaluationResult> {
  console.log(`[AtomicBookletEvaluator] Preparing atomic evaluation schedule for ${officialPaperQuestions.length} questions...`);

  interface TaskWithContext {
    input: AtomicSubpartInput;
    qNum: string;
    qIdx: number;
    subpartOrder: number;
  }

  const tasks: TaskWithContext[] = [];

  officialPaperQuestions.forEach((oq: any, qIdx: number) => {
    const qNum = String(oq.question_number || (qIdx + 1)).trim();
    const qMarks = Number(oq.marks) || 10;
    const ms = solutionsMap[oq.id] || "";
    const dbParts = dbPartsMap[oq.id] || [];

    const subparts = extractQuestionSubparts(qNum, qMarks, ms, dbParts);

    // Look for any known page for this question as fallback
    let fallbackPageIndex = -1;
    if (layout?.page_fingerprints) {
      const matchedPage = layout.page_fingerprints.find((fp: any) =>
        Array.isArray(fp.detected_questions) && fp.detected_questions.includes(qNum)
      );
      if (matchedPage) fallbackPageIndex = matchedPage.raw_page_index;
    }
    if (fallbackPageIndex < 0) {
      fallbackPageIndex = Math.min(canonicalImages.length - 1, Math.max(0, qIdx));
    }

    subparts.forEach((sp, spIdx) => {
      const subKey = `${qNum}:${sp.canonical_label}`;
      const loc = layout?.subpart_locations?.get(subKey);

      const targetPageIndex = loc?.canonical_page_index !== undefined && loc.canonical_page_index < canonicalImages.length
        ? loc.canonical_page_index
        : fallbackPageIndex;

      const answerLineY = loc?.answer_line_y || Math.round(150 + spIdx * (700 / Math.max(1, subparts.length)));

      tasks.push({
        input: {
          questionNumber: qNum,
          partLabel: sp.part_label,
          canonicalLabel: sp.canonical_label,
          marksAvailable: sp.marks,
          officialMarkScheme: ms || null,
          canonicalPageIndex: targetPageIndex,
          pageImageUrl: canonicalImages[targetPageIndex],
          defaultAnswerLineY: answerLineY,
          topic: oq.topic || "Examination Script"
        },
        qNum,
        qIdx,
        subpartOrder: spIdx
      });
    });
  });

  console.log(`[AtomicBookletEvaluator] Dispatched ${tasks.length} atomic subquestions across ${canonicalImages.length} canonical pages (concurrency 10)...`);
  const t0 = Date.now();

  const evaluatedSubparts = await runWithConcurrencyLimit(
    tasks,
    10,
    async (t) => evaluateSubpartAtomically(t.input, callChatCompletion)
  );

  console.log(`[AtomicBookletEvaluator] Completed all ${evaluatedSubparts.length} atomic evaluations in ${((Date.now() - t0) / 1000).toFixed(1)}s`);

  // Group subparts by question and enforce deterministic caps
  const questionEvaluations: any[] = [];
  let grandTotalScore = 0;
  const grandTotalMax = officialPaperQuestions.reduce((s: number, q: any) => s + (Number(q.marks) || 0), 0);

  officialPaperQuestions.forEach((oq: any) => {
    const qNum = String(oq.question_number).trim();
    const qMax = Number(oq.marks) || 10;

    // Subparts belonging to this question
    const qSubparts = evaluatedSubparts.filter(sp => sp.question_number === qNum);

    // Deduplicate subparts by canonical key (highest score wins if any duplicates)
    const dedupMap = new Map<string, AtomicSubpartOutput>();
    qSubparts.forEach((sp) => {
      const key = sp.canonical_label;
      if (!dedupMap.has(key) || sp.score > (dedupMap.get(key)?.score || 0)) {
        dedupMap.set(key, sp);
      }
    });

    const deduplicatedSubparts = Array.from(dedupMap.values());
    const earnedSum = deduplicatedSubparts.reduce((sum, sp) => sum + sp.score, 0);
    const finalQScore = Math.min(earnedSum, qMax);

    grandTotalScore += finalQScore;

    const spannedPages = Array.from(new Set(deduplicatedSubparts.map(sp => sp.page_index)))
      .filter((p: number) => !isNaN(p) && p >= 0 && p < canonicalImages.length);

    const safeSpanned = spannedPages.length > 0 ? spannedPages : [0];

    const allDeductions = deduplicatedSubparts.flatMap(sp => sp.deductions).filter(Boolean);
    const feedbackStr = allDeductions.length > 0
      ? allDeductions.slice(0, 3).join('. ') + '.'
      : "Full marks earned on this question.";

    questionEvaluations.push({
      identified_question_number: qNum,
      question_number: qNum,
      identified_topic: oq.topic || "Examination Script",
      score: finalQScore,
      total_score: finalQScore,
      max_score: qMax,
      total_max_score: qMax,
      percentage: qMax > 0 ? Math.round((finalQScore / qMax) * 100) : 0,
      subparts: deduplicatedSubparts,
      spanned_pages: safeSpanned,
      start_page: Math.min(...safeSpanned),
      end_page: Math.max(...safeSpanned),
      overall_feedback: feedbackStr,
      examiner_model_solution: "",
      recommended_next_step: "",
      model_used: "atomic-subpart-engine"
    });
  });

  const finalPercentage = grandTotalMax > 0
    ? Math.round((grandTotalScore / grandTotalMax) * 100)
    : 0;

  return {
    questionEvaluations,
    allSubparts: evaluatedSubparts,
    grandTotalScore,
    grandTotalMax,
    percentage: finalPercentage
  };
}

/**
 * Deterministically synthesizes visual annotations across all booklet pages:
 * 1. Booklet Total Badge at top-left of Page 0.
 * 2. Margin mark badge (score/max) aligned with the answer line.
 * 3. Inline ticks hovering above student working steps.
 * 4. Teacher correction note if marks were lost.
 */
export function synthesizeBookletAnnotations(
  subparts: AtomicSubpartOutput[],
  canonicalImages: string[],
  grandTotalScore: number,
  grandTotalMax: number
): any[] {
  const annotations: any[] = [];

  // Booklet Total Badge at top of Page 0
  if (canonicalImages.length > 0) {
    annotations.push({
      type: 'total_header',
      text: `Booklet Total: ${grandTotalScore}/${grandTotalMax}`,
      comment: `Overall Booklet Total: ${grandTotalScore}/${grandTotalMax} marks`,
      box_2d: [12, 20, 52, 420],
      page_index: 0
    });
  }

  // Group subparts by page index
  const subpartsByPage = new Map<number, AtomicSubpartOutput[]>();
  subparts.forEach((sp) => {
    const p = sp.page_index;
    if (!subpartsByPage.has(p)) subpartsByPage.set(p, []);
    subpartsByPage.get(p)!.push(sp);
  });

  subpartsByPage.forEach((pageSubs, pIdx) => {
    // Sort subparts by vertical baseline
    pageSubs.sort((a, b) => a.line_y - b.line_y);

    let prevBadgeY = 0;
    pageSubs.forEach((sp) => {
      let yMid = sp.line_y;
      // Separation to avoid overlap
      if (prevBadgeY > 0 && yMid < prevBadgeY + 28) {
        yMid = prevBadgeY + 28;
      }
      prevBadgeY = yMid;
      sp.line_y = yMid;

      // 1. Right Margin Score Badge: aligned horizontally with the answer line
      annotations.push({
        type: 'mark_badge',
        text: `(${sp.score}/${sp.max_score})`,
        comment: sp.score > 0
          ? (sp.marks_awarded?.[0] || `Part ${sp.part_label}: ${sp.score}/${sp.max_score} marks`)
          : (sp.deductions?.[0] || `Part ${sp.part_label}: 0/${sp.max_score} marks`),
        box_2d: [Math.max(yMid - 14, 25), 865, Math.min(yMid + 14, 975), 975],
        subpart_label: sp.part_label,
        page_index: pIdx
      });

      // 2. Inline ticks for earned marking points
      // Exactly sp.score neat ticks placed neatly to the right, preceding the margin badge
      const earnedCount = Math.min(Math.max(0, sp.score), sp.max_score);
      for (let k = 0; k < earnedCount; k++) {
        const tickY = Math.max(yMid - 10, 25);
        // Position ticks to the right preceding the margin badge
        const tickX = Math.min(740 + k * 35, 835);
        annotations.push({
          type: 'inline_tick',
          text: '✓',
          comment: sp.marks_awarded?.[k] || `Part ${sp.part_label} mark ${k + 1} earned`,
          box_2d: [Math.max(tickY - 14, 25), tickX, Math.min(tickY + 14, 940), Math.min(tickX + 28, 855)],
          subpart_label: sp.part_label,
          page_index: pIdx
        });
      }

      // 3. Teacher correction note if marks were lost
      if (sp.score < sp.max_score && sp.teacher_correction_note) {
        annotations.push({
          type: 'teacher_note',
          text: sp.teacher_correction_note,
          comment: sp.constructive_correction || sp.teacher_correction_note,
          box_2d: [Math.min(yMid + 16, 940), 160, Math.min(yMid + 50, 975), 840],
          subpart_label: sp.part_label,
          page_index: pIdx
        });
      }
    });
  });

  return annotations;
}


