import { supabase } from './supabase';

export interface SubpartTargetOption {
  key: string; // e.g. "Q2::(a)"
  questionNumber: string; // e.g. "2"
  partLabel: string; // e.g. "(a)"
  displayLabel: string; // e.g. "Q2 (a)"
  score: number;
  maxScore: number;
  pageIndex: number;
  topic?: string;
  studentAnswer?: string;
  marksAwarded?: string[];
  deductions?: string[];
  teacherNote?: string;
}

export interface SubpartPatchItem {
  question_number: string;
  part_label: string;
  new_score: number;
  max_score?: number;
  marks_awarded?: string[];
  deductions?: string[];
  teacher_correction_note?: string;
  constructive_correction?: string;
  reason_summary?: string;
}

export interface AppliedSubpartDiff {
  questionNumber: string;
  partLabel: string;
  oldScore: number;
  newScore: number;
  maxScore: number;
  pageIndex: number;
  summary?: string;
}

export interface AssistantChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  targetLabel?: string;
  diffs?: AppliedSubpartDiff[];
  oldTotal?: number;
  newTotal?: number;
  maxTotal?: number;
  affectedPages?: number[];
  snapshotBefore?: {
    total_score: number;
    max_score: number;
    percentage: number;
    assessment_result: any;
  };
  undone?: boolean;
}

/**
 * Normalizes subpart labels so "(a)", "2(a)", "Q2 (a)", "Part a", "a(i)", "(a)(i)"
 * can be compared reliably within a question context.
 */
export function normalizeSubpartKey(rawLabel: string, questionNum?: string): string {
  if (!rawLabel) return '';
  let s = String(rawLabel).trim().toLowerCase();
  s = s.replace(/^part\s+/i, '').replace(/^question\s+/i, '').replace(/^q\s*/i, '').trim();

  if (questionNum) {
    const qClean = String(questionNum).trim().toLowerCase().replace(/^q(?:uestion)?\s*/i, '');
    if (qClean && s.startsWith(qClean)) {
      const rest = s.slice(qClean.length).trim();
      if (rest.startsWith('(') || rest.startsWith('.') || rest.startsWith(' ') || /^[a-z]/i.test(rest)) {
        s = rest.replace(/^[.\s-]+/, '');
      }
    }
  }

  return s.replace(/[^a-z0-9]/g, '');
}

export function normalizeQuestionNum(rawQ?: string | number): string {
  if (rawQ === undefined || rawQ === null) return '1';
  const cleaned = String(rawQ).trim().replace(/^q(?:uestion)?\s*/i, '').trim();
  return cleaned || '1';
}

/**
 * Extracts a structured list of all Questions & Subparts in a marked paper
 * so the teacher can target any question/subpart in 1 click or let the AI auto-detect it.
 */
export function extractSubpartTargets(
  assessmentResult: any,
  fallbackTotalScore = 0,
  fallbackMaxScore = 10
): SubpartTargetOption[] {
  if (!assessmentResult) return [];

  const options: SubpartTargetOption[] = [];
  const qSummaries = Array.isArray(assessmentResult.question_summaries)
    ? assessmentResult.question_summaries
    : [];

  if (qSummaries.length > 0) {
    qSummaries.forEach((qs: any) => {
      const qNum = normalizeQuestionNum(qs.question_number);
      const defaultPage = Array.isArray(qs.spanned_pages) && qs.spanned_pages.length > 0
        ? Number(qs.spanned_pages[0]) || 0
        : 0;
      const subparts = Array.isArray(qs.subparts) ? qs.subparts : [];

      subparts.forEach((sp: any, idx: number) => {
        const pLabel = String(sp.part_label || `(${idx + 1})`).trim();
        const pageIdx = typeof sp.page_index === 'number' ? sp.page_index : defaultPage;
        const cleanDisplayPart = pLabel.toLowerCase().startsWith(qNum.toLowerCase())
          ? `Q${pLabel}`
          : `Q${qNum} ${pLabel.startsWith('(') ? pLabel : `(${pLabel})`}`;

        options.push({
          key: `Q${qNum}::${pLabel}`,
          questionNumber: qNum,
          partLabel: pLabel,
          displayLabel: cleanDisplayPart,
          score: Number(sp.score ?? 0),
          maxScore: Number(sp.max_score ?? 1),
          pageIndex: pageIdx,
          topic: qs.topic,
          studentAnswer: sp.student_answer_detected,
          marksAwarded: sp.marks_awarded,
          deductions: sp.deductions,
          teacherNote: sp.teacher_correction_note,
        });
      });
    });
  } else {
    const qNum = normalizeQuestionNum(assessmentResult.identified_question_number || '1');
    const subparts = Array.isArray(assessmentResult.subparts) ? assessmentResult.subparts : [];
    subparts.forEach((sp: any, idx: number) => {
      const pLabel = String(sp.part_label || `(${idx + 1})`).trim();
      const pageIdx = typeof sp.page_index === 'number' ? sp.page_index : 0;
      options.push({
        key: `Q${qNum}::${pLabel}`,
        questionNumber: qNum,
        partLabel: pLabel,
        displayLabel: `Q${qNum} ${pLabel.startsWith('(') ? pLabel : `(${pLabel})`}`,
        score: Number(sp.score ?? 0),
        maxScore: Number(sp.max_score ?? fallbackMaxScore),
        pageIndex: pageIdx,
        topic: assessmentResult.identified_topic,
        studentAnswer: sp.student_answer_detected,
        marksAwarded: sp.marks_awarded,
        deductions: sp.deductions,
        teacherNote: sp.teacher_correction_note,
      });
    });

    if (options.length === 0) {
      options.push({
        key: `Q${qNum}::(all)`,
        questionNumber: qNum,
        partLabel: '(all)',
        displayLabel: `Q${qNum}`,
        score: fallbackTotalScore,
        maxScore: fallbackMaxScore,
        pageIndex: 0,
        topic: assessmentResult.identified_topic,
      });
    }
  }

  return options;
}

