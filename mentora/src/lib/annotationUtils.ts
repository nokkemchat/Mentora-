import {
  buildNormalizedLayoutFromAssessment,
  clampBBoxToPage,
  recalibrateAnnotationBox,
} from './normalizedMarkingEngine';
import type {
  NormalizedBBox,
  DetectedLayoutRegion,
  AnchoredAnnotation,
  ResolvedRenderAnnotation,
} from './normalizedMarkingEngine';
import type { VisualAnnotation, AssessmentResult, AssessmentSubpart } from './tutorAgent';
export type { VisualAnnotation, AssessmentResult, AssessmentSubpart };

export function cleanCorrectionNote(raw?: string): string {
  if (!raw) return '';
  let note = raw.replace(/^✍️\s*/, '').replace(/^✎\s*/, '').replace(/^\^\s*/, '').trim();
  note = note.replace(/correct completion after [A-Z0-9]+ with the fraction seen removed with no errors or omissions seen/gi, '');
  note = note.replace(/with no errors or omissions seen/gi, '');
  note = note.replace(/\b(?:oe|nfww|cao|soi|dep)\b/gi, '');
  note = note.replace(/^Missed\s*\[([A-Z0-9]+)\]:\s*/i, '[$1] ');
  note = note.replace(/\s*;\s*$/, '').trim();
  return note;
}

/**
 * Normalizes and guards bounding boxes so coordinates are always valid integers strictly
 * within page bounds (15-985), ensuring NO annotations ever spill outside the image borders.
 */
function normalizeAnnotationBox(box: [number, number, number, number] | undefined, subpartLabel?: string, comment?: string): [number, number, number, number] {
  if (!box || !Array.isArray(box) || box.length !== 4) return [50, 860, 85, 960];
  let [ymin, xmin, ymax, xmax] = box;

  // Strict guardrail clamping inside image canvas (15-985)
  ymin = Math.max(15, Math.min(Math.round(ymin), 940));
  xmin = Math.max(15, Math.min(Math.round(xmin), 940));
  ymax = Math.max(ymin + 18, Math.min(Math.round(ymax), 985));
  xmax = Math.max(xmin + 35, Math.min(Math.round(xmax), 985));

  return [ymin, xmin, ymax, xmax];
}

/**
 * Reconciles the total score and max score with the itemised sub-parts.
 * Enforces strict mathematical consistency so the header, badges, and ticks always sum up identically.
 */
/**
 * Reconciles the total score and max score with the itemised sub-parts.
 * Enforces strict mathematical consistency so the header, badges, and ticks always sum up identically.
 * Preserves the official question max marks so omitted sub-parts do not artificially reduce the total marks.
 */
/**
 * Detects whether a subpart label is a hallucinated math fragment (like "(5)", "5", "5x", "2x")
 * rather than a valid British / Cambridge / ZIMSEC exam subpart identifier.
 */
export function isLikelyHallucinatedSubpart(label?: string): boolean {
  if (!label) return false;
  const clean = String(label).trim().replace(/[()[\]\s]/g, '').toLowerCase();
  // Valid exam subparts:
  // - single letters: a, b, c, d, e, f, g, h
  // - letter + roman: a(i), a(ii), a(iii), b(i), b(ii), c(ii)...
  // - roman alone: i, ii, iii, iv, v, vi, vii, viii, ix, x
  // - letter + digit: a1, a2, b1, b2
  // INVALID: bare single/double digit alone (e.g. "5", "1", "2") when question has letters (a, b, c),
  // or strings that look like math fragments "5x", "5x2", "2x"
  if (/^\d{1,2}$/.test(clean)) return true;
  if (/^\d+[a-z]?[\-+*/=]/i.test(clean)) return true;
  return false;
}

