import type { VisualAnnotation, AssessmentResult, AssessmentSubpart } from './tutorAgent';

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
  subparts.forEach((sp) => {
    const max = Number(sp.max_score) || 1;
    sp.score = Math.max(0, Math.min(Number(sp.score) || 0, max));
  });
  const computedScore = subparts.reduce((sum, sp) => sum + (Number(sp.score) || 0), 0);
  const computedSubpartsMax = subparts.reduce((sum, sp) => sum + (Number(sp.max_score) || 0), 0);

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
  if (totalSubparts === 1) return [130];
  if (totalSubparts === 2) return [130, 320];
  if (totalSubparts === 3) return [125, 280, 460];
  if (totalSubparts === 4) return [125, 260, 410, 580];
  if (totalSubparts === 5) return [125, 245, 380, 520, 670];
  if (totalSubparts === 6) return [125, 235, 350, 460, 580, 690];
  if (totalSubparts === 7) return [125, 235, 350, 450, 550, 635, 715];

  // For 8 or more subparts, distribute within the active written area (Y: 120 to 730)
  const startY = 120;
  const availableSpan = Math.min(610, (totalSubparts - 1) * 80);
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

  const grandScore = assessment.total_score !== undefined ? assessment.total_score : assessment.score || 0;
  const grandMax = assessment.total_max_score !== undefined ? assessment.total_max_score : assessment.max_score || 1;

  let subparts: AssessmentSubpart[] = [];
  let score = grandScore;
  let maxScore = grandMax;
  let bottomText = `Total: ${grandScore}/${grandMax}`;

  if (typeof pageIndex === 'number' && assessment.pages && assessment.pages[pageIndex]) {
    const pageData = assessment.pages[pageIndex];
    subparts = pageData.subparts || assessment.subparts?.filter((sp) => sp.page_index === pageIndex) || [];
    score = pageData.page_score ?? 0;
    maxScore = pageData.page_max_score ?? 1;
    const isLastPage = pageIndex === assessment.pages.length - 1;
    bottomText = isLastPage
      ? `Total: ${grandScore}/${grandMax}`
      : `Page ${pageIndex + 1} Subtotal: ${score}/${maxScore}`;
  } else if (typeof pageIndex === 'number' && assessment.subparts) {
    subparts = assessment.subparts.filter((sp) => sp.page_index === pageIndex);
    score = subparts.reduce((sum, sp) => sum + (Number(sp.score) || 0), 0);
    maxScore = subparts.reduce((sum, sp) => sum + (Number(sp.max_score) || 0), 0) || 1;
    bottomText = `Page ${pageIndex + 1} Subtotal: ${score}/${maxScore}`;
  } else {
    subparts = assessment.subparts || [];
  }

  const synthesized: VisualAnnotation[] = [];

  // 1. Bottom Right: Natural handwritten teacher grade / subtotal
  synthesized.push({
    type: 'total_header',
    text: bottomText,
    comment: bottomText,
    box_2d: [840, bottomText.startsWith('Page') ? 700 : 750, 880, 960],
    page_index: pageIndex
  });

  if (subparts.length > 0) {
    const yPositions = computeSubpartYPositions(subparts.length);

    subparts.forEach((sp: AssessmentSubpart, idx: number) => {
      const yMid =
        typeof sp.line_y === 'number' && sp.line_y > 80 && sp.line_y < 960
          ? sp.line_y
          : yPositions[idx] || 120 + idx * 95;
      const awardedMarks = Number(sp.score) || 0;
      const maxSubpartMarks = Number(sp.max_score) || 1;

      // 2. Point-by-point inline marking (tick at each and every earned point)
      if (Array.isArray(sp.marking_points) && sp.marking_points.length > 0) {
        let earnedCount = 0;
        let unearnedCount = 0;

        sp.marking_points.forEach((pt) => {
          if (pt.is_earned) {
            earnedCount++;
            const inlineX = pt.box_2d && pt.box_2d[1] ? pt.box_2d[1] : Math.min(220 + (earnedCount - 1) * 150, 740);
            const inlineY = pt.box_2d && pt.box_2d[0] ? pt.box_2d[0] : yMid;
            synthesized.push({
              type: 'inline_tick',
              text: pt.mark_code || '✓',
              comment: pt.criterion || pt.student_phrase || `Point ${pt.point_number} earned`,
              box_2d: pt.box_2d || [Math.max(inlineY - 14, 40), inlineX, Math.min(inlineY + 14, 980), inlineX + 40],
              subpart_label: sp.part_label,
            });
          } else {
            unearnedCount++;
            const guide = pt.constructive_correction || `Missing: ${pt.criterion}. State correct working clearly.`;
            const noteY = pt.box_2d && pt.box_2d[0] ? pt.box_2d[0] : yMid + 25 + (unearnedCount - 1) * 35;
            synthesized.push({
              type: 'underline',
              text: guide.startsWith('✍️') || guide.startsWith('Correction:') || guide.startsWith('How to answer:')
                ? guide
                : `Correction: ${guide}`,
              comment: pt.criterion,
              box_2d: [Math.min(noteY, 930), 200, Math.min(noteY + 40, 960), 880],
              subpart_label: sp.part_label,
            });
          }
        });
      } else {
        // Synthesize inline ticks for each awarded mark across the student's line
        if (awardedMarks > 0) {
          for (let m = 0; m < awardedMarks; m++) {
            const tickX = Math.min(220 + m * 160, 720);
            synthesized.push({
              type: 'inline_tick',
              text: '✓',
              comment: sp.marks_awarded?.[m] || `Part ${sp.part_label} Point ${m + 1}`,
              box_2d: [Math.max(yMid - 14, 40), tickX, Math.min(yMid + 14, 980), tickX + 40],
              subpart_label: sp.part_label,
            });
          }
        }

        // Constructive correction note for missed marks
        if (awardedMarks < maxSubpartMarks) {
          const correctionText =
            sp.constructive_correction ||
            sp.teacher_correction_note ||
            sp.teacher_correction ||
            (sp.deductions && sp.deductions.join('; ')) ||
            '';
          if (
            correctionText &&
            !correctionText.toLowerCase().includes('good job') &&
            !correctionText.toLowerCase().includes('correct') &&
            !correctionText.toLowerCase().includes('omitted')
          ) {
            const formattedNote =
              correctionText.startsWith('✍️') ||
              correctionText.startsWith('Correction:') ||
              correctionText.startsWith('How to answer:')
                ? correctionText
                : `Correction: ${correctionText}`;

            synthesized.push({
              type: 'underline',
              text: formattedNote,
              comment: correctionText,
              box_2d: [Math.min(yMid + 25, 930), 200, Math.min(yMid + 75, 960), 880],
              subpart_label: sp.part_label,
            });
          }
        }
      }

      // 3. Right margin subpart fraction
      if (awardedMarks > 0) {
        synthesized.push({
          type: 'tick',
          text: `(${awardedMarks}/${maxSubpartMarks})`,
          comment: sp.marks_awarded?.[0] || `Part ${sp.part_label}: ${awardedMarks}/${maxSubpartMarks} marks`,
          box_2d: [Math.max(yMid - 16, 50), 875, Math.min(yMid + 16, 980), 975],
          subpart_label: sp.part_label,
        });
      } else {
        synthesized.push({
          type: 'cross',
          text: `(0/${maxSubpartMarks})`,
          comment: sp.deductions?.[0] || `Part ${sp.part_label}: 0/${maxSubpartMarks} marks`,
          box_2d: [Math.max(yMid - 16, 50), 875, Math.min(yMid + 16, 980), 975],
          subpart_label: sp.part_label,
        });
      }
    });
  } else {
    // Single part fallback
    if (score > 0) {
      for (let m = 0; m < score; m++) {
        synthesized.push({
          type: 'inline_tick',
          text: '✓',
          comment: `Point ${m + 1}`,
          box_2d: [200, 240 + m * 140, 230, 280 + m * 140],
        });
      }
      synthesized.push({
        type: 'tick',
        text: `(${score}/${maxScore})`,
        comment: `${score}/${maxScore} marks`,
        box_2d: [220, 875, 252, 975],
      });
    } else {
      synthesized.push({
        type: 'cross',
        text: `(0/${maxScore})`,
        comment: `0/${maxScore} marks`,
        box_2d: [220, 875, 252, 975],
      });
    }
    if (score < maxScore && (assessment.feedback || assessment.explanation)) {
      synthesized.push({
        type: 'underline',
        text: `Correction: ${assessment.explanation || assessment.feedback}`,
        box_2d: [260, 200, 310, 880],
      });
    }
  }

  return synthesized;
}