/**
 * Updates annotations on a specific page for a modified subpart while keeping all
 * spatial coordinates (`line_y` / `box_2d`) anchored to the student's answer line.
 */
function syncSubpartAnnotationsOnList(
  annotations: any[],
  subpart: any,
  questionNumber: string,
  pageIndex: number
): any[] {
  if (!Array.isArray(annotations)) return [];

  const targetNorm = normalizeSubpartKey(subpart.part_label, questionNumber);
  const rawPartNorm = String(subpart.part_label || '').toLowerCase().replace(/[^a-z0-9]/g, '');

  const matchesThisSubpart = (ann: any): boolean => {
    if (!ann?.subpart_label) return false;
    if (typeof ann.page_index === 'number' && ann.page_index !== pageIndex) return false;
    const annQ = ann.question_number ? normalizeQuestionNum(ann.question_number) : undefined;
    if (annQ && annQ !== questionNumber) return false;

    const annRaw = String(ann.subpart_label).toLowerCase().replace(/[^a-z0-9]/g, '');
    const annNorm = normalizeSubpartKey(ann.subpart_label, questionNumber);
    if (annRaw && rawPartNorm && annRaw === rawPartNorm) return true;
    // Only match bare normalized key if the page doesn't have another question with the same bare key,
    // or if subpart_label explicitly starts with questionNumber
    if (annNorm && targetNorm && annNorm === targetNorm) {
      const explicitQMatch = String(ann.subpart_label)
        .trim()
        .toLowerCase()
        .replace(/^q(?:uestion)?\s*/i, '')
        .startsWith(questionNumber.toLowerCase());
      if (explicitQMatch || !/^\d/.test(String(ann.subpart_label).trim())) {
        return true;
      }
    }
    return false;
  };

  // Locate existing anchor Y from existing badge or subpart.line_y
  const existingBadge = annotations.find(
    (a) =>
      matchesThisSubpart(a) &&
      (a.type === 'mark_badge' || ((a.text || '').includes('/') && a.type !== 'total_header'))
  );

  const anchorY: number =
    typeof subpart.line_y === 'number' && subpart.line_y >= 25
      ? subpart.line_y
      : existingBadge?.box_2d
      ? Math.round((existingBadge.box_2d[0] + existingBadge.box_2d[2]) / 2)
      : 220;

  const badgeBox: [number, number, number, number] = existingBadge?.box_2d
    ? [...existingBadge.box_2d] as [number, number, number, number]
    : [Math.max(anchorY - 14, 25), 865, Math.min(anchorY + 14, 975), 975];

  const badgeLabel = existingBadge?.subpart_label || subpart.part_label;
  const newScore = Number(subpart.score ?? 0);
  const maxScore = Number(subpart.max_score ?? 1);

  // Remove old marks/notes belonging to this subpart so we can cleanly rebuild them at anchorY
  const kept = annotations.filter((a) => !matchesThisSubpart(a));

  // 1. Margin score badge
  kept.push({
    ...(existingBadge || {}),
    type: 'mark_badge',
    text: `(${newScore}/${maxScore})`,
    comment:
      newScore > 0
        ? subpart.marks_awarded?.[0] || `Part ${subpart.part_label}: ${newScore}/${maxScore} marks`
        : subpart.deductions?.[0] || `Part ${subpart.part_label}: 0/${maxScore} marks`,
    box_2d: badgeBox,
    subpart_label: badgeLabel,
    page_index: pageIndex,
  });

  // 2. Inline ticks for earned marks (or cross if 0)
  const earnedCount = Math.min(Math.max(0, newScore), maxScore);
  for (let k = 0; k < earnedCount; k++) {
    const tickY = Math.max(anchorY - 10, 25);
    const tickX = Math.min(740 + k * 35, 835);
    kept.push({
      type: 'inline_tick',
      text: '✓',
      comment: subpart.marks_awarded?.[k] || `Part ${subpart.part_label} mark ${k + 1} earned`,
      box_2d: [Math.max(tickY - 14, 25), tickX, Math.min(tickY + 14, 940), Math.min(tickX + 28, 855)],
      subpart_label: badgeLabel,
      page_index: pageIndex,
    });
  }

  if (newScore === 0) {
    kept.push({
      type: 'cross',
      text: '✗',
      comment: subpart.deductions?.[0] || subpart.teacher_correction_note || '0 marks awarded',
      teacher_correction: subpart.teacher_correction_note || '',
      box_2d: [Math.max(anchorY - 12, 25), 480, Math.min(anchorY + 12, 940), 510],
      subpart_label: badgeLabel,
      page_index: pageIndex,
    });
  }

  // 3. Handwritten red-ink teacher note if marks were lost
  const cleanNote = String(subpart.teacher_correction_note || '').trim();
  if (newScore < maxScore && cleanNote) {
    kept.push({
      type: 'teacher_note',
      text: cleanNote,
      comment: subpart.constructive_correction || cleanNote,
      teacher_correction: cleanNote,
      box_2d: [Math.min(anchorY + 16, 940), 160, Math.min(anchorY + 50, 975), 840],
      subpart_label: badgeLabel,
      page_index: pageIndex,
    });
  }

  return kept;
}

