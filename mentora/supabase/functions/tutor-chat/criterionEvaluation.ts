/**
 * SUBAGENT 2: SENIOR CHIEF EXAMINER / RUBRIC JUDGE
 * 
 * Specialization: Pure, unburdened evaluation of mark scheme criteria against
 * the student's observed work (handwriting, mathematical derivations, and
 * visual diagrams).
 * 
 * The model NEVER computes totals, NEVER guesses coordinates, and NEVER
 * writes lengthy feedback. It focuses 100% of its cognitive capacity on
 * objective, fair criterion satisfaction under Cambridge / ZIMSEC standards.
 */

export interface CriterionVerdict {
  criterion_index: number;
  satisfied: boolean;
  evidence: string;      // exact student quote, mathematical formula/value, or diagram feature — "" if not satisfied
  confidence: 'high' | 'medium' | 'low';
}

export interface CriterionEvaluationResult {
  verdicts: CriterionVerdict[];
  transcription_notes?: string;
}

export interface SubpartPerceptionDetails {
  written_text?: string;
  math_steps?: string[];
  diagram_features?: string[];
  selections?: string[];
}

/**
 * Build the criterion-evaluation prompt.
 */
export function buildCriterionEvaluationPrompt(
  qNum: string,
  subpartLabel: string,
  criteria: { index: number; code: string; value: number; text: string; isLevel: boolean; guidance?: string }[],
  marksAvailable: number,
  overlapGroups: Array<{ group: number; memberIndices: number[] }>,
  studentPerception: string | SubpartPerceptionDetails
): string {
  const criteriaList = criteria.map(c =>
    `${c.index}. [${c.code}${c.isLevel ? '/LEVEL' : ''}] ${c.text}${c.guidance ? `\n   GUIDANCE: ${c.guidance}` : ''}`
  ).join('\n');

  const overlapNote = overlapGroups.length > 0
    ? `\nNOTE — The following criteria express THE SAME UNDERLYING IDEA (award evidence separately for each, but the scoring engine will count the group once):\n${overlapGroups.map(g => `  Group ${g.group}: criteria ${g.memberIndices.join(', ')}`).join('\n')}\n`
    : '';

  let observedWorkText = '';
  if (typeof studentPerception === 'string') {
    observedWorkText = studentPerception.trim() || '(inspect the attached high-resolution page image)';
  } else {
    const parts: string[] = [];
    if (studentPerception.written_text?.trim()) {
      parts.push(`• Handwritten Responses: "${studentPerception.written_text.trim()}"`);
    }
    if (studentPerception.math_steps && studentPerception.math_steps.length > 0) {
      parts.push(`• Calculations & Mathematical Working:\n${studentPerception.math_steps.map(m => `   - ${m}`).join('\n')}`);
    }
    if (studentPerception.diagram_features && studentPerception.diagram_features.length > 0) {
      parts.push(`• Diagram / Graphical Features Drawn:\n${studentPerception.diagram_features.map(d => `   - ${d}`).join('\n')}`);
    }
    if (studentPerception.selections && studentPerception.selections.length > 0) {
      parts.push(`• Circled / Underlined Options: ${studentPerception.selections.join(', ')}`);
    }
    observedWorkText = parts.length > 0 ? parts.join('\n\n') : '(inspect the attached high-resolution page image)';
  }

  return `You are the Senior Chief Examiner evaluating ONE subpart of Question ${qNum}.
You evaluate student exam answers under official Cambridge / ZIMSEC / Edexcel examiner standards.

SUBPART: (${subpartLabel}) — marks available: ${marksAvailable}

STUDENT'S OBSERVED WORK (from script and diagrams):
"""
${observedWorkText}
"""

MARKING CRITERIA FOR THIS SUBPART:
${criteriaList}
${overlapNote}

EXAMINER ASSESSMENT PROTOCOL:
1. INDEPENDENT CRITERION EVALUATION:
   - Judge EACH criterion independently against the candidate's answer.
   - Look at BOTH the candidate's text, calculations, AND candidate-drawn diagram features.
2. CANDIDATE INK ONLY (CRITICAL):
   - Evidence MUST come exclusively from what the candidate wrote, calculated, or drew with their pen or pencil.
   - Pre-printed exam paper elements (printed question text, printed diagrams, printed graphs like Fig. 1.1, printed grid lines, printed circuit schematics) belong to the exam board, NOT the candidate.
   - NEVER credit a pre-printed figure, line, or printed value to the candidate!
3. CALCULATIONS, METHOD (M), ACCURACY (A) AND ALGEBRAIC EXPRESSIONS (CRITICAL):
   - For an Accuracy / Answer mark:
     * NUMERICAL VALUES: Candidate's numerical value must match the mark scheme (accept standard rounding, significant figures, fractions e.g. 1/40 = 0.025, or degree symbols e.g. 150° = 150).
     * ALGEBRAIC EXPRESSIONS: Accept all standard algebraically equivalent forms regardless of whitespace, spacing around operators (+, -, *, /), or fraction format (e.g. "(x + 3)/(2y + 5)" is completely equivalent to "\\frac{x+3}{2y+5}" or "(x+3)/(2y+5)").
     * EXAMINER DIRECTIVES: Ignore mark scheme notes like "final answer", "oe" (or equivalent), "seen", "soi" (seen or implied), "isw" (ignore subsequent working), or "accept ...". These are instructions to you as the examiner, NOT words the student must write. If the student wrote "(x + 3)/(2y + 5)", they fully satisfy "(x + 3)/(2y + 5) final answer".
     * DIRECT ANSWER MARKS: If the criterion awards full marks for the correct answer (e.g. "150 — 3 marks"), and the candidate wrote "150" or "c = 150°", award satisfied: true with the student's answer as evidence.
   - If the candidate's calculation yields a genuinely incorrect value or expression, the mark is NOT satisfied (satisfied: false, evidence: "").
   - Method (M) marks: award if the correct formula, valid algebraic expansion, or valid substitution is shown, even if final arithmetic slipped.
4. UNIVERSAL BENEFIT OF THE DOUBT (BOD) & EQUIVALENCE:
   - For descriptive / qualitative points: accept paraphrases, synonyms, and equivalent explanations. Exact wording is never required.
   - For candidate drawings: if the candidate drew the required feature (e.g. ray, normal, circuit component), it is satisfied.
5. CONCRETE EVIDENCE REQUIREMENT:
   - Every SATISFIED verdict MUST include the candidate's actual written words, mathematical working, or drawn feature.
   - If the candidate wrote an incorrect value or method, the verdict is NOT satisfied (evidence: "").
6. SPECIAL CASES & FALLBACKS (SC MARKS):
   - Criteria marked [SC...] or starting with "If B0 scored..." or "for N correct" are alternative fallback paths for candidates who missed the primary marks. Do not penalize candidates for missing a fallback if they satisfied the primary criterion!
7. BINDING GUIDANCE:
   - GUIDANCE lines are official constraints: "MUST ..." conditions are mandatory; "Accept ... range" widen acceptable values.

Return ONLY raw JSON:
{
  "verdicts": [
    { "criterion_index": 0, "satisfied": true, "evidence": "quote or diagram feature", "confidence": "high" },
    { "criterion_index": 1, "satisfied": false, "evidence": "", "confidence": "high" }
  ]
}`;
}
