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
  isCalculationCriterion,
  verdictNeedsModeratorAudit,
  isFabricatedSchemeQuote,
  ParsedRubric,
  RubricCriterion
} from "./rubricEngine.ts";
import { getSubpartSortWeight } from "./pageFingerprinter.ts";

/**
 * Parses a JSON object from an LLM completion string, recovering cleanly from
 * markdown code fences, stray surrounding prose, trailing commas, and unescaped
 * LaTeX backslashes inside string literals (e.g. "\times", "\frac", "\$").
 */
export function safeParseJsonObject(raw: unknown): any | null {
  if (typeof raw !== "string") return null;
  let text = raw.trim();
  if (!text) return null;

  text = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  try {
    return JSON.parse(text);
  } catch {
    // Extract outermost balanced JSON object ignoring braces inside quoted strings
    const start = text.indexOf("{");
    if (start === -1) return null;
    let depth = 0;
    let inStr = false;
    let esc = false;
    let end = -1;
    for (let i = start; i < text.length; i++) {
      const ch = text[i];
      if (esc) { esc = false; continue; }
      if (ch === "\\") { esc = true; continue; }
      if (ch === '"') { inStr = !inStr; continue; }
      if (!inStr) {
        if (ch === "{") depth++;
        else if (ch === "}") {
          depth--;
          if (depth === 0) { end = i; break; }
        }
      }
    }
    const candidate = end !== -1 ? text.slice(start, end + 1) : text.slice(start);
    try {
      return JSON.parse(candidate);
    } catch {
      // Repair invalid backslash escapes (e.g. \$, \times -> keep \\, fix lone \ followed by non-JSON escape char)
      // plus trailing commas before } or ].
      const repaired = candidate
        .replace(/\\(?!["\\/bfnrt]|u[0-9a-fA-F]{4})/g, "\\\\")
        .replace(/,\s*([}\]])/g, "$1");
      try {
        return JSON.parse(repaired);
      } catch {
        return null;
      }
    }
  }
}

/**
 * Invokes a chat completion with bounded retries whenever the gateway returns an
 * empty choice or unparseable JSON (eliminates transient 0-mark crashes in batch runs).
 */
async function invokeJsonChat(
  callChatCompletion: (messages: any[], temperature?: number, seed?: number) => Promise<any>,
  messages: any[],
  baseSeed: number,
  maxAttempts = 3,
  validator?: (parsed: any) => boolean,
  retryDelayMs = 200
): Promise<{ parsed: any | null; res: any; error: string }> {
  let lastRes: any = null;
  let lastErr = "";
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (attempt > 0 && retryDelayMs > 0) {
      await new Promise((r) => setTimeout(r, retryDelayMs * attempt));
    }
    lastRes = await callChatCompletion(messages, 0.0, baseSeed + attempt);
    const content = lastRes?.data?.choices?.[0]?.message?.content;
    if (lastRes?.ok && typeof content === "string" && content.trim()) {
      const parsed = safeParseJsonObject(content);
      if (parsed && (!validator || validator(parsed))) {
        return { parsed, res: lastRes, error: "" };
      }
      lastErr = `Malformed or incomplete JSON content: ${content.substring(0, 180)}`;
    } else {
      lastErr = lastRes?.error || (lastRes ? JSON.stringify(lastRes).substring(0, 200) : "Empty completion response");
    }
  }
  return { parsed: null, res: lastRes, error: lastErr };
}

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
  pageTranscript?: string;
  defaultAnswerLineY?: number;
  previousAnswerSnippet?: string;
  topic?: string;
}

const pageTranscriptCache = new Map<string, string>();
const MAX_TRANSCRIPT_CACHE = 64;

async function sha256Hex(input: string): Promise<string> {
  try {
    const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
    return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
  } catch {
    return input.slice(0, 128);
  }
}

/**
 * Extracts ONE canonical verbatim transcript for a page image (cached by image SHA-256)
 * so every subpart on that page—and identical scans across a batch—sees the exact same text.
 */
