/**
 * PAGE FINGERPRINTER & BOOKLET SORTER
 * 
 * Phase 1 & Phase 2 of the Deterministic Marking Architecture:
 * 
 * Phase 1: 1-Page Isolated Vision Fingerprinting
 * - Inspects each page image completely independently at high resolution.
 * - Extracts detected questions, subpart labels, answer line coordinates, and candidate work status.
 * - Zero LLM overload: 1 prompt = 1 page. No attention smearing across 12 pages.
 * 
 * Phase 2: Deterministic Booklet Sorter (Pure TypeScript - Zero LLM)
 * - Automatically orders pages into canonical chronological order (Q1 -> Q10, (a) -> (b) -> (c)).
 * - Maps every subpart to its canonical page index and coordinates.
 * - Eliminates errors caused by out-of-order student uploads or scrambled filenames.
 */

export interface DetectedSubpart {
  question_number: string;
  part_label: string;          // e.g. "(a)", "(b)(i)", "(b)(ii)"
  answer_line_y: number;       // 0 to 1000 coordinate
  has_student_work: boolean;   // true if student wrote/calculated anything
  student_answer_snippet?: string; // e.g. "150", "0.025", "x = 5"
}

export interface PageFingerprint {
  raw_page_index: number;
  printed_page_number: number | null;
  detected_questions: string[];
  subparts: DetectedSubpart[];
  is_continuation: boolean;
  summary: string;
}

export interface BookletLayout {
  canonical_order: number[];       // maps canonical page index -> original raw page index
  canonical_images: string[];      // rawImages sorted in canonical order
  page_fingerprints: PageFingerprint[]; // fingerprints re-indexed to canonical order
  subpart_locations: Map<string, {
    canonical_page_index: number;
    answer_line_y: number;
    has_student_work: boolean;
    student_answer_snippet?: string;
  }>;
}

/**
 * Normalise subpart label for sorting and matching:
 * "(b)(ii)" -> "b.ii", "3(a)" -> "a", "a" -> "a"
 */
