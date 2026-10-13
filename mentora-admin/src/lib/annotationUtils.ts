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
export function reconcileAssessment(assessment: AssessmentResult, officialMaxScore?: number): AssessmentResult {
  if (!assessment) return assessment;

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

  // Helper map for subpart feedback (deductions, correction notes, constructive guidance)
  const subpartsList: AssessmentSubpart[] = pageData?.subparts || assessment.subparts || [];
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

  const pageAnnotationsList = pageData?.annotations || [];
  const hasPageAnnotations = Array.isArray(pageAnnotationsList) && pageAnnotationsList.length > 0;
  const pageMarks = hasPageAnnotations
    ? pageAnnotationsList.filter((a: any) =>
        a.type === 'tick' || a.type === 'inline_tick' || a.type === 'cross' || a.type === 'mark_badge'
      )
    : [];

  let finalResult: any[] = [];

  const layoutRegions = (pageData as any)?.layout_regions || (assessment as any)?.layout_regions || [];

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
  const badges: any[] = [];
  const otherMarks: any[] = [];

  rawList.forEach((ann) => {
    const isBadge =
      ann.type === 'mark_badge' ||
      ((ann.text || '').includes('/') && !(ann.text || '').includes('Total') && (ann.bbox?.x >= 0.70 || ann.box_2d?.[1] >= 700));
    if (isBadge) {
      badges.push(ann);
    } else {
      otherMarks.push(ann);
    }
  });

  // Guarantee that every subpart from the paper manifest/subparts has a margin score mark
  const seenLabels = new Set(
    badges
      .map((b) => (b.subpart_label || '').toLowerCase().replace(/[^a-z0-9]/g, ''))
      .filter(Boolean)
  );

  subpartsList.forEach((sp: any, idx: number) => {
    const rawLabel = (sp.part_label || '').toLowerCase().trim();
    const cleanKey = rawLabel.replace(/[^a-z0-9]/g, '');
    if (cleanKey && !seenLabels.has(cleanKey)) {
      seenLabels.add(cleanKey);
      const score = Number(sp.score) || 0;
      const maxScore = Number(sp.max_score) || 1;
      const isZero = score === 0;

      // Anchor to Page Surveyor verified region if available
      const matchingRegion = layoutRegions.find((lr: any) =>
        lr.type === 'answer_line' && lr.subpart_label &&
        lr.subpart_label.replace(/[^a-z0-9]/gi, '').toLowerCase() === cleanKey
      );

      const yEstimate = (matchingRegion && matchingRegion.bbox?.y)
        ? Math.max(35, Math.round(matchingRegion.bbox.y * 1000) - 20)
        : (typeof sp.line_y === 'number' && sp.line_y >= 40 && sp.line_y <= 950
            ? Math.max(35, sp.line_y - 20)
            : Math.round(70 + idx * (800 / Math.max(1, subpartsList.length - 1))));

      const { box_2d, bbox } = recalibrateAnnotationBox({
        type: 'mark_badge',
        subpart_label: sp.part_label,
        text: `(${score}/${maxScore})`,
        comment: `Part ${sp.part_label}: ${score}/${maxScore}`,
        box_2d: [yEstimate, 865, yEstimate + 30, 975],
      });
      badges.push({
        type: 'mark_badge',
        subpart_label: sp.part_label,
        text: `(${score}/${maxScore})`,
        comment: `Part ${sp.part_label}: ${score}/${maxScore}`,
        box_2d,
        bbox,
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
    const key = (b.subpart_label || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    if (key) {
      const prevBadge = badges[bIdx - 1];
      const startY = prevBadge
        ? Math.max(30, (prevBadge.box_2d ? prevBadge.box_2d[0] : Math.round((prevBadge.bbox?.y || 0) * 1000)) + 15)
        : 35;
      const curBadgeY = b.box_2d ? b.box_2d[0] : Math.round((b.bbox?.y || 0) * 1000);
      const endY = Math.max(startY + 25, curBadgeY + 15);
      subpartBoundaryMap.set(key, { startY, endY });
    }
  });

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

    const key = (ann.subpart_label || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const bounds = key ? subpartBoundaryMap.get(key) : null;
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

  // Guarantee that every subpart with missed marks has an authentic teacher red-ink correction note
  // and guarantee that every earned mark has a point-by-point inline tick
  subpartsList.forEach((sp: any) => {
    const rawLabel = (sp.part_label || '').toLowerCase().trim();
    const cleanKey = rawLabel.replace(/[^a-z0-9]/g, '');
    const score = Number(sp.score) || 0;
    const maxScore = Number(sp.max_score) || 1;
    const bounds = subpartBoundaryMap.get(cleanKey);
    const matchingBadge = badges.find(b => {
      const bKey = (b.subpart_label || '').toLowerCase().replace(/[^a-z0-9]/g, '');
      return bKey === cleanKey || bKey.endsWith(cleanKey) || cleanKey.endsWith(bKey);
    });
    const badgeY = matchingBadge?.box_2d ? matchingBadge.box_2d[0] : Math.round((matchingBadge?.bbox?.y || 0) * 1000);

    // 1. Synthesize point-by-point inline ticks if fewer ticks exist than earned score
    const existingTicks = clampedOtherMarks.filter(m => {
      const mKey = (m.subpart_label || '').toLowerCase().replace(/[^a-z0-9]/g, '');
      return (mKey === cleanKey || mKey.endsWith(cleanKey) || cleanKey.endsWith(mKey)) &&
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

      for (let i = 0; i < neededTicks; i++) {
        const pt = earnedPoints[existingTicks.length + i];
        let tickY: number;
        let tickX: number;

        if (pt && Array.isArray(pt.box_2d) && pt.box_2d.length === 4 && (pt.box_2d[0] > 0 || pt.box_2d[2] > 0)) {
          tickY = Math.round((pt.box_2d[0] + pt.box_2d[2]) / 2);
          tickX = Math.min(Math.max(pt.box_2d[3] + 8, 140), 760);
        } else {
          const stepFrac = (existingTicks.length + i + 1) / (score + 1);
          tickY = Math.round(startY + totalSpan * stepFrac);
          const xStops = [520, 680, 590, 740];
          tickX = xStops[(existingTicks.length + i) % xStops.length];
        }

        const isStrict = typeof pt?.mark_code === 'string' && /^[A-Z]\d{1,2}$/i.test(pt.mark_code.trim()) && pt.mark_code.trim().length <= 4;
        const tickText = isStrict ? pt.mark_code.trim().toUpperCase() : '✓';

        clampedOtherMarks.push({
          type: 'inline_tick',
          text: tickText,
          comment: pt?.criterion || pt?.student_phrase || `Part ${sp.part_label} mark earned`,
          subpart_label: sp.part_label,
          page_index: targetPageIndex,
          box_2d: [tickY - 12, tickX, tickY + 12, tickX + 28],
          bbox: { x: tickX / 1000, y: (tickY - 12) / 1000, width: 0.03, height: 0.024 },
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
      let existingNote = clampedOtherMarks.find((m) => {
        const mKey = (m.subpart_label || '').toLowerCase().replace(/[^a-z0-9]/g, '');
        return (mKey === cleanKey || mKey.endsWith(cleanKey) || cleanKey.endsWith(mKey)) &&
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
      const cleanKey = (m.subpart_label || '').toLowerCase().replace(/[^a-z0-9]/g, '');
      const textClean = (m.teacher_correction || m.text || m.comment || '').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 30);
      const dedupeKey = `${cleanKey}_${textClean}`;
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
    const commSubpart = (comm.subpart_label || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const relevantTicks = ticks.filter(t => {
      const tSubpart = (t.subpart_label || '').toLowerCase().replace(/[^a-z0-9]/g, '');
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