export async function getOrExtractPageTranscript(
  pageImageUrl: string,
  callChatCompletion: (messages: any[], temperature?: number, seed?: number) => Promise<any>
): Promise<string> {
  if (!pageImageUrl) return "";
  const cacheKey = await sha256Hex(pageImageUrl);
  const cached = pageTranscriptCache.get(cacheKey);
  if (cached !== undefined) {
    return cached;
  }

  try {
    const prompt = `Transcribe ALL candidate handwritten or typed work visible on this answer sheet VERBATIM.
STRICT RULES:
1. Reproduce the candidate's exact sentences, numbers, formulas, diagrams/tables/axis labels, and question/subpart labels (e.g. "3(a)", "(b)", "(c)") in top-to-bottom reading order.
2. Do NOT fix grammar, paraphrase, summarize, or invent text. Include margin scratch work labeled [Margin].
3. Ignore pre-printed exam instructions/headers unless needed to show which question/subpart is being answered.
4. Output strictly valid JSON: { "transcript": "string" }. Use Unicode math symbols (×, ÷, →, °, ≤, ≥, π, √) or properly double-escape backslashes so JSON stays valid.`;

    const { parsed } = await invokeJsonChat(
      callChatCompletion,
      [
        { role: "system", content: "You are a precise exam script transcriber. Output strictly valid JSON." },
        {
          role: "user",
          content: [
            { type: "text", text: prompt },
            { type: "image_url", image_url: { url: pageImageUrl, detail: "high" } }
          ]
        }
      ],
      42,
      3,
      (obj) => typeof obj?.transcript === "string" && obj.transcript.trim().length > 0
    );

    const transcript = String(parsed?.transcript || "").trim();
    if (transcript) {
      if (pageTranscriptCache.size >= MAX_TRANSCRIPT_CACHE) {
        const oldestKey = pageTranscriptCache.keys().next().value;
        if (oldestKey) pageTranscriptCache.delete(oldestKey);
      }
      pageTranscriptCache.set(cacheKey, transcript);
      return transcript;
    }
  } catch (err) {
    console.warn("[CanonicalTranscription] Failed to extract page transcript, falling back to direct image:", err);
  }
  return "";
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

      // Walk full parent_part_id chain (e.g. a -> vi -> a) so nested DB subparts don't detach
      const labelSegments: string[] = [String(p.part_label || "").trim()];
      const visitedIds = new Set<string>(p.id ? [p.id] : []);
      let curParentId = p.parent_part_id;
      while (curParentId && byId.has(curParentId) && !visitedIds.has(curParentId)) {
        visitedIds.add(curParentId);
        const parent = byId.get(curParentId);
        if (parent?.part_label) labelSegments.unshift(String(parent.part_label).trim());
        curParentId = parent?.parent_part_id;
      }
      const fullLabel = labelSegments.filter(Boolean).join(".");

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

  // 4. Detached child merging (any depth):
  // If "i" or "vi.a" exists without its top parent prefix, but "a.i" or "a.vi.a" exists, merge/delete the detached entry
  for (const k of Array.from(subpartsMap.keys())) {
    const parentWithChild = Array.from(subpartsMap.keys()).find(other => other !== k && other.endsWith("." + k));
    if (parentWithChild) {
      const detached = subpartsMap.get(k);
      const qualified = subpartsMap.get(parentWithChild);
      if (detached && qualified && detached.marks > 1 && qualified.marks <= 1) {
        qualified.marks = detached.marks;
      }
      subpartsMap.delete(k);
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
  previousAnswerSnippet?: string,
  pageTranscript?: string
): string {
  const criteriaText = rubricCriteria.map(c =>
    `${c.index}. [${c.code}] ${c.text}${c.guidance ? `\n   GUIDANCE: ${c.guidance}` : ''}`
  ).join('\n');

  const overlapNote = overlapGroups.length > 0
    ? `\nNOTE — The following criteria express THE SAME UNDERLYING IDEA (award evidence separately for each, but the scoring engine will count the group once):\n${overlapGroups.map(g => `  Group ${g.group}: criteria ${g.memberIndices.join(', ')}`).join('\n')}\n`
    : '';

  const transcriptBlock = pageTranscript
    ? `\nCANONICAL PAGE TRANSCRIPT (verbatim candidate text — quote exact phrases from this transcript in "evidence" while using the image for layout, diagrams, graphs, symbols, and y-coordinates):\n"""\n${pageTranscript}\n"""\n`
    : '';

  return `You are the Senior Chief Examiner evaluating ONE SPECIFIC SUBPART of Question ${qNum}.
SUBPART TO EVALUATE: Question ${qNum} Part (${subpartLabel})
TOTAL MARKS AVAILABLE FOR THIS SUBPART: ${marksAvailable}

OFFICIAL MARK SCHEME CRITERIA FOR THIS SUBPART:
${criteriaText}
${overlapNote}${transcriptBlock}
${previousAnswerSnippet ? `\nCANDIDATE'S PREVIOUS SUBPART ANSWER (for Follow-Through / FT credit if applicable):\n"${previousAnswerSnippet}"\n` : ''}

CRITICAL RULES FOR ATOMIC SUBPART MARKING:
1. MANDATORY 3-ZONE SYSTEMATIC INSPECTION:
   - Zone 1 (Answer Line): Check the printed dotted answer line "......................" or answer bracket at the bottom of the question. Transcribe the exact value written there. NEVER miss or overlook the final answer line!
   - Zone 2 (Main Working): Inspect every handwritten line top-to-bottom in the dedicated working space between the question prompt and the answer line.
   - Zone 3 (Margins & Scratch Work): Inspect the left, right, and lower margins directly adjacent to this subpart. If candidate ink is visible in the margin for this subpart, transcribe it into "transcription_notes" and credit valid method/accuracy criteria!
2. CANDIDATE INK ONLY:
   - Evidence MUST come exclusively from what the candidate wrote, calculated, or drew with pen or pencil.
   - Pre-printed exam paper text, diagrams, and figures belong to the exam board. NEVER credit pre-printed elements as candidate work!
3. STRICT MATHEMATICAL & ALGEBRAIC EQUIVALENCE:
   - For algebraic expressions: check variables and signs strictly! Do NOT credit mismatched expressions (e.g., "(x - 3)(x + 3)" does NOT satisfy "(x - 3)(2y + 5)").
   - For calculus: setting "dy/dx = 0" does NOT satisfy "set dy/dx = 10" or "their dy/dx = 10" unless explicitly permitted by the mark scheme.
   - For numerical accuracy (A), independent (B), coordinate, and exact mathematical-term marks: verify exact numbers, signs, coordinates, and mathematical terms strictly! NEVER mark "satisfied": true if the student's written value, coordinate, angle classification, or transformation name differs from the criterion — unless the criterion permits "oe" (or equivalent numeric/algebraic form, e.g. a combined rate or simplified fraction) or explicitly grants "FT" (follow-through consistent with the candidate's stated previous value).
4. DISTINCT EVIDENCE PER CRITERION & NO INFERENTIAL STRETCHING:
   - Mark a criterion "satisfied": true ONLY if the candidate's response EXPLICITLY states or directly demonstrates that specific criterion. Never infer an unstated motive, conclusion, or institution from a tangential or generic sentence.
   - Do NOT reuse the exact same claim or phrase across multiple overlapping criteria. However, if a compound sentence genuinely packs two distinct facts/points (e.g. two Biology steps or two History events in one sentence), BOTH may be credited provided you quote ONLY the specific minimal clause or phrase matching each criterion.
   - For each criterion (by index 0..N-1): if satisfied, quote ONLY the exact minimal clause, phrase, or expression proving that specific criterion (NOT the entire surrounding sentence); if not satisfied, "evidence" MUST be "".
   - Keep JSON valid: prefer Unicode math symbols (×, ÷, →, °, ≤, ≥, π, √) or properly double-escaped backslashes inside JSON strings.
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
    pageTranscript,
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
      previousAnswerSnippet,
      pageTranscript
    );
  } else {
    // Fallback prompt for questions without structured rubric rows
    const transcriptSnippet = pageTranscript
      ? `\nCANONICAL PAGE TRANSCRIPT (verbatim candidate text):\n"""\n${pageTranscript}\n"""\n`
      : '';
    prompt = `You are the Senior Chief Examiner evaluating Question ${questionNumber} Part (${partLabel}).
MARKS AVAILABLE: ${marksAvailable}
${transcriptSnippet}
INSTRUCTIONS:
1. Examine the candidate's response in the answer space AND in the margins/scratch workspace for this part on the attached page image.
2. Grade under standard examination marking principles for ${marksAvailable} marks.
3. Identify candidate ink only (ignore pre-printed text/diagrams).
4. Provide score (0 to ${marksAvailable}), list marks awarded and deductions, and locate the vertical answer_line_y (0-1000).

OUTPUT STRICTLY VALID JSON (prefer Unicode math symbols × ÷ → ° ≤ ≥ π √ or escape backslashes as \\\\):
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

  const isValidSubpartPayload = (obj: any): boolean => {
    if (!obj || typeof obj !== 'object') return false;
    return hasStructuredCriteria ? Array.isArray(obj.verdicts) : typeof obj.score === 'number';
  };

  let evalError = "";
  try {
    const pass1 = await invokeJsonChat(
      callChatCompletion,
      [
        { role: "system", content: "You are the Senior Chief Examiner evaluating ONE subquestion. Output strictly valid JSON." },
        { role: "user", content: userContent }
      ],
      42,
      3,
      isValidSubpartPayload
    );

    const parsed = pass1.parsed;
    const res = pass1.res;
    if (parsed) {
      const requiresVisualVerification = rubric.criteria.some((c: RubricCriterion) =>
        /\b(?:graph|curve|plot|plotted|diagram|bar\s*chart|histogram|pie\s*chart|stem\s*and\s*leaf|bearing|scale\s*drawing|grid|shaded|triangle|polygon|sketch|table|drawn)\b/i.test(`${c.text} ${c.guidance || ''}`)
      );

      // Strip fabricated quotes where an LLM copied the mark scheme verbatim instead of the script
      const sanitizePassVerdicts = (verdicts: any[]) => {
        if (!hasStructuredCriteria || requiresVisualVerification || !pageTranscript || pageTranscript.trim().length < 80) {
          return;
        }
        for (const v of verdicts) {
          if (v?.satisfied !== true) continue;
          const crit = rubric.criteria.find((c: RubricCriterion) => c.index === Number(v.criterion_index));
          if (!crit) continue;
          const ev = String(v.evidence || '');
          if (isFabricatedSchemeQuote(crit.text, ev, pageTranscript)) {
            console.log(`[AntiHallucination] Rejected ungrounded scheme quote on Q${questionNumber}${partLabel} criterion ${crit.index}: "${ev.slice(0, 60)}"`);
            v.satisfied = false;
            v.evidence = '';
          }
        }
      };

      if (Array.isArray(parsed.verdicts)) sanitizePassVerdicts(parsed.verdicts);

      // Check if any Pass 1 verdict looks mismatched against its criterion (e.g. wrong coordinate,
      // wrong numeric value, or mismatched single-word term) so it always gets moderated.
      const hasAuditFlag = hasStructuredCriteria && Array.isArray(parsed.verdicts) &&
        rubric.criteria.some((crit: RubricCriterion) => {
          const v = parsed.verdicts.find((x: any) => Number(x.criterion_index) === crit.index);
          return v?.satisfied === true && verdictNeedsModeratorAudit(crit, String(v.evidence || ''));
        });

      // Consensus stabilization:
      // Run an independent verification pass on qualitative/menu/level subparts, multi-mark or
      // multi-criterion calculation subparts, or any subpart flagged by the literal audit guard.
      const needsConsensus =
        hasStructuredCriteria &&
        Array.isArray(parsed.verdicts) &&
        (rubric.schemeType === 'menu' ||
          rubric.schemeType === 'levels' ||
          rubric.criteria.length >= 2 ||
          marksAvailable >= 2 ||
          hasAuditFlag);

      if (needsConsensus) {
        const useTextVerifier = !requiresVisualVerification && Boolean(pageTranscript && pageTranscript.trim().length >= 80);
        const verifierContent: any[] = useTextVerifier
          ? [{
              type: "text",
              text: prompt + `\nNOTE: Evaluate strictly from the CANONICAL PAGE TRANSCRIPT above; set answer_line_y to ${Number(parsed.answer_line_y) || defaultAnswerLineY || 500}.`
            }]
          : userContent;

        const pass2 = await invokeJsonChat(
          callChatCompletion,
          [
            { role: "system", content: "You are an independent Senior Moderator verifying criterion verdicts for ONE subquestion. Enforce strict literal mathematical, coordinate, and evidence rules. Output strictly valid JSON." },
            { role: "user", content: verifierContent }
          ],
          101,
          2,
          isValidSubpartPayload
        );
        const parsed2 = pass2.parsed;

        if (parsed2 && Array.isArray(parsed2.verdicts)) {
          sanitizePassVerdicts(parsed2.verdicts);
          const map1 = new Map<number, { satisfied: boolean; evidence: string }>();
          const map2 = new Map<number, { satisfied: boolean; evidence: string }>();
          parsed.verdicts.forEach((v: any) =>
            map1.set(Number(v.criterion_index), { satisfied: v.satisfied === true && Boolean(String(v.evidence || '').trim()), evidence: String(v.evidence || '').trim() })
          );
          parsed2.verdicts.forEach((v: any) =>
            map2.set(Number(v.criterion_index), { satisfied: v.satisfied === true && Boolean(String(v.evidence || '').trim()), evidence: String(v.evidence || '').trim() })
          );

          const hasDisagreement = rubric.criteria.some((c: RubricCriterion) => {
            const v1 = map1.get(c.index)?.satisfied ?? false;
            const v2 = map2.get(c.index)?.satisfied ?? false;
            return v1 !== v2;
          });

          if (hasDisagreement) {
            console.log(`[Consensus] Disagreement detected on Q${questionNumber}${partLabel} — invoking 3rd tie-breaker pass.`);
            const pass3 = await invokeJsonChat(
              callChatCompletion,
              [
                { role: "system", content: "You are the Chief Moderator breaking a marking tie on ONE subquestion. Enforce strict direct-evidence and literal mathematical accuracy rules. Output strictly valid JSON." },
                { role: "user", content: verifierContent }
              ],
              202,
              2,
              isValidSubpartPayload
            );
            const parsed3 = pass3.parsed;
            const map3 = new Map<number, { satisfied: boolean; evidence: string }>();
            if (parsed3 && Array.isArray(parsed3.verdicts)) {
              sanitizePassVerdicts(parsed3.verdicts);
              parsed3.verdicts.forEach((v: any) =>
                map3.set(Number(v.criterion_index), { satisfied: v.satisfied === true && Boolean(String(v.evidence || '').trim()), evidence: String(v.evidence || '').trim() })
              );

              parsed.verdicts = rubric.criteria.map((c: RubricCriterion) => {
                const a = map1.get(c.index);
                const b = map2.get(c.index);
                const d = map3.get(c.index);
                const votesTrue = (a?.satisfied ? 1 : 0) + (b?.satisfied ? 1 : 0) + (d?.satisfied ? 1 : 0);
                const majority = votesTrue >= 2;
                const winningEvidence = majority
                  ? ([a, b, d].find(x => x?.satisfied && x.evidence)?.evidence || '')
                  : '';
                return {
                  criterion_index: c.index,
                  satisfied: majority,
                  evidence: winningEvidence
                };
              });
            }
          }
        }
      }

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
        const dupCollapsedSet = new Set(scoring.duplicateEvidenceIndices || []);
        const contradictedSet = new Set(scoring.contradictedIndices || []);

        // Build point-by-point marking records
        rubric.criteria.forEach((crit: RubricCriterion) => {
          const v = parsed.verdicts.find((x: any) => Number(x.criterion_index) === crit.index);
          const isSatisfied = v?.satisfied === true && Boolean(v?.evidence?.trim()) && !dupCollapsedSet.has(crit.index) && !contradictedSet.has(crit.index);
          const isWaived = scoring.waivedFallbacks.includes(crit.index) || dupCollapsedSet.has(crit.index);

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
      evalError = pass1.error || res?.error || (res ? JSON.stringify(res).substring(0, 200) : "No response from callChatCompletion");
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

const MISSING_OR_FOREIGN_NOTE_PATTERNS = [
  "corresponds to question",
  "instead of question",
  "pertains to question",
  "no work for question",
  "entirely different question",
  "different question",
  "missing from the provided",
  "missing from the submitted",
  "missing from this image",
  "missing from this page",
  "not present on",
  "not visible in",
  "not found in the image",
  "not found on this page",
  "subquestion not found",
  "subpart not found",
  "not attempted or is missing",
  "no candidate response",
  "no response visible",
  "cannot be seen",
  "wrong page"
];

/**
 * Returns true when a 0-mark subpart note indicates the subpart's work is absent from
 * the page or belongs to another question, so we never stamp stray crosses onto another page.
 */
export function isMissingOrForeignSubpartNote(sp: {
  score?: number;
  teacher_correction_note?: string;
  constructive_correction?: string;
  deductions?: string[];
}): boolean {
  if ((Number(sp.score) || 0) > 0) return false;
  const combined = [
    sp.teacher_correction_note || "",
    sp.constructive_correction || "",
    ...(Array.isArray(sp.deductions) ? sp.deductions : [])
  ]
    .join(" ")
    .toLowerCase();
  if (!combined) return false;
  return MISSING_OR_FOREIGN_NOTE_PATTERNS.some((p) => combined.includes(p));
}

/**
 * Selects the best fallback canonical page index for a question when a subpart has no exact bbox.
 * Prefers a dedicated page for the question, then the page with the most located subparts, then the last candidate.
 */
function selectBestQuestionPageIndex(layout: any, qNum: string): number {
  const fps: any[] = Array.isArray(layout?.page_fingerprints) ? layout.page_fingerprints : [];
  const candidates = fps.filter(
    (fp: any) => Array.isArray(fp.detected_questions) && fp.detected_questions.includes(qNum)
  );
  if (candidates.length === 0) return -1;
  if (candidates.length === 1) return candidates[0].raw_page_index;

  // Count explicitly located subparts per canonical page for this question
  const locCounts = new Map<number, number>();
  if (layout?.subpart_locations instanceof Map) {
    layout.subpart_locations.forEach((loc: any, key: string) => {
      if (key.startsWith(`${qNum}:`) && typeof loc?.canonical_page_index === "number") {
        locCounts.set(loc.canonical_page_index, (locCounts.get(loc.canonical_page_index) || 0) + 1);
      }
    });
  }

  // 1. Prefer a dedicated page where qNum is the sole question (with work if available)
  const dedicated = candidates.filter(
    (fp: any) => Array.isArray(fp.detected_questions) && fp.detected_questions.length === 1
  );
  if (dedicated.length > 0) {
    dedicated.sort((a: any, b: any) => (locCounts.get(b.raw_page_index) || 0) - (locCounts.get(a.raw_page_index) || 0));
    return dedicated[0].raw_page_index;
  }

  // 2. Otherwise pick the matching page with the most located subparts for qNum
  let best = candidates[candidates.length - 1];
  let bestCount = -1;
  for (const fp of candidates) {
    const cnt = locCounts.get(fp.raw_page_index) || 0;
    if (cnt > bestCount) {
      bestCount = cnt;
      best = fp;
    }
  }
  return best.raw_page_index;
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
  const unattemptedQuestions: any[] = [];
  const hasFingerprintCoverage = Array.isArray(layout?.page_fingerprints) && layout.page_fingerprints.length > 0;

  officialPaperQuestions.forEach((oq: any, qIdx: number) => {
    const qNum = String(oq.question_number || (qIdx + 1)).trim();
    const qMarks = Number(oq.marks) || 10;
    const ms = solutionsMap[oq.id] || "";
    const dbParts = dbPartsMap[oq.id] || [];

    const subparts = extractQuestionSubparts(qNum, qMarks, ms, dbParts);

    // Look for the best matching canonical page for this question
    const matchedPageIndex = selectBestQuestionPageIndex(layout, qNum);

    // Check if any subparts have explicit locations from fingerprinter layout
    let subpartLocated = false;
    subparts.forEach((sp) => {
      const subKey = `${qNum}:${sp.canonical_label}`;
      if (layout?.subpart_locations?.has(subKey)) {
        subpartLocated = true;
      }
    });

    // If booklet pages were fingerprinted and this question was NOT detected anywhere in the booklet:
    // This question was NOT attempted by the candidate (e.g. skipped optional question in Section B).
    // NEVER fall back to an arbitrary page (which dumps unattempted questions on top of other questions)!
    if (hasFingerprintCoverage && matchedPageIndex < 0 && !subpartLocated) {
      console.log(`[AtomicBookletEvaluator] Question ${qNum} not present on any page in booklet — marking as unattempted.`);
      unattemptedQuestions.push({
        identified_question_number: qNum,
        question_number: qNum,
        identified_topic: oq.topic || "Examination Script",
        score: 0,
        total_score: 0,
        max_score: qMarks,
        total_max_score: qMarks,
        percentage: 0,
        subparts: subparts.map(sp => ({
          question_number: qNum,
          part_label: sp.part_label,
          canonical_label: sp.canonical_label,
          score: 0,
          max_score: sp.marks,
          line_y: 500,
          page_index: -1,
          student_answer_detected: "",
          marks_awarded: [],
          deductions: [`Question ${qNum} not attempted`],
          teacher_correction_note: "",
          constructive_correction: "",
          mistake_details: "Unattempted",
          marking_points: [],
          unattempted: true
        })),
        spanned_pages: [],
        start_page: null,
        end_page: null,
        overall_feedback: `Question ${qNum} was not attempted in this submission.`,
        examiner_model_solution: "",
        recommended_next_step: "",
        unattempted: true,
        model_used: "unattempted-detector"
      });
      return;
    }

    let fallbackPageIndex = matchedPageIndex;
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

  // Extract one canonical verbatim transcript per active page before dispatching subparts,
  // so every subpart on the same sheet—and repeated scans of the same image—sees identical text.
  const uniquePageIndices = Array.from(new Set(tasks.map(t => t.input.canonicalPageIndex)));
  const transcriptsByPage = new Map<number, string>();
  if (uniquePageIndices.length > 0) {
    console.log(`[AtomicBookletEvaluator] Extracting canonical transcript for ${uniquePageIndices.length} page(s)...`);
    await runWithConcurrencyLimit(uniquePageIndices, 4, async (pIdx) => {
      const tr = await getOrExtractPageTranscript(canonicalImages[pIdx], callChatCompletion);
      if (tr) transcriptsByPage.set(pIdx, tr);
    });
    tasks.forEach((t) => {
      const tr = transcriptsByPage.get(t.input.canonicalPageIndex);
      if (tr) t.input.pageTranscript = tr;
    });
  }

  console.log(`[AtomicBookletEvaluator] Dispatched ${tasks.length} atomic subquestions across ${canonicalImages.length} canonical pages (concurrency 10)...`);
  const t0 = Date.now();

  const evaluatedSubparts = await runWithConcurrencyLimit(
    tasks,
    10,
    async (t) => evaluateSubpartAtomically(t.input, callChatCompletion)
  );

  console.log(`[AtomicBookletEvaluator] Completed all ${evaluatedSubparts.length} atomic evaluations in ${((Date.now() - t0) / 1000).toFixed(1)}s`);

  // Group subparts by question and enforce deterministic caps
  const unattemptedSet = new Set<string>(
    unattemptedQuestions.map((uq: any) => String(uq.question_number).trim())
  );
  const questionEvaluations: any[] = [];
  let grandTotalScore = 0;
  const grandTotalMax = officialPaperQuestions.reduce((s: number, q: any) => s + (Number(q.marks) || 0), 0);

  officialPaperQuestions.forEach((oq: any) => {
    const qNum = String(oq.question_number).trim();
    if (unattemptedSet.has(qNum)) return; // Already recorded cleanly in unattemptedQuestions
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

    const validSubparts = deduplicatedSubparts.filter((sp) => {
      if ((sp as any).unattempted || sp.page_index < 0) return false;
      if (isMissingOrForeignSubpartNote(sp)) return false;
      return true;
    });

    const spannedPages = Array.from(new Set(validSubparts.map(sp => sp.page_index)))
      .filter((p: number) => !isNaN(p) && p >= 0 && p < canonicalImages.length);

    const safeSpanned = spannedPages;
    const isUnattempted = safeSpanned.length === 0 && finalQScore === 0;

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
      start_page: safeSpanned.length > 0 ? Math.min(...safeSpanned) : null,
      end_page: safeSpanned.length > 0 ? Math.max(...safeSpanned) : null,
      overall_feedback: feedbackStr,
      examiner_model_solution: "",
      recommended_next_step: "",
      unattempted: isUnattempted,
      model_used: "atomic-subpart-engine"
    });
  });

  const combinedEvaluations = [...questionEvaluations, ...unattemptedQuestions];
  combinedEvaluations.sort((a, b) => {
    const na = parseInt(String(a.question_number).replace(/\D/g, ''), 10) || 0;
    const nb = parseInt(String(b.question_number).replace(/\D/g, ''), 10) || 0;
    return na - nb;
  });

  const finalPercentage = grandTotalMax > 0
    ? Math.round((grandTotalScore / grandTotalMax) * 100)
    : 0;

  // Use the deduplicated subparts across attempted questions so duplicate subparts
  // can never leak into synthesized annotations or page subparts.
  const deduplicatedAllSubparts: AtomicSubpartOutput[] = questionEvaluations.flatMap(
    (qe: any) => (Array.isArray(qe.subparts) ? qe.subparts : [])
  );

  return {
    questionEvaluations: combinedEvaluations,
    allSubparts: deduplicatedAllSubparts,
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

  // Deduplicate subparts by (question_number, canonical_label) before grouping by page
  const uniqueSubpartsMap = new Map<string, AtomicSubpartOutput>();
  subparts.forEach((sp) => {
    const p = sp.page_index;
    if (typeof p !== 'number' || p < 0 || p >= canonicalImages.length) return;
    if ((sp as any).unattempted) return;

    // Filter out annotations that are explicit mismatch or missing-work notices
    if (isMissingOrForeignSubpartNote(sp)) return; // Do not stamp annotations on the wrong question's page!

    const qKey = String(sp.question_number || '').trim();
    const partKey = canonicalLabel(sp.canonical_label || sp.part_label || '');
    const uniqueKey = `${qKey}::${partKey}`;
    const existing = uniqueSubpartsMap.get(uniqueKey);
    if (!existing || (Number(sp.score) || 0) > (Number(existing.score) || 0)) {
      uniqueSubpartsMap.set(uniqueKey, sp);
    }
  });

  // Group deduplicated subparts by page index
  const subpartsByPage = new Map<number, AtomicSubpartOutput[]>();
  uniqueSubpartsMap.forEach((sp) => {
    const p = sp.page_index;
    if (!subpartsByPage.has(p)) subpartsByPage.set(p, []);
    subpartsByPage.get(p)!.push(sp);
  });

  subpartsByPage.forEach((pageSubs, pIdx) => {
    // Sort subparts by vertical baseline
    pageSubs.sort((a, b) => a.line_y - b.line_y);

    // Reserve bottom y >= 870 for bottom-right per-question total stamps
    const maxBadgeY = 860;
    const minBadgeGap = pageSubs.length > 10 ? Math.max(22, Math.floor(800 / pageSubs.length)) : 28;
    let prevBadgeY = 0;
    pageSubs.forEach((sp) => {
      let yMid = Math.min(Math.max(sp.line_y, 35), maxBadgeY);
      if (prevBadgeY > 0 && yMid < prevBadgeY + minBadgeGap) {
        yMid = Math.min(prevBadgeY + minBadgeGap, maxBadgeY);
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
        box_2d: [Math.max(yMid - 14, 25), 865, Math.min(yMid + 14, 875), 975],
        question_number: sp.question_number,
        subpart_label: sp.part_label,
        page_index: pIdx
      });

      // 2. Inline ticks for earned marking points
      // Spread ticks neatly to the left of the margin badge (x <= 785) so multi-mark ticks never pile on top of each other
      const earnedCount = Math.min(Math.max(0, sp.score), sp.max_score);
      const tickStep = earnedCount > 6 ? 24 : 28;
      const tickStartX = Math.max(460, 785 - Math.max(0, earnedCount - 1) * tickStep);
      for (let k = 0; k < earnedCount; k++) {
        const tickY = Math.max(yMid - 10, 25);
        const tickX = Math.min(tickStartX + k * tickStep, 785);
        annotations.push({
          type: 'inline_tick',
          text: '✓',
          comment: sp.marks_awarded?.[k] || `Part ${sp.part_label} mark ${k + 1} earned`,
          box_2d: [Math.max(tickY - 14, 25), tickX, Math.min(tickY + 14, 875), Math.min(tickX + 22, 810)],
          question_number: sp.question_number,
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
          box_2d: [Math.min(yMid + 16, 845), 160, Math.min(yMid + 50, 880), 820],
          question_number: sp.question_number,
          subpart_label: sp.part_label,
          page_index: pIdx
        });
      }
    });
  });

  return annotations;
}