export function sanitizeAndMergeSubparts(subparts: any[], annotations?: any[]): any[] {
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

const MISSING_OR_FOREIGN_TEXT_PATTERNS = [
  'corresponds to question',
  'answers for question',
  'pertains to question',
  'instead of question',
  'no work for question',
  'entirely different question',
  'different question',
  'missing from the provided',
  'missing from the submitted',
  'missing from this image',
  'missing from this page',
  'not present on',
  'not visible in',
  'not found in the image',
  'not found on this page',
  'subquestion not found',
  'subpart not found',
  'not attempted or is missing',
  'no candidate response',
  'no response visible',
  'cannot be seen',
  'wrong page'
];

export function canonicalSubpartKey(label?: string, questionNumber?: string | number): string {
  if (!label) return '';
  let s = String(label).toLowerCase().trim();
  s = s.replace(/^(?:question\s*\d*|q\s*(?=\d)|part\s+)\s*/i, '');
  if (questionNumber !== undefined && questionNumber !== null) {
    const qClean = String(questionNumber).toLowerCase().replace(/^q(?:uestion)?\s*/i, '').trim();
    if (qClean && s.startsWith(qClean)) {
      const rest = s.slice(qClean.length).trim();
      if (rest.startsWith('(') || rest.startsWith('.') || /^[a-z]/i.test(rest)) {
        s = rest.replace(/^[.\s-]+/, '');
      }
    }
  }
  s = s.replace(/^\d{1,2}\s*(?=[({.]*[a-z]|[a-z]$)/, '');
  return s.replace(/[^a-z0-9]/g, '');
}

export function isScoreFractionText(raw?: string): boolean {
  const s = String(raw || '').trim();
  return /^[✓✗(\[\s]*\d+(?:\.\d+)?\s*\/\s*\d+(?:\.\d+)?[)\]\s]*$/.test(s);
}

export function deduplicateSubparts(subparts: any[]): any[] {
  if (!Array.isArray(subparts) || subparts.length <= 1) return subparts || [];
  const map = new Map<string, any>();
  subparts.forEach((sp, idx) => {
    const qKey = sp.question_number !== undefined && sp.question_number !== null
      ? String(sp.question_number).trim().replace(/^q(?:uestion)?\s*/i, '')
      : '';
    const pKey = canonicalSubpartKey(sp.canonical_label || sp.part_label, qKey);
    const key = pKey ? `${qKey}::${pKey}` : `__idx_${idx}`;
    const existing = map.get(key);
    if (!existing) {
      map.set(key, sp);
    } else {
      const existingValid = !existing.unattempted && (typeof existing.page_index !== 'number' || existing.page_index >= 0);
      const curValid = !sp.unattempted && (typeof sp.page_index !== 'number' || sp.page_index >= 0);
      if ((curValid && !existingValid) || (curValid === existingValid && (Number(sp.score) || 0) > (Number(existing.score) || 0))) {
        map.set(key, sp);
      }
    }
  });
  return Array.from(map.values());
}

export function isMissingOrForeignAnnotationText(raw?: string): boolean {
  const text = (raw || '').toLowerCase();
  if (!text) return false;
  return MISSING_OR_FOREIGN_TEXT_PATTERNS.some((p) => text.includes(p));
}

export function reconcileAssessment(assessment: AssessmentResult, officialMaxScore?: number): AssessmentResult {
  if (!assessment) return assessment;

  // Deduplicate question_summaries (e.g., when unattempted questions appeared twice)
  if (Array.isArray((assessment as any).question_summaries)) {
    const dedupQMap = new Map<string, any>();
    (assessment as any).question_summaries.forEach((qs: any) => {
      const qKey = String(qs.question_number ?? qs.identified_question_number ?? '').trim();
      if (!qKey) return;
      const existing = dedupQMap.get(qKey);
      if (!existing) {
        dedupQMap.set(qKey, qs);
      } else {
        const existingValid = !existing.unattempted || (Number(existing.score) || 0) > 0 || (existing.spanned_pages?.length || 0) > 0;
        const curValid = !qs.unattempted || (Number(qs.score) || 0) > 0 || (qs.spanned_pages?.length || 0) > 0;
        if (curValid && !existingValid) {
          dedupQMap.set(qKey, qs);
        }
      }
    });
    (assessment as any).question_summaries = Array.from(dedupQMap.values());
  }

  // Sanitize & deduplicate subparts on root and on every page to prevent double marks
  if (Array.isArray(assessment.subparts)) {
    assessment.subparts = deduplicateSubparts(sanitizeAndMergeSubparts(assessment.subparts, assessment.annotations));
  }
  if (Array.isArray(assessment.pages)) {
    assessment.pages.forEach((p: any) => {
      if (Array.isArray(p.subparts)) {
        p.subparts = deduplicateSubparts(sanitizeAndMergeSubparts(p.subparts, p.annotations));
      }
    });
  }

  const subparts = assessment.subparts || [];
  if (Array.isArray(subparts)) {
    subparts.sort((a, b) => {
      const getWeight = (label?: string): number => {
        if (!label) return 9999;
        const clean = String(label).toLowerCase().replace(/^(?:question|q)?\s*\d+[\s.:-]*\s*/i, '').trim();
        const letterMatch = clean.match(/(?:\((?:part\s*)?([a-h])\)|\b([a-h])(?=[\s.)(]|$))/i);
        const letter = letterMatch ? (letterMatch[1] || letterMatch[2]).toLowerCase() : null;
        const romanMatch = clean.match(/(?:\((viii|vii|vi|iv|v|ix|x|iii|ii|i)\)|\b(viii|vii|vi|iv|v|ix|x|iii|ii|i)\b)/i);
        const roman = romanMatch ? (romanMatch[1] || romanMatch[2]).toLowerCase() : null;
        let w = letter ? (letter.charCodeAt(0) - 96) * 100 : 5000;
        const romanMap: Record<string, number> = { 'i': 1, 'ii': 2, 'iii': 3, 'iv': 4, 'v': 5, 'vi': 6, 'vii': 7, 'viii': 8, 'ix': 9, 'x': 10 };
        if (roman && romanMap[roman]) w += romanMap[roman];
        return w;
      };
      return getWeight(a.part_label) - getWeight(b.part_label);
    });
  }
  subparts.forEach((sp: any) => {
    const max = Number(sp.max_score) || 1;
    sp.score = Math.max(0, Math.min(Number(sp.score) || 0, max));
  });
  const computedScore = subparts.reduce((sum: number, sp: any) => sum + (Number(sp.score) || 0), 0);
  const computedSubpartsMax = subparts.reduce((sum: number, sp: any) => sum + (Number(sp.max_score) || 0), 0);

  // Preserve official question max score from paper repository if provided, or current total_max_score
  const effectiveMaxScore = officialMaxMarks(assessment, officialMaxScore, computedSubpartsMax);

  assessment.score = computedScore;
  assessment.total_score = computedScore;
  assessment.max_score = effectiveMaxScore;
  assessment.total_max_score = effectiveMaxScore;
  assessment.percentage = effectiveMaxScore > 0 ? Math.round((computedScore / effectiveMaxScore) * 100) : 0;

  return assessment;
}

function officialMaxMarks(assessment: AssessmentResult, officialMaxScore?: number, computedSubpartsMax?: number): number {
  if (typeof officialMaxScore === 'number' && officialMaxScore > 0) return officialMaxScore;
  if (typeof assessment.total_max_score === 'number' && assessment.total_max_score > 0) {
    return Math.max(assessment.total_max_score, computedSubpartsMax || 0);
  }
  if (typeof assessment.max_score === 'number' && assessment.max_score > 0) {
    return Math.max(assessment.max_score, computedSubpartsMax || 0);
  }
  return computedSubpartsMax && computedSubpartsMax > 0 ? computedSubpartsMax : 10;
}

/**
 * Computes realistic vertical Y-coordinates on student lined/exam paper for N subparts.
 * Guarantees that the very first question (Part a) is NEVER skipped and starts at Y ~ 175.
 */
function computeSubpartYPositions(totalSubparts: number): number[] {
  if (totalSubparts <= 0) return [];
  if (totalSubparts === 1) return [220];
  if (totalSubparts === 2) return [200, 440];
  if (totalSubparts === 3) return [190, 390, 590];
  if (totalSubparts === 4) return [180, 340, 500, 670];
  if (totalSubparts === 5) return [170, 300, 430, 560, 690];

  // For 6 or more subparts, distribute within the active written area (Y: 170 to 760)
  const startY = 170;
  const availableSpan = Math.min(590, (totalSubparts - 1) * 85);
  const step = availableSpan / (totalSubparts - 1);
  return Array.from({ length: totalSubparts }, (_, i) => Math.round(startY + i * step));
}

/**
 * Ensures that an assessment result has authentic teacher red-ink visual markings
 * matching real school teacher grading:
 * - Red tick with score in parentheses: ✓ (score/max) at the right end of the answer line.
 * - Red cross with score: X (0/max) when 0 marks.
 * - Handwritten teacher explanation note under mistakes.
 * - Bottom right: Total: score/max in natural red pen.
 * NO boxes, NO badges, NO giant circles!
 */
export function ensureAssessmentAnnotations(assessment: AssessmentResult, pageIndex?: number): VisualAnnotation[] {
  if (!assessment) return [];

  reconcileAssessment(assessment);

  const targetPageIndex = typeof pageIndex === 'number' ? pageIndex : 0;
  const pageData = assessment.pages?.[targetPageIndex];
  const isMultiPageDoc = (Array.isArray(assessment.pages) && assessment.pages.length > 1) || (Array.isArray((assessment as any).page_urls) && (assessment as any).page_urls.length > 1);

  // Helper map for subpart feedback (deductions, correction notes, constructive guidance)
  const rawSubparts: AssessmentSubpart[] = (pageData?.subparts && pageData.subparts.length > 0)
    ? pageData.subparts
    : (isMultiPageDoc && Array.isArray(assessment.subparts)
        ? assessment.subparts.filter((sp: any) => sp.page_index === targetPageIndex)
        : assessment.subparts || []);

  const subpartsList: AssessmentSubpart[] = isMultiPageDoc
    ? rawSubparts.filter((sp: any) => sp.page_index === undefined || sp.page_index === targetPageIndex)
    : rawSubparts;

  const subpartFeedbackMap = new Map<string, { note: string; deduction: string }>();
  subpartsList.forEach((sp: any) => {
    if (sp.part_label) {
      const note = sp.teacher_correction_note || sp.constructive_correction || sp.teacher_correction || '';
      const deduction = (sp.deductions && sp.deductions[0]) || sp.feedback || '';
      subpartFeedbackMap.set(sp.part_label, { note, deduction });
    }
  });

  const getSubpartFeedback = (label: string) => {
    if (!label) return null;
    const clean = label.toLowerCase().replace(/[^a-z0-9]/g, '');
    for (const [key, val] of subpartFeedbackMap.entries()) {
      const keyClean = key.toLowerCase().replace(/[^a-z0-9]/g, '');
      if (keyClean === clean || keyClean.endsWith(clean) || clean.endsWith(keyClean)) {
        return val;
      }
    }
    return null;
  };

  const rawPageAnnotationsList = pageData?.annotations || [];
  const pageAnnotationsList = isMultiPageDoc
    ? rawPageAnnotationsList.filter((a: any) => a.page_index === undefined || a.page_index === targetPageIndex)
    : rawPageAnnotationsList;
  const hasPageAnnotations = Array.isArray(pageAnnotationsList) && pageAnnotationsList.length > 0;
  const pageMarks = hasPageAnnotations
    ? pageAnnotationsList.filter((a: any) =>
        a.type === 'tick' || a.type === 'inline_tick' || a.type === 'cross' || a.type === 'mark_badge'
      )
    : [];

  const layoutRegions = (pageData as any)?.layout_regions || (assessment as any)?.layout_regions || [];

  // Keep true visual coordinates without artificial vertical scaling distortion
  const subpartAnns = (pageAnnotationsList || []).filter((a: any) => a.type !== 'total_header');

  let finalResult: any[] = [];

  if (pageMarks.length > 0) {
    const rawMapped = pageAnnotationsList.map((ann: any) => {
      const spInfo = getSubpartFeedback(ann.subpart_label);
      let teacherCorrection = ann.teacher_correction || '';
      if (!teacherCorrection && spInfo) {
        teacherCorrection = spInfo.note;
      }
      let comment = ann.comment || '';
      if (!comment && spInfo && (ann.type === 'cross' || ann.text === '✗')) {
        comment = spInfo.deduction || spInfo.note;
      }

      const { box_2d: clampedBox, bbox } = recalibrateAnnotationBox(
        { ...ann, teacher_correction: teacherCorrection, comment },
        subpartFeedbackMap
      );

      return {
        ...ann,
        box_2d: clampedBox,
        bbox,
        comment,
        teacher_correction: teacherCorrection,
        page_index: targetPageIndex,
      };
    });
    finalResult = finalizeAnnotationsList(rawMapped, subpartsList, targetPageIndex, layoutRegions);
  } else {
    // Check if explicit annotations exist at root level for this page
    const isMultiPageDoc = Array.isArray(assessment.pages) && assessment.pages.length > 1;
    const rootPageAnnotations = Array.isArray(assessment.annotations)
      ? assessment.annotations.filter((a: any) =>
          isMultiPageDoc ? a.page_index === targetPageIndex : (a.page_index === undefined || a.page_index === targetPageIndex)
        )
      : [];
    const rootMarks = rootPageAnnotations.filter((a: any) =>
      a.type === 'tick' || a.type === 'inline_tick' || a.type === 'cross' || a.type === 'mark_badge'
    );

    if (rootMarks.length > 0) {
      const rawMapped = rootPageAnnotations.map((ann: any) => {
        const spInfo = getSubpartFeedback(ann.subpart_label);
        const teacherCorrection = ann.teacher_correction || spInfo?.note || '';
        const comment = ann.comment || (ann.type === 'cross' ? spInfo?.deduction || spInfo?.note : '');

        const { box_2d: clampedBox, bbox } = recalibrateAnnotationBox(
          { ...ann, teacher_correction: teacherCorrection, comment },
          subpartFeedbackMap
        );

        return {
          ...ann,
          box_2d: clampedBox,
          bbox,
          teacher_correction: teacherCorrection,
          comment,
          page_index: targetPageIndex,
        };
      });
      finalResult = finalizeAnnotationsList(rawMapped, subpartsList, targetPageIndex, layoutRegions);
    } else {
      // Use the OpenAI Normalized Page Coordinate Layout Engine:
      // Strictly bounded [0.0, 1.0], anchor-based, collision-resolved with connector lines!
      const { resolved } = buildNormalizedLayoutFromAssessment(assessment, targetPageIndex);

      const rawMapped = resolved.map((item) => ({
        type: item.type,
        text: item.text,
        comment: item.reason || item.teacher_correction || item.text,
        teacher_correction: item.teacher_correction,
        box_2d: item.box_2d || [
          Math.round(item.bbox.y * 1000),
          Math.round(item.bbox.x * 1000),
          Math.round((item.bbox.y + item.bbox.height) * 1000),
          Math.round((item.bbox.x + item.bbox.width) * 1000),
        ],
        subpart_label: item.subpart_label,
        page_index: targetPageIndex,
        bbox: item.bbox,
        target_id: item.target_id,
        connector: item.connector,
        confidence: item.confidence,
        is_flagged_for_review: item.is_flagged_for_review,
      }));
      finalResult = finalizeAnnotationsList(rawMapped, subpartsList, targetPageIndex, layoutRegions);
    }
  }

  // === Filter out foreign/mismatched or missing-work annotations ===
  const missingSubpartKeys = new Set<string>();
  finalResult.forEach((a: any) => {
    const combined = `${a.comment || ''} ${a.teacher_correction || ''} ${a.text || ''}`;
    if (isMissingOrForeignAnnotationText(combined) && a.subpart_label) {
      missingSubpartKeys.add(String(a.subpart_label).toLowerCase().replace(/[^a-z0-9]/g, ''));
    }
  });
  subpartsList.forEach((sp: any) => {
    if ((Number(sp.score) || 0) === 0) {
      const combined = `${sp.teacher_correction_note || ''} ${sp.constructive_correction || ''} ${(sp.deductions || []).join(' ')}`;
      if (isMissingOrForeignAnnotationText(combined) && sp.part_label) {
        missingSubpartKeys.add(String(sp.part_label).toLowerCase().replace(/[^a-z0-9]/g, ''));
      }
    }
  });

  finalResult = finalResult.filter((a: any) => {
    if (a.type === 'total_header') return true;
    const combined = `${a.comment || ''} ${a.teacher_correction || ''} ${a.text || ''}`;
    if (isMissingOrForeignAnnotationText(combined)) {
      return false;
    }
    const key = (a.subpart_label || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    if (key && missingSubpartKeys.has(key)) {
      const txt = String(a.text || '');
      const hasNonZeroBadge = txt.includes('/') && !txt.includes('0/');
      if (!hasNonZeroBadge) return false;
    }
    return true;
  });

  return finalResult;
}

/**
 * Guarantees every subpart has an authentic right-margin score mark and prevents badge stacking.
 */
function finalizeAnnotationsList(
  rawList: any[],
  subpartsList: any[],
  targetPageIndex: number,
  layoutRegions: any[] = []
): any[] {
  const rawBadges: any[] = [];
  const otherMarks: any[] = [];

  const normalizeQ = (q: any) =>
    q !== undefined && q !== null ? String(q).trim().replace(/^q(?:uestion)?\s*/i, '') : '';

  const getScopedSubpartKey = (label: any, q: any) => {
    const qNorm = normalizeQ(q);
    const partKey = canonicalSubpartKey(label, qNorm);
    return partKey ? `${qNorm}::${partKey}` : '';
  };

  // Only subparts belonging to this page (and actually attempted/present) should ever receive margin badges
  const activeSubparts = deduplicateSubparts(
    (subpartsList || []).filter((sp: any) => {
      if (sp.unattempted) return false;
      if (typeof sp.page_index === 'number' && sp.page_index !== targetPageIndex) return false;
      if ((Number(sp.score) || 0) === 0) {
        const combined = `${sp.teacher_correction_note || ''} ${sp.constructive_correction || ''} ${(sp.deductions || []).join(' ')}`;
        if (isMissingOrForeignAnnotationText(combined)) return false;
      }
      return true;
    })
  );

  rawList.forEach((ann) => {
    if (isLikelyHallucinatedSubpart(ann.subpart_label)) {
      if (ann.type === 'mark_badge' || isScoreFractionText(ann.text)) {
        return; // Drop hallucinated/duplicate badge
      }
    }
    const isBadge =
      ann.type === 'mark_badge' ||
      (isScoreFractionText(ann.text) && !(ann.text || '').toLowerCase().includes('total') && (ann.bbox?.x >= 0.70 || ann.box_2d?.[1] >= 700));
    if (isBadge) {
      rawBadges.push(ann);
    } else {
      otherMarks.push(ann);
    }
  });

  // Deduplicate badges and anchor each to its unique subpart on this page so NO subpart ever gets double marks
  const badges: any[] = [];
  const matchedSpIndices = new Set<number>();
  const seenFallbackBadgeKeys = new Set<string>();

  const getBadgeY = (b: any): number =>
    Array.isArray(b.box_2d) ? b.box_2d[0] : Math.round((b.bbox?.y || 0) * 1000);

  rawBadges.forEach((b) => {
    const bQ = normalizeQ(b.question_number);
    const bKey = canonicalSubpartKey(b.subpart_label, bQ);

    const candidateIndices: number[] = [];
    activeSubparts.forEach((sp: any, idx: number) => {
      const spQ = normalizeQ(sp.question_number);
      if (bQ && spQ && bQ !== spQ) return;
      const spKey = canonicalSubpartKey(sp.part_label, spQ);
      if (bKey && spKey && (spKey === bKey || spKey.endsWith(bKey) || bKey.endsWith(spKey))) {
        candidateIndices.push(idx);
      }
    });

    if (candidateIndices.length > 0) {
      const availableIndices = candidateIndices.filter((idx) => !matchedSpIndices.has(idx));
      if (availableIndices.length === 0) {
        return; // Drop duplicate badge
      }

      const bY = getBadgeY(b);
      let bestIdx = availableIndices[0];
      let bestDist = Infinity;
      availableIndices.forEach((idx) => {
        const spY = typeof activeSubparts[idx].line_y === 'number' ? activeSubparts[idx].line_y : bY;
        const dist = Math.abs(spY - bY);
        if (dist < bestDist) {
          bestDist = dist;
          bestIdx = idx;
        }
      });

      matchedSpIndices.add(bestIdx);
      const matchedSp = activeSubparts[bestIdx];
      const spScore = Number(matchedSp.score ?? 0);
      const spMax = Number(matchedSp.max_score ?? 1);
      b.text = `(${spScore}/${spMax})`;
      if (!b.question_number && matchedSp.question_number) {
        b.question_number = matchedSp.question_number;
      }

      if (typeof matchedSp.line_y === 'number' && matchedSp.line_y >= 35) {
        const targetY = Math.max(25, Math.min(matchedSp.line_y, 940));
        if (b.box_2d) {
          b.box_2d[0] = targetY - 14;
          b.box_2d[2] = targetY + 14;
          b.box_2d[1] = 865;
          b.box_2d[3] = 975;
        }
        if (b.bbox) {
          b.bbox.y = (targetY - 14) / 1000;
          b.bbox.height = 0.028;
          b.bbox.x = 0.865;
          b.bbox.width = 0.11;
        }
      }
      badges.push(b);
    } else {
      const fallbackKey = bKey
        ? `${bQ}::${bKey}`
        : `nolabel::${String(b.text || '').trim()}::${Math.round(getBadgeY(b) / 30)}`;
      if (seenFallbackBadgeKeys.has(fallbackKey)) {
        return;
      }
      seenFallbackBadgeKeys.add(fallbackKey);
      badges.push(b);
    }
  });

  // Guarantee that every active subpart on this page has exactly one margin score mark
  activeSubparts.forEach((sp: any, idx: number) => {
    if (matchedSpIndices.has(idx)) return;
    const spQ = normalizeQ(sp.question_number);
    const cleanKey = canonicalSubpartKey(sp.part_label, spQ);
    if (cleanKey) {
      matchedSpIndices.add(idx);
      const score = Number(sp.score) || 0;
      const maxScore = Number(sp.max_score) || 1;

      // Anchor to Page Surveyor verified region if available
      const matchingRegion = layoutRegions.find((lr: any) =>
        lr.type === 'answer_line' && lr.subpart_label &&
        canonicalSubpartKey(lr.subpart_label, spQ) === cleanKey
      );

      const yEstimate = (matchingRegion && matchingRegion.bbox?.y)
        ? Math.max(35, Math.round((matchingRegion.bbox.y + (matchingRegion.bbox.height || 0.02) / 2) * 1000))
        : (typeof sp.line_y === 'number' && sp.line_y >= 35 && sp.line_y <= 960
            ? sp.line_y
            : Math.round(80 + idx * (780 / Math.max(1, activeSubparts.length - 1))));

      const badgeBox: [number, number, number, number] = [Math.max(25, yEstimate - 14), 865, Math.min(975, yEstimate + 14), 975];
      badges.push({
        type: 'mark_badge',
        question_number: sp.question_number,
        subpart_label: sp.part_label,
        text: `(${score}/${maxScore})`,
        comment: `Part ${sp.part_label}: ${score}/${maxScore}`,
        box_2d: badgeBox,
        bbox: { x: 0.865, y: badgeBox[0] / 1000, width: 0.11, height: 0.028 },
        page_index: targetPageIndex,
      });
    }
  });

  // Prevent badge collisions in the right margin (guarantee minimum 38 units / ~4% vertical spacing)
  badges.sort((a, b) => (a.box_2d?.[0] || Math.round((a.bbox?.y || 0) * 1000)) - (b.box_2d?.[0] || Math.round((b.bbox?.y || 0) * 1000)));

  let lastY = 20;
  badges.forEach((b) => {
    let curY = b.box_2d ? b.box_2d[0] : Math.round((b.bbox?.y || 0) * 1000);
    if (curY < lastY + 38) {
      curY = lastY + 38;
      if (b.box_2d) {
        const h = Math.max(25, b.box_2d[2] - b.box_2d[0]);
        b.box_2d[0] = curY;
        b.box_2d[2] = curY + h;
      }
      if (b.bbox) {
        b.bbox.y = curY / 1000;
      }
    }
    lastY = curY;
  });

  // Build a vertical boundary map for each subpart based on badge positions
  // In British/Cambridge exam sheets, mark badges sit at the END / answer line of the subpart!
  // Subpart i's territory is therefore [prevBadge.Y + 15, currentBadge.Y + 15]
  const subpartBoundaryMap = new Map<string, { startY: number; endY: number }>();
  badges.forEach((b, bIdx) => {
    const scopedKey = getScopedSubpartKey(b.subpart_label, b.question_number);
    if (scopedKey) {
      const prevBadge = badges[bIdx - 1];
      const startY = prevBadge
        ? Math.max(30, (prevBadge.box_2d ? prevBadge.box_2d[0] : Math.round((prevBadge.bbox?.y || 0) * 1000)) + 15)
        : 35;
      const curBadgeY = b.box_2d ? b.box_2d[0] : Math.round((b.bbox?.y || 0) * 1000);
      const endY = Math.max(startY + 25, curBadgeY + 15);
      subpartBoundaryMap.set(scopedKey, { startY, endY });
    }
  });

  const findSubpartBounds = (label: any, q: any) => {
    const qNorm = normalizeQ(q);
    const partKey = canonicalSubpartKey(label, qNorm);
    if (!partKey) return null;
    if (subpartBoundaryMap.has(`${qNorm}::${partKey}`)) {
      return subpartBoundaryMap.get(`${qNorm}::${partKey}`)!;
    }
    if (!qNorm) {
      for (const [k, v] of subpartBoundaryMap.entries()) {
        const [, kPart] = k.split('::');
        if (kPart === partKey || kPart.endsWith(partKey) || partKey.endsWith(kPart)) {
          return v;
        }
      }
    }
    return null;
  };

  // Bound otherMarks (crosses, comments, underlines) strictly within their subpart's territory
  const clampedOtherMarks = otherMarks.map((ann) => {
    // Sanitize tick mark text: only allow strict concise mark codes (e.g. B1, M1, A1, C1), NEVER sentences or phrases
    if (ann.type === 'tick' || ann.type === 'inline_tick') {
      const isStrict = typeof ann.text === 'string' && /^[A-Z]\d{1,2}$/i.test(ann.text.trim()) && ann.text.trim().length <= 4;
      if (!isStrict) {
        ann.text = '✓';
      } else {
        ann.text = ann.text.trim().toUpperCase();
      }
    }

    const bounds = findSubpartBounds(ann.subpart_label, ann.question_number);
    if (bounds) {
      let curY = ann.box_2d ? ann.box_2d[0] : Math.round((ann.bbox?.y || 0) * 1000);
      // If annotation drifted outside its subpart's boundaries, clamp it safely inside!
      if (curY < bounds.startY || curY >= bounds.endY) {
        curY = Math.max(bounds.startY, Math.min(bounds.startY + 20, bounds.endY - 25));
        if (ann.box_2d) {
          const h = Math.max(25, ann.box_2d[2] - ann.box_2d[0]);
          ann.box_2d[0] = curY;
          ann.box_2d[2] = curY + h;
        }
        if (ann.bbox) {
          ann.bbox.y = curY / 1000;
        }
      }
    }
    return ann;
  });

  // Guarantee that every active subpart with missed marks has an authentic teacher red-ink correction note
  // and guarantee that every earned mark has a point-by-point inline tick
  activeSubparts.forEach((sp: any) => {
    const spQ = normalizeQ(sp.question_number);
    const cleanKey = canonicalSubpartKey(sp.part_label, spQ);
    const score = Number(sp.score) || 0;
    const maxScore = Number(sp.max_score) || 1;
    const bounds = findSubpartBounds(sp.part_label, spQ);
    const matchingBadge = badges.find(b => {
      const bQ = normalizeQ(b.question_number);
      if (spQ && bQ && spQ !== bQ) return false;
      const bKey = canonicalSubpartKey(b.subpart_label, bQ);
      return Boolean(cleanKey && bKey && (bKey === cleanKey || bKey.endsWith(cleanKey) || cleanKey.endsWith(bKey)));
    });
    const badgeY = matchingBadge?.box_2d ? matchingBadge.box_2d[0] : Math.round((matchingBadge?.bbox?.y || 0) * 1000);

    // 1. Synthesize point-by-point inline ticks if fewer ticks exist than earned score
    const existingTicks = clampedOtherMarks.filter(m => {
      const mQ = normalizeQ(m.question_number);
      if (spQ && mQ && spQ !== mQ) return false;
      const mKey = canonicalSubpartKey(m.subpart_label, mQ);
      return Boolean(cleanKey && mKey && (mKey === cleanKey || mKey.endsWith(cleanKey) || cleanKey.endsWith(mKey))) &&
             (m.type === 'tick' || m.type === 'inline_tick');
    });

    if (score > 0 && existingTicks.length < score) {
      const neededTicks = score - existingTicks.length;
      const startY = bounds ? bounds.startY + 10 : Math.max(badgeY - 30, 40);
      const endY = bounds ? Math.min(bounds.endY - 20, badgeY) : badgeY;
      const totalSpan = Math.max(25, endY - startY);

      const earnedPoints = Array.isArray(sp.marking_points)
        ? sp.marking_points.filter((pt: any) => pt.is_earned || pt.tick_or_cross === 'tick')
        : [];

      const xStops = [520, 660, 585, 735, 480, 700, 620, 760];
      for (let i = 0; i < neededTicks; i++) {
        const pt = earnedPoints[existingTicks.length + i];
        let tickY: number;
        let tickX: number;

        if (pt && Array.isArray(pt.box_2d) && pt.box_2d.length === 4 && (pt.box_2d[0] > 0 || pt.box_2d[2] > 0)) {
          tickY = Math.round((pt.box_2d[0] + pt.box_2d[2]) / 2);
          tickX = Math.min(Math.max(pt.box_2d[3] + 6, 120), 780);
        } else {
          const totalTicks = existingTicks.length + neededTicks;
          const stepFrac = (existingTicks.length + i + 1) / (totalTicks + 1);
          tickY = Math.round(startY + totalSpan * stepFrac);
          tickX = xStops[(existingTicks.length + i) % xStops.length];
        }

        const isStrict = typeof pt?.mark_code === 'string' && /^[A-Z]\d{1,2}$/i.test(pt.mark_code.trim()) && pt.mark_code.trim().length <= 4;
        const tickText = isStrict ? pt.mark_code.trim().toUpperCase() : '✓';

        clampedOtherMarks.push({
          type: 'inline_tick',
          text: tickText,
          comment: pt?.criterion || pt?.student_phrase || `Part ${sp.part_label} mark earned`,
          question_number: sp.question_number,
          subpart_label: sp.part_label,
          page_index: targetPageIndex,
          box_2d: [Math.max(tickY - 14, 25), tickX, Math.min(tickY + 14, 940), Math.min(tickX + 35, 820)],
          bbox: { x: tickX / 1000, y: Math.max(25, tickY - 14) / 1000, width: 0.035, height: 0.028 },
        });
      }
    }

    // 2. Synthesize teacher correction note for missed marks
    const note = (
      sp.teacher_correction_note ||
      sp.constructive_correction ||
      sp.teacher_correction ||
      (sp.deductions && sp.deductions[0]) ||
      ''
    ).replace(/^✎\s*/, '').replace(/^\^\s*/, '').trim();

    if (score < maxScore && note) {
      const existingNote = clampedOtherMarks.find((m) => {
        const mQ = normalizeQ(m.question_number);
        if (spQ && mQ && spQ !== mQ) return false;
        const mKey = canonicalSubpartKey(m.subpart_label, mQ);
        return Boolean(cleanKey && mKey && (mKey === cleanKey || mKey.endsWith(cleanKey) || cleanKey.endsWith(mKey))) &&
               (m.type === 'comment' || m.type === 'teacher_note' || m.type === 'underline');
      });

      if (existingNote) {
        if (!existingNote.teacher_correction) {
          existingNote.teacher_correction = note;
          existingNote.text = note;
          existingNote.comment = note;
        }
      } else {
        const corrY = bounds
          ? Math.min(bounds.startY + 24, bounds.endY - 18)
          : (badgeY > 0 ? Math.min(badgeY + 18, 930) : 300);

        clampedOtherMarks.push({
          type: 'comment',
          text: note,
          comment: note,
          teacher_correction: note,
          question_number: sp.question_number,
          subpart_label: sp.part_label,
          page_index: targetPageIndex,
          box_2d: [corrY, 130, Math.min(corrY + 28, 940), 760],
          bbox: { x: 0.13, y: corrY / 1000, width: 0.65, height: 0.028 }
        });
      }
    }
  });

  // 3. Deduplicate comments strictly so no subpart ever has duplicate comments
  const seenComments = new Set<string>();
  const deduplicatedOtherMarks: any[] = [];
  clampedOtherMarks.forEach((m) => {
    if (m.type === 'comment' || m.type === 'teacher_note') {
      const scopedKey = getScopedSubpartKey(m.subpart_label, m.question_number);
      const textClean = (m.teacher_correction || m.text || m.comment || '').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 30);
      const dedupeKey = `${scopedKey}_${textClean}`;
      if (seenComments.has(dedupeKey)) {
        return; // Discard duplicate comment
      }
      seenComments.add(dedupeKey);
    }
    deduplicatedOtherMarks.push(m);
  });

  // 4. Strict 2D Collision Resolution: Ticks and Comments MUST NOT overlap!
  const ticks = deduplicatedOtherMarks.filter(m => m.type === 'tick' || m.type === 'inline_tick');
  const comments = deduplicatedOtherMarks.filter(m => m.type === 'comment' || m.type === 'teacher_note' || m.type === 'underline');

  comments.forEach(comm => {
    const cBox = comm.box_2d;
    if (!Array.isArray(cBox) || cBox.length < 4) return;

    // Check collision against all ticks in the same subpart
    const commQ = normalizeQ(comm.question_number);
    const commSubpart = canonicalSubpartKey(comm.subpart_label, commQ);
    const relevantTicks = ticks.filter(t => {
      const tQ = normalizeQ(t.question_number);
      if (commQ && tQ && commQ !== tQ) return false;
      const tSubpart = canonicalSubpartKey(t.subpart_label, tQ);
      return !commSubpart || !tSubpart || commSubpart === tSubpart;
    });

    for (const t of relevantTicks) {
      const tBox = t.box_2d;
      if (!Array.isArray(tBox) || tBox.length < 4) continue;

      // 2D collision check with safety buffer
      const yOverlap = Math.max(cBox[0], tBox[0] - 8) < Math.min(cBox[2], tBox[2] + 8);
      const xOverlap = Math.max(cBox[1], tBox[1] - 8) < Math.min(cBox[3], tBox[3] + 8);

      if (yOverlap && xOverlap) {
        // Shift comment away from tick vertically
        const tickMidY = (tBox[0] + tBox[2]) / 2;
        const commMidY = (cBox[0] + cBox[2]) / 2;
        const commHeight = Math.max(22, cBox[2] - cBox[0]);

        if (commMidY >= tickMidY) {
          // Push comment below the tick
          cBox[0] = Math.min(930, tBox[2] + 10);
          cBox[2] = Math.min(950, cBox[0] + commHeight);
        } else {
          // Push comment above the tick
          cBox[2] = Math.max(30, tBox[0] - 10);
          cBox[0] = Math.max(20, cBox[2] - commHeight);
        }

        if (comm.bbox) {
          comm.bbox.y = cBox[0] / 1000;
          comm.bbox.height = (cBox[2] - cBox[0]) / 1000;
        }
      }
    }
  });

  return [...badges, ...deduplicatedOtherMarks];
}

export { buildNormalizedLayoutFromAssessment };