/**
 * Applies structured AI subpart updates to `assessment_result`, keeping `question_summaries`,
 * `pages`, `subparts`, `annotations`, `Booklet Total`, and overall scores 100% consistent.
 */
export function applyMarkingPatchToAssessment(
  originalAssessment: any,
  updates: SubpartPatchItem[],
  currentTotalScore: number,
  currentMaxScore: number
): {
  updatedAssessment: any;
  newTotalScore: number;
  newMaxScore: number;
  newPercentage: number;
  appliedDiffs: AppliedSubpartDiff[];
  affectedPages: number[];
} {
  const assessment = JSON.parse(JSON.stringify(originalAssessment || {}));
  const appliedDiffs: AppliedSubpartDiff[] = [];
  const affectedPagesSet = new Set<number>();

  if (!Array.isArray(updates) || updates.length === 0) {
    const pct = currentMaxScore > 0 ? Math.round((currentTotalScore / currentMaxScore) * 100) : 0;
    return {
      updatedAssessment: assessment,
      newTotalScore: currentTotalScore,
      newMaxScore: currentMaxScore,
      newPercentage: pct,
      appliedDiffs: [],
      affectedPages: [],
    };
  }

  const qSummaries: any[] = Array.isArray(assessment.question_summaries)
    ? assessment.question_summaries
    : [];

  const oldQuestionsSum = qSummaries.length > 0
    ? qSummaries.reduce((sum, q) => sum + (Number(q.score) || 0), 0)
    : (Array.isArray(assessment.subparts)
        ? assessment.subparts.reduce((sum: number, sp: any) => sum + (Number(sp.score) || 0), 0)
        : currentTotalScore);

  const mutateSubpart = (sp: any, patch: SubpartPatchItem) => {
    const maxScore = typeof patch.max_score === 'number' && patch.max_score > 0
      ? patch.max_score
      : Number(sp.max_score ?? 1);
    const clampedNew = Math.max(0, Math.min(Math.round(Number(patch.new_score) * 2) / 2, maxScore));

    sp.max_score = maxScore;
    sp.score = clampedNew;

    if (Array.isArray(patch.marks_awarded)) {
      sp.marks_awarded = patch.marks_awarded;
    }
    if (Array.isArray(patch.deductions)) {
      sp.deductions = clampedNew >= maxScore ? [] : patch.deductions;
    } else if (clampedNew >= maxScore) {
      sp.deductions = [];
    }

    if (clampedNew >= maxScore) {
      sp.teacher_correction_note = '';
      sp.mistake_details = '';
      if (patch.constructive_correction !== undefined) {
        sp.constructive_correction = patch.constructive_correction;
      } else {
        sp.constructive_correction = '';
      }
    } else {
      if (patch.teacher_correction_note !== undefined) {
        sp.teacher_correction_note = patch.teacher_correction_note;
      }
      if (patch.constructive_correction !== undefined) {
        sp.constructive_correction = patch.constructive_correction;
      }
    }

    // Keep marking_points earned flags aligned with new score when present
    if (Array.isArray(sp.marking_points) && sp.marking_points.length > 0) {
      let earnedAssigned = 0;
      sp.marking_points.forEach((mp: any) => {
        if (earnedAssigned < clampedNew) {
          mp.is_earned = true;
          earnedAssigned++;
        } else {
          mp.is_earned = false;
        }
      });
    }
  };

  for (const patch of updates) {
    const targetQ = normalizeQuestionNum(patch.question_number);
    const targetPartNorm = normalizeSubpartKey(patch.part_label, targetQ);

    let matchedSubpartRef: any = null;
    let matchedPageIdx = 0;
    let oldScoreVal = 0;
    let canonicalPartLabel = patch.part_label;

    // 1. Update in question_summaries
    if (qSummaries.length > 0) {
      const qObj =
        qSummaries.find((q) => normalizeQuestionNum(q.question_number) === targetQ) ||
        (qSummaries.length === 1 ? qSummaries[0] : null);

      if (qObj && Array.isArray(qObj.subparts)) {
        const spMatch =
          qObj.subparts.find(
            (sp: any) => normalizeSubpartKey(sp.part_label, targetQ) === targetPartNorm
          ) ||
          (qObj.subparts.length === 1 && (!targetPartNorm || targetPartNorm === 'all')
            ? qObj.subparts[0]
            : null);

        if (spMatch) {
          oldScoreVal = Number(spMatch.score ?? 0);
          canonicalPartLabel = spMatch.part_label || patch.part_label;
          matchedPageIdx =
            typeof spMatch.page_index === 'number'
              ? spMatch.page_index
              : Array.isArray(qObj.spanned_pages) && qObj.spanned_pages.length > 0
              ? Number(qObj.spanned_pages[0]) || 0
              : 0;

          mutateSubpart(spMatch, patch);
          matchedSubpartRef = spMatch;

          // Recompute question summary score & percentage
          const newQScore = qObj.subparts.reduce(
            (s: number, item: any) => s + (Number(item.score) || 0),
            0
          );
          const qMax = Number(qObj.max_score) || qObj.subparts.reduce(
            (s: number, item: any) => s + (Number(item.max_score) || 0),
            0
          );
          qObj.score = newQScore;
          if (qObj.total_score !== undefined) qObj.total_score = newQScore;
          qObj.unattempted = false;
          qObj.percentage = qMax > 0 ? Math.round((newQScore / qMax) * 100) : 0;
        }
      }
    }

    // 2. Update in root assessment.subparts
    if (Array.isArray(assessment.subparts)) {
      const rootSp = assessment.subparts.find((sp: any) => {
        const spQ = sp.question_number
          ? normalizeQuestionNum(sp.question_number)
          : normalizeQuestionNum(assessment.identified_question_number || targetQ);
        const qMatches = qSummaries.length <= 1 || spQ === targetQ;
        return qMatches && normalizeSubpartKey(sp.part_label, targetQ) === targetPartNorm;
      });
      if (rootSp) {
        if (!matchedSubpartRef) {
          oldScoreVal = Number(rootSp.score ?? 0);
          canonicalPartLabel = rootSp.part_label || patch.part_label;
          matchedPageIdx = typeof rootSp.page_index === 'number' ? rootSp.page_index : 0;
        }
        mutateSubpart(rootSp, patch);
        if (!matchedSubpartRef) matchedSubpartRef = rootSp;
      }
    }

    // 3. Update in assessment.pages[p].subparts and sync red-ink annotations
    if (Array.isArray(assessment.pages)) {
      assessment.pages.forEach((pObj: any, pIdx: number) => {
        if (!Array.isArray(pObj?.subparts)) return;
        const pageSp = pObj.subparts.find((sp: any) => {
          const spQ = sp.question_number ? normalizeQuestionNum(sp.question_number) : targetQ;
          const qMatches =
            qSummaries.length <= 1 ||
            spQ === targetQ ||
            (Array.isArray(pObj.questions_present) &&
              pObj.questions_present.map(normalizeQuestionNum).includes(targetQ));
          return qMatches && normalizeSubpartKey(sp.part_label, targetQ) === targetPartNorm;
        });

        if (pageSp) {
          if (!matchedSubpartRef) {
            oldScoreVal = Number(pageSp.score ?? 0);
            canonicalPartLabel = pageSp.part_label || patch.part_label;
          }
          matchedPageIdx = pIdx;
          mutateSubpart(pageSp, patch);
          if (!matchedSubpartRef) matchedSubpartRef = pageSp;

          pObj.page_score = pObj.subparts.reduce(
            (s: number, item: any) => s + (Number(item.score) || 0),
            0
          );
          // Invalidate stale pre-rendered AI photo for this page so the live vector overlay renders the correction immediately
          pObj.marked_image_url = null;
          pObj.annotations = syncSubpartAnnotationsOnList(
            pObj.annotations || [],
            pageSp,
            targetQ,
            pIdx
          );
        }
      });
    }

    if (matchedSubpartRef) {
      // Also sync root assessment.annotations if present
      if (Array.isArray(assessment.annotations) && assessment.annotations.length > 0) {
        assessment.annotations = syncSubpartAnnotationsOnList(
          assessment.annotations,
          matchedSubpartRef,
          targetQ,
          matchedPageIdx
        );
      }

      affectedPagesSet.add(matchedPageIdx);
      appliedDiffs.push({
        questionNumber: targetQ,
        partLabel: canonicalPartLabel,
        oldScore: oldScoreVal,
        newScore: Number(matchedSubpartRef.score ?? 0),
        maxScore: Number(matchedSubpartRef.max_score ?? 1),
        pageIndex: matchedPageIdx,
        summary: patch.reason_summary,
      });
    }
  }

  // Recompute grand total score & percentage
  const newQuestionsSum = qSummaries.length > 0
    ? qSummaries.reduce((sum, q) => sum + (Number(q.score) || 0), 0)
    : (Array.isArray(assessment.subparts)
        ? assessment.subparts.reduce((sum: number, sp: any) => sum + (Number(sp.score) || 0), 0)
        : currentTotalScore);

  const qSummariesMaxSum = qSummaries.reduce((sum, q) => sum + (Number(q.max_score) || 0), 0);

  const effectiveMaxScore =
    Number(currentMaxScore) ||
    Number(assessment.total_max_score) ||
    Number(assessment.max_score) ||
    10;

  // Answer-all papers (where question max scores sum to effectiveMaxScore) always equal newQuestionsSum;
  // elective-capped papers preserve the answer-rules offset.
  const rawNewTotal =
    (qSummaries.length > 0 && qSummariesMaxSum === effectiveMaxScore) ||
    oldQuestionsSum === currentTotalScore
      ? newQuestionsSum
      : currentTotalScore + (newQuestionsSum - oldQuestionsSum);

  const newTotalScore = Math.max(0, Math.min(effectiveMaxScore, Math.round(rawNewTotal * 2) / 2));
  const newPercentage =
    effectiveMaxScore > 0 ? Math.round((newTotalScore / effectiveMaxScore) * 100) : 0;

  assessment.total_score = newTotalScore;
  assessment.score = newTotalScore;
  assessment.total_max_score = effectiveMaxScore;
  assessment.max_score = effectiveMaxScore;
  assessment.percentage = newPercentage;

  // Invalidate stale baked AI Photo (`marked_image_url`) on every affected page so the viewer
  // immediately displays the updated live red-ink overlay and re-renders a fresh AI Photo!
  if (Array.isArray(assessment.pages)) {
    affectedPagesSet.forEach((pIdx) => {
      if (assessment.pages[pIdx]) {
        assessment.pages[pIdx].marked_image_url = null;
      }
    });
  }
  if (affectedPagesSet.has(0) && assessment.marked_image_url) {
    assessment.marked_image_url = null;
  }

  // Sync Booklet Total & stored Q stamps across page annotations and root annotations
  const updateTotalStamps = (anns: any[]) => {
    if (!Array.isArray(anns)) return;
    anns.forEach((ann) => {
      if (typeof ann?.text !== 'string') return;
      if (ann.text.startsWith('Booklet Total')) {
        ann.text = `Booklet Total: ${newTotalScore}/${effectiveMaxScore}`;
        ann.comment = `Overall Booklet Total: ${newTotalScore}/${effectiveMaxScore} marks (${newPercentage}%)`;
      } else {
        const qMatch = ann.text.match(/^Q(?:uestion)?\s*(\d+)(?:\s*Total)?\s*:/i);
        if (qMatch && qSummaries.length > 0) {
          const qObj = qSummaries.find(
            (q) => normalizeQuestionNum(q.question_number) === normalizeQuestionNum(qMatch[1])
          );
          if (qObj) {
            const hadTotalWord = /Total/i.test(ann.text);
            ann.text = hadTotalWord
              ? `Q${qObj.question_number} Total: ${qObj.score}/${qObj.max_score}`
              : `Q${qObj.question_number}: ${qObj.score}/${qObj.max_score}`;
            ann.comment = `Question ${qObj.question_number} Total: ${qObj.score}/${qObj.max_score} marks`;
          }
        }
      }
    });
  };

  if (Array.isArray(assessment.pages)) {
    assessment.pages.forEach((p: any) => updateTotalStamps(p?.annotations));
  }
  updateTotalStamps(assessment.annotations);

  return {
    updatedAssessment: assessment,
    newTotalScore,
    newMaxScore: effectiveMaxScore,
    newPercentage,
    appliedDiffs,
    affectedPages: Array.from(affectedPagesSet),
  };
}