export function canonicalSubpartLabel(label: string): string {
  let s = String(label || '').toLowerCase().trim();
  s = s.replace(/^\d{1,2}\s*(?=[({.]*[a-z]|[a-z]$)/, '');
  return s
    .replace(/[()]/g, '.')
    .replace(/\s+/g, '')
    .replace(/\.+/g, '.')
    .replace(/^\.|\.$/g, '');
}

/**
 * Canonical lookup key for a subpart in a paper:
 * e.g. ("4", "(b)(ii)") -> "4:b.ii"
 */
export function getSubpartKey(questionNumber: string, partLabel: string): string {
  const cleanQ = String(questionNumber || '1').replace(/^Q(?:uestion)?\s*/i, '').trim();
  const cleanPart = canonicalSubpartLabel(partLabel);
  return `${cleanQ}:${cleanPart || 'whole'}`;
}

/**
 * Assign numerical sort weight to subpart labels:
 * 'a' -> 100, 'b.i' -> 210, 'b.ii' -> 220, 'c' -> 300, etc.
 */
export function getSubpartSortWeight(label: string): number {
  const clean = canonicalSubpartLabel(label);
  if (!clean || clean === 'whole') return 0;
  
  const topLetter = clean[0];
  const letterWeight = (topLetter.charCodeAt(0) - 97 + 1) * 100; // a=100, b=200, c=300...
  
  if (clean.includes('.')) {
    const roman = clean.split('.')[1];
    const romanMap: Record<string, number> = {
      'i': 10, 'ii': 20, 'iii': 30, 'iv': 40, 'v': 50, 'vi': 60,
      '1': 10, '2': 20, '3': 30, '4': 40, '5': 50, '6': 60
    };
    return letterWeight + (romanMap[roman] || 15);
  }
  
  return letterWeight;
}

/**
 * Builds the isolated 1-page vision fingerprinting prompt.
 */
export function buildPageFingerprintPrompt(
  validQuestions: Array<{ question_number: string; marks?: number; topic?: string }>
): string {
  const qList = validQuestions && validQuestions.length > 0
    ? validQuestions.map(q => `• Question ${q.question_number} [${q.marks || '?'} marks]${q.topic ? ` (${q.topic})` : ''}`).join('\n')
    : '• Question 1, Question 2, Question 3, Question 4, Question 5, Question 6, Question 7, Question 8, Question 9, Question 10';

  return `You are the Senior Chief Examiner's Document Classifier (Vision Indexer).
Your ONLY job is to inspect THIS SINGLE examination page image and identify which questions and subparts appear on it.

TARGET QUESTIONS IN THIS EXAMINATION PAPER:
${qList}

INSTRUCTIONS:
1. PRINTED PAGE NUMBER:
   - Identify the printed page number on the sheet if visible (e.g. at the top or bottom of the page).
2. QUESTIONS DETECTED:
   - Identify all question numbers printed or handwritten by the student on this sheet (e.g. Question 1, 2, ..., 12, '12 (a)', 'Q4', etc.).
   - ONLY match questions from the TARGET QUESTIONS list above.
3. SUBPARTS DETECTED:
   - Identify every subpart printed or attempted on this sheet (e.g. (a), (b)(i), (b)(ii), (c), etc.).
   - For each subpart, estimate the vertical coordinate (answer_line_y, between 0 and 1000) where the printed answer space or student's final response baseline is located.
   - Note whether candidate ink (handwriting, numbers, formulas, drawings) is present for this subpart (has_student_work: true/false).
   - If the student wrote a final answer on the answer line, capture a brief snippet in student_answer_snippet (e.g. "150", "0.025", "x = 5").
4. CONTINUATION / WORKSPACE:
   - Determine if this page is a continuation sheet or contains only margin working for a question begun on an earlier page.

OUTPUT STRICTLY VALID JSON MATCHING THIS SCHEMA:
{
  "printed_page_number": number | null,
  "detected_questions": ["string (e.g. '1', '7', '8')"],
  "subparts": [
    {
      "question_number": "string",
      "part_label": "string (e.g. '(a)', '(b)(i)', '(b)(ii)')",
      "answer_line_y": number,
      "has_student_work": boolean,
      "student_answer_snippet": "string"
    }
  ],
  "is_continuation": boolean,
  "summary": "string — 1-sentence summary of what is on this page"
}`;
}

/**
 * Fingerprints a single page image in complete isolation.
 */
export async function fingerprintSinglePage(
  imageUrl: string,
  rawPageIndex: number,
  validQuestions: Array<{ question_number: string; marks?: number; topic?: string }>,
  callChatCompletion: (messages: any[], temperature?: number) => Promise<any>
): Promise<PageFingerprint> {
  const prompt = buildPageFingerprintPrompt(validQuestions);
  
  const userContent: any[] = [
    { type: "text", text: prompt },
    { type: "image_url", image_url: { url: imageUrl, detail: "high" } }
  ];

  try {
    const res = await callChatCompletion(
      [
        { role: "system", content: "You are the Senior Chief Examiner's Document Classifier. Output strictly valid JSON." },
        { role: "user", content: userContent }
      ],
      0.0
    );

    if (res?.ok && res?.data?.choices?.[0]?.message?.content) {
      const rawText = res.data.choices[0].message.content
        .replace(/^```(?:json)?\s*/i, '')
        .replace(/\s*```$/i, '')
        .trim();
      const parsed = JSON.parse(rawText);

      const detectedQuestions: string[] = Array.isArray(parsed.detected_questions)
        ? parsed.detected_questions.map((q: any) => String(q).replace(/[^0-9]/g, '')).filter(Boolean)
        : [];

      const rawSubparts: any[] = Array.isArray(parsed.subparts) ? parsed.subparts : [];
      const subparts: DetectedSubpart[] = rawSubparts.map((sp: any) => {
        let qNum = String(sp.question_number || detectedQuestions[0] || '1').replace(/[^0-9]/g, '');
        let partLabel = String(sp.part_label || '(a)').trim();
        let y = Number(sp.answer_line_y);
        if (isNaN(y) || y < 20 || y > 980) y = 500;
        return {
          question_number: qNum,
          part_label: partLabel,
          answer_line_y: Math.round(y),
          has_student_work: sp.has_student_work !== false,
          student_answer_snippet: sp.student_answer_snippet ? String(sp.student_answer_snippet).slice(0, 80) : undefined
        };
      });

      return {
        raw_page_index: rawPageIndex,
        printed_page_number: typeof parsed.printed_page_number === 'number' ? parsed.printed_page_number : null,
        detected_questions: detectedQuestions,
        subparts,
        is_continuation: parsed.is_continuation === true,
        summary: String(parsed.summary || `Page ${rawPageIndex + 1}`)
      };
    }
  } catch (err) {
    console.warn(`fingerprintSinglePage failed for raw page ${rawPageIndex}:`, err);
  }

  // Graceful fallback if call failed
  return {
    raw_page_index: rawPageIndex,
    printed_page_number: null,
    detected_questions: [String(rawPageIndex + 1)],
    subparts: [],
    is_continuation: false,
    summary: `Raw page ${rawPageIndex + 1}`
  };
}

/**
 * Phase 2: Pure TypeScript Booklet Sorter
 * Reorders pages into canonical chronological order (Q1 -> Q10, subparts a -> b -> c).
 */
export function sortBookletPages(
  rawImages: string[],
  fingerprints: PageFingerprint[],
  officialPaperQuestions: Array<{ question_number: string; marks?: number }>
): BookletLayout {
  const pageEntries = fingerprints.map((fp) => {
    // Determine the earliest question number appearing on this page
    const qNums = fp.detected_questions
      .map(q => parseInt(q, 10))
      .filter(n => !isNaN(n));
    const minQ = qNums.length > 0 ? Math.min(...qNums) : 999;

    // Determine the earliest subpart weight on this page
    const subWeights = fp.subparts.map(sp => getSubpartSortWeight(sp.part_label));
    const minSubWeight = subWeights.length > 0 ? Math.min(...subWeights) : 9999;

    return {
      raw_page_index: fp.raw_page_index,
      minQ,
      minSubWeight,
      printedPage: fp.printed_page_number,
      fingerprint: fp
    };
  });

  // Pure deterministic multi-criteria sorting
  pageEntries.sort((a, b) => {
    // 1. Primary sort: Question number sequence (Q1 comes before Q2, etc.)
    if (a.minQ !== b.minQ) {
      return a.minQ - b.minQ;
    }

    // 2. Secondary sort: Within the same question, subpart sequence (a before b before c)
    if (a.minSubWeight !== b.minSubWeight && a.minSubWeight !== 9999 && b.minSubWeight !== 9999) {
      return a.minSubWeight - b.minSubWeight;
    }

    // 3. Tertiary sort: If printed page numbers exist on both sheets
    if (typeof a.printedPage === 'number' && typeof b.printedPage === 'number') {
      return a.printedPage - b.printedPage;
    }

    // 4. Stable tie-breaker: Preserve original upload order
    return a.raw_page_index - b.raw_page_index;
  });

  const canonicalOrder = pageEntries.map(e => e.raw_page_index);
  const canonicalImages = canonicalOrder.map(oldIdx => rawImages[oldIdx]);

  // Re-index fingerprints to match canonical order [0, 1, ..., N-1]
  const reindexedFingerprints: PageFingerprint[] = pageEntries.map((e, newIdx) => ({
    ...e.fingerprint,
    raw_page_index: newIdx // now represents the canonical page index
  }));

  // Build the inverted map: subpart -> canonical page index & coordinates
  const subpartLocations = new Map<string, {
    canonical_page_index: number;
    answer_line_y: number;
    has_student_work: boolean;
    student_answer_snippet?: string;
  }>();

  reindexedFingerprints.forEach((fp, canonIdx) => {
    fp.subparts.forEach((sp) => {
      const key = getSubpartKey(sp.question_number, sp.part_label);
      if (!subpartLocations.has(key) || sp.has_student_work) {
        subpartLocations.set(key, {
          canonical_page_index: canonIdx,
          answer_line_y: sp.answer_line_y,
          has_student_work: sp.has_student_work,
          student_answer_snippet: sp.student_answer_snippet
        });
      }
    });
  });

  return {
    canonical_order: canonicalOrder,
    canonical_images: canonicalImages,
    page_fingerprints: reindexedFingerprints,
    subpart_locations: subpartLocations
  };
}

/**
 * Runs isolated fingerprinting across all pages in parallel, then deterministically sorts the booklet.
 */
export async function fingerprintAndSortBooklet(
  rawImages: string[],
  officialPaperQuestions: Array<{ question_number: string; marks?: number; topic?: string }>,
  callChatCompletion: (messages: any[], temperature?: number) => Promise<any>
): Promise<BookletLayout> {
  console.log(`[BookletSorter] Starting isolated 1-page fingerprinting for ${rawImages.length} pages in parallel...`);
  const t0 = Date.now();

  const fingerprints = await Promise.all(
    rawImages.map((img, idx) =>
      fingerprintSinglePage(img, idx, officialPaperQuestions, callChatCompletion)
    )
  );

  console.log(`[BookletSorter] Completed isolated fingerprinting in ${((Date.now() - t0) / 1000).toFixed(1)}s`);

  const layout = sortBookletPages(rawImages, fingerprints, officialPaperQuestions);
  console.log(`[BookletSorter] Canonical page ordering (raw -> canonical):`, layout.canonical_order);

  return layout;
}