const inlineImageCache = new Map<string, string>();

/**
 * Converts a remote image URL (or oversized data URI) into a compact inline
 * `data:image/jpeg;base64,...` URI.
 *
 * Why this is mandatory:
 * The `tutor-chat` Edge Function's Caimex/Gemini vision gateway rejects remote
 * `https://` image URLs with `502 media_fetch_failed` (causing a 400 non-2xx Edge Function error),
 * whereas inline `data:image/...;base64,...` URIs succeed directly.
 */
async function toInlineVisionDataUri(
  rawUrl?: string,
  maxDim = 1280,
  quality = 0.78
): Promise<string | undefined> {
  if (!rawUrl || typeof rawUrl !== 'string') return undefined;
  const cached = inlineImageCache.get(rawUrl);
  if (cached) return cached;

  // Helper to downscale an HTMLImageElement onto a JPEG canvas
  const encodeImgElement = (img: HTMLImageElement): string | undefined => {
    try {
      const w0 = img.naturalWidth || img.width;
      const h0 = img.naturalHeight || img.height;
      if (!w0 || !h0) return undefined;
      const scale = Math.min(1, maxDim / Math.max(w0, h0));
      const w = Math.max(1, Math.round(w0 * scale));
      const h = Math.max(1, Math.round(h0 * scale));
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) return undefined;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, w, h);
      ctx.drawImage(img, 0, 0, w, h);
      return canvas.toDataURL('image/jpeg', quality);
    } catch {
      return undefined;
    }
  };

  if (rawUrl.startsWith('data:image/')) {
    if (rawUrl.length <= 450_000 || typeof document === 'undefined') {
      inlineImageCache.set(rawUrl, rawUrl);
      return rawUrl;
    }
    try {
      const compressed = await new Promise<string | undefined>((resolve) => {
        const img = new Image();
        img.onload = () => resolve(encodeImgElement(img) || rawUrl);
        img.onerror = () => resolve(rawUrl);
        img.src = rawUrl;
      });
      if (compressed) inlineImageCache.set(rawUrl, compressed);
      return compressed;
    } catch {
      return rawUrl;
    }
  }

  if (!rawUrl.startsWith('http://') && !rawUrl.startsWith('https://')) {
    return undefined;
  }

  // 1. Browser Image + Canvas path (handles CORS public Supabase Storage URLs cleanly & compresses)
  if (typeof Image !== 'undefined' && typeof document !== 'undefined') {
    try {
      const dataUri = await new Promise<string | undefined>((resolve) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => resolve(encodeImgElement(img));
        img.onerror = () => resolve(undefined);
        img.src = rawUrl;
      });
      if (dataUri && dataUri.startsWith('data:image/')) {
        inlineImageCache.set(rawUrl, dataUri);
        return dataUri;
      }
    } catch {
      // fall through to fetch + FileReader fallback
    }
  }

  // 2. Fallback: fetch blob -> FileReader base64
  try {
    const resp = await fetch(rawUrl);
    if (!resp.ok) return undefined;
    const blob = await resp.blob();
    const dataUri = await new Promise<string | undefined>((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () =>
        resolve(typeof reader.result === 'string' ? reader.result : undefined);
      reader.onerror = () => resolve(undefined);
      reader.readAsDataURL(blob);
    });
    if (dataUri && dataUri.startsWith('data:image/')) {
      inlineImageCache.set(rawUrl, dataUri);
      return dataUri;
    }
  } catch (err) {
    console.warn('toInlineVisionDataUri: could not inline remote image, continuing without image:', err);
  }

  // Never pass a raw http(s) URL to tutor-chat's chat endpoint (causes 502 media_fetch_failed)
  return undefined;
}

async function extractFunctionsErrorMessage(err: any): Promise<string> {
  if (!err) return 'Failed to reach AI Co-Examiner';
  try {
    const ctx = err?.context;
    if (ctx && typeof ctx.json === 'function') {
      const body = await ctx.clone().json();
      if (body?.error) return String(body.error);
      if (body?.message) return String(body.message);
    } else if (ctx && typeof ctx.text === 'function') {
      const txt = await ctx.clone().text();
      if (txt) return txt.slice(0, 240);
    }
  } catch {
    // ignore body parse failure
  }
  return err.message || 'Failed to reach AI Co-Examiner';
}

/**
 * Calls the AI Co-Examiner (via Supabase `tutor-chat` with Vision + Official Mark Scheme)
 * to inspect the student's script, follow the teacher's custom grading instruction,
 * and return both a clear explanation and a structured `<MARKING_PATCH>` payload.
 */
export async function invokeAiMarkingRevision(params: {
  teacherPrompt: string;
  selectedTarget: SubpartTargetOption | null;
  allTargets: SubpartTargetOption[];
  assessmentResult: any;
  paperMeta: any;
  officialQuestionsContext: string;
  currentPageImageUrl?: string;
  allPageImageUrls?: string[];
  chatHistory?: { role: 'user' | 'assistant'; content: string }[];
}): Promise<{
  replyText: string;
  updates: SubpartPatchItem[];
}> {
  const {
    teacherPrompt,
    selectedTarget,
    allTargets,
    paperMeta,
    officialQuestionsContext,
    currentPageImageUrl,
    allPageImageUrls = [],
    chatHistory = [],
  } = params;

  // Choose primary image (target subpart's page if selected, otherwise active viewer page)
  let primaryImageUrl = currentPageImageUrl || '';
  const extraPageImageUrls: string[] = [];

  if (selectedTarget && allPageImageUrls[selectedTarget.pageIndex]) {
    primaryImageUrl = allPageImageUrls[selectedTarget.pageIndex];
  } else {
    // Try to detect mentioned question number in teacher's prompt (e.g. "2(a)", "question 3", "Q4")
    const qMention = teacherPrompt.match(/(?:question|q|\b)(\d{1,2})\s*(?:\([a-z0-9]+\)|[a-z]\b)?/i);
    if (qMention) {
      const mentionedQ = normalizeQuestionNum(qMention[1]);
      const matchingTargets = allTargets.filter((t) => t.questionNumber === mentionedQ);
      const uniquePages = Array.from(new Set(matchingTargets.map((t) => t.pageIndex)));
      if (uniquePages.length > 0 && allPageImageUrls[uniquePages[0]]) {
        primaryImageUrl = allPageImageUrls[uniquePages[0]];
        uniquePages.slice(1, 2).forEach((pIdx) => {
          if (allPageImageUrls[pIdx]) extraPageImageUrls.push(allPageImageUrls[pIdx]);
        });
      }
    }
  }

  // Convert remote URLs to inline compressed base64 data URIs so the vision gateway never 502s
  const [primaryInlineImage, ...extraInlineImagesRaw] = await Promise.all([
    toInlineVisionDataUri(primaryImageUrl),
    ...extraPageImageUrls.map((u) => toInlineVisionDataUri(u)),
  ]);
  const extraInlineImages = extraInlineImagesRaw.filter((u): u is string => Boolean(u));

  const currentMarkingBreakdown = allTargets
    .map(
      (t) =>
        `- Question ${t.questionNumber}, Part ${t.partLabel} [Page ${t.pageIndex + 1}]: Currently ${t.score}/${t.maxScore} marks` +
        (t.studentAnswer ? ` | Detected student work: "${t.studentAnswer}"` : '') +
        (t.marksAwarded?.length ? ` | Earned: ${JSON.stringify(t.marksAwarded)}` : '') +
        (t.deductions?.length ? ` | Deductions: ${JSON.stringify(t.deductions)}` : '') +
        (t.teacherNote ? ` | Red-ink note: "${t.teacherNote}"` : '')
    )
    .join('\n');

  const focusDirective = selectedTarget
    ? `TARGET LOCKED BY TEACHER: Question ${selectedTarget.questionNumber}, Part ${selectedTarget.partLabel} (currently ${selectedTarget.score}/${selectedTarget.maxScore} marks on Page ${selectedTarget.pageIndex + 1}). Focus your revision on this part unless the teacher explicitly asks to adjust additional parts.`
    : `AUTO-DETECT TARGET: Identify the exact question_number and part_label(s) the teacher is referring to in their instruction below.`;

  const structuredPrompt = `CO-EXAMINER MARKING REVISION MODE (TEACHER OVERRIDE REQUEST)
You are assisting the classroom Teacher / Senior Examiner in reviewing and tweaking the AI marking of a student's script for "${paperMeta?.subject || 'Exam'} Paper ${paperMeta?.paper_number || ''}" (${paperMeta?.curriculum || 'Cambridge / ZIMSEC'}, ${paperMeta?.year || ''}).

${focusDirective}

CURRENT AI MARKING STATE OF THIS STUDENT'S SCRIPT:
${currentMarkingBreakdown}

TEACHER'S INSTRUCTION / CUSTOM MARKING PROMPT:
"${teacherPrompt}"

YOUR TASK:
1. Carefully inspect the student script (image if attached + detected working above), the official mark scheme, the current AI marking state above, and the TEACHER'S INSTRUCTION.
2. The teacher has final grading authority. Follow their marking instruction faithfully while grounding the feedback in what the student actually wrote.
3. Keep \`new_score\` between \`0\` and that subpart's \`max_score\`.
4. First, write a concise, clear 2–4 sentence response to the teacher explaining what you updated (or answering their question if they only asked a question without requesting a score/feedback change).
5. At the VERY END of your response, ALWAYS append a single \`<MARKING_PATCH>\` JSON block in this exact format (use \`"updates": []\` ONLY if the teacher is asking a pure question and does not want any score or feedback changed):

<MARKING_PATCH>
{
  "updates": [
    {
      "question_number": "2",
      "part_label": "(a)",
      "new_score": 2,
      "max_score": 3,
      "marks_awarded": [
        "M1: Valid exterior/base angle method applied",
        "M1: Correct angle on a straight line setup (180° - 69°)"
      ],
      "deductions": [
        "Lost A1: Final arithmetic slip"
      ],
      "teacher_correction_note": "Good method — check final subtraction for A1",
      "constructive_correction": "180° - 69° = 111°",
      "reason_summary": "Awarded 2/3 method marks per teacher instruction"
    }
  ]
}
</MARKING_PATCH>

CRITICAL RULES FOR <MARKING_PATCH>:
- Match \`question_number\` and \`part_label\` to the exact labels listed in CURRENT AI MARKING STATE above (e.g. if listed as \`Question 2, Part (a)\`, output \`"question_number": "2", "part_label": "(a)"\`).
- If \`new_score\` equals \`max_score\`, set \`"deductions": []\` and \`"teacher_correction_note": ""\`.
- Output valid JSON inside \`<MARKING_PATCH>...</MARKING_PATCH>\` with double-quoted keys and no trailing commas.`;

  const baseContext = {
    paperTitle: `${paperMeta?.subject || ''} Paper ${paperMeta?.paper_number || ''} (${paperMeta?.year || ''})`,
    subject: paperMeta?.subject || 'Mathematics / Science',
    curriculum: paperMeta?.curriculum || 'Cambridge / ZIMSEC',
    questionNumber: selectedTarget?.questionNumber || '1',
    markScheme: officialQuestionsContext.slice(0, 14000),
    assessmentSummary: currentMarkingBreakdown,
  };

  // Attempt 1: With inline base64 page vision
  let { data, error } = await supabase.functions.invoke('tutor-chat', {
    body: {
      message: structuredPrompt,
      image_url: primaryInlineImage || undefined,
      chatHistory: chatHistory.slice(-6),
      context: {
        ...baseContext,
        questionAssets: extraInlineImages.length > 0 ? extraInlineImages : undefined,
      },
    },
  });

  // Resilient fallback: if vision payload failed for any gateway/size reason, retry text+transcription
  if (error && (primaryInlineImage || extraInlineImages.length > 0)) {
    console.warn('Vision tutor-chat call failed, retrying with structured transcription fallback...', error);
    const retryResp = await supabase.functions.invoke('tutor-chat', {
      body: {
        message: structuredPrompt,
        chatHistory: chatHistory.slice(-6),
        context: baseContext,
      },
    });
    data = retryResp.data;
    error = retryResp.error;
  }

  if (error) {
    const detailedMsg = await extractFunctionsErrorMessage(error);
    throw new Error(detailedMsg);
  }

  const rawReply: string = data?.reply || '';
  if (!rawReply) {
    throw new Error(data?.error || 'AI Co-Examiner returned an empty response');
  }

  // Extract <MARKING_PATCH>...</MARKING_PATCH> or fenced JSON fallback
  let rawUpdates: any[] = [];
  let cleanReply = rawReply;

  const patchMatch = rawReply.match(/<MARKING_PATCH>\s*([\s\S]*?)\s*<\/MARKING_PATCH>/i);
  if (patchMatch) {
    cleanReply = rawReply.replace(patchMatch[0], '').trim();
    const jsonCandidate = patchMatch[1]
      .replace(/^```(?:json)?/i, '')
      .replace(/```$/i, '')
      .trim();
    try {
      const parsed = JSON.parse(jsonCandidate);
      if (Array.isArray(parsed?.updates)) {
        rawUpdates = parsed.updates;
      } else if (Array.isArray(parsed)) {
        rawUpdates = parsed;
      }
    } catch (parseErr) {
      console.warn('Failed to parse <MARKING_PATCH> JSON:', parseErr, jsonCandidate);
    }
  } else {
    // Fallback: check if model wrapped JSON in ```json { "updates": [...] } ``` at the end
    const codeFenceMatch = rawReply.match(/```json\s*(\{[\s\S]*?"updates"[\s\S]*?\})\s*```/i);
    if (codeFenceMatch) {
      try {
        const parsed = JSON.parse(codeFenceMatch[1]);
        if (Array.isArray(parsed?.updates)) {
          rawUpdates = parsed.updates;
          cleanReply = rawReply.replace(codeFenceMatch[0], '').trim();
        }
      } catch (_) {}
    }
  }

  // Normalize any schema key aliases from the LLM so updates always match cleanly
  const updates: SubpartPatchItem[] = rawUpdates
    .map((u: any): SubpartPatchItem | null => {
      if (!u || typeof u !== 'object') return null;
      const qNum = String(
        u.question_number ?? u.question ?? selectedTarget?.questionNumber ?? '1'
      ).trim();
      const pLabel = String(
        u.part_label ?? u.part ?? u.subpart ?? selectedTarget?.partLabel ?? '(a)'
      ).trim();
      const rawNewScore =
        u.new_score ??
        u.score ??
        (typeof u.marks_awarded === 'number' ? u.marks_awarded : undefined) ??
        u.marks;
      if (rawNewScore === undefined || rawNewScore === null || Number.isNaN(Number(rawNewScore))) {
        return null;
      }
      const rawMaxScore = u.max_score ?? u.max_marks ?? selectedTarget?.maxScore;
      return {
        question_number: qNum,
        part_label: pLabel,
        new_score: Number(rawNewScore),
        max_score: rawMaxScore !== undefined ? Number(rawMaxScore) : undefined,
        marks_awarded: Array.isArray(u.marks_awarded)
          ? u.marks_awarded.map(String)
          : Array.isArray(u.earned)
          ? u.earned.map(String)
          : undefined,
        deductions: Array.isArray(u.deductions) ? u.deductions.map(String) : undefined,
        teacher_correction_note:
          typeof u.teacher_correction_note === 'string'
            ? u.teacher_correction_note
            : typeof u.comment === 'string'
            ? u.comment
            : undefined,
        constructive_correction:
          typeof u.constructive_correction === 'string' ? u.constructive_correction : undefined,
        reason_summary:
          typeof u.reason_summary === 'string'
            ? u.reason_summary
            : typeof u.comment === 'string'
            ? u.comment
            : undefined,
      };
    })
    .filter((x): x is SubpartPatchItem => x !== null);

  return {
    replyText: cleanReply || 'Updated the marking according to your instructions.',
    updates,
  };
}

