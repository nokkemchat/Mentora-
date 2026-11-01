/**
 * SUBAGENT 1: VISUAL PERCEPTION AGENT (The Examiner's Eyes)
 * 
 * Specialization: Objective physical inventory of the student's handwriting,
 * calculations, diagrams, and selections for a specific question.
 * 
 * This agent DOES NOT grade, DOES NOT score, and DOES NOT judge correctness.
 * It ensures that no ray diagram arrow, margin calculation, formula, or circled
 * option is overlooked before rubric evaluation begins.
 */

export interface ObservedSubpartWork {
  part_label: string; // e.g. "(a)", "(b)(i)", "(b)(ii)"
  written_text: string; // all handwritten words/sentences transcribed
  math_steps: string[]; // equations, substitutions, intermediate calculations, units
  diagram_features: string[]; // physical visual elements: rays, arrows, normal lines, circuit symbols, graphs, points
  selections: string[]; // underlined, circled, or ticked options
  page_index: number;
}

export interface QuestionPerceptionResult {
  is_attempting_target_question: boolean;
  relevance_reason: string;
  subparts: ObservedSubpartWork[];
  unassigned_margin_notes: string[];
}

/**
 * Builds the visual perception prompt for Subagent 1.
 */
export function buildPerceptionPrompt(
  qNum: string,
  expectedSubparts: Array<{ label: string; marks: number }>,
  targetTopic?: string,
  targetContentSnippet?: string
): string {
  const subpartList = expectedSubparts.length > 0
    ? expectedSubparts.map(sp => `• Part (${sp.label.replace(/^\(?|\)?$/g, '')})`).join('\n')
    : `• Scan for all visible subparts of Question ${qNum} (e.g. (a), (b)(i), (b)(ii), etc.)`;

  return `You are the Senior Chief Examiner's Perception Specialist (The Examiner's Eyes).
Your ONLY task is to thoroughly examine the student's handwritten script for Question ${qNum} on the provided page image(s) and produce a detailed, objective inventory of EVERYTHING the student wrote, calculated, drew, or selected.

TARGET QUESTION: Question ${qNum}${targetTopic ? ` — Topic: ${targetTopic}` : ''}
${targetContentSnippet ? `Target Question Stem Summary: ${targetContentSnippet.slice(0, 300)}...` : ''}

EXPECTED OFFICIAL SUBPARTS TO LOOK FOR:
${subpartList}

CRITICAL RULES FOR PERCEPTION:
1. CANDIDATE INK ONLY (CRITICAL):
   - Clearly distinguish between PRE-PRINTED exam paper elements (printed question text, printed diagrams, printed graphs like Fig. 1.1, printed grid lines, printed circuit schematics) and the STUDENT'S HANDWRITTEN PEN/PENCIL MARKS.
   - ONLY record what the student personally wrote, calculated, or drew with their pen or pencil.
   - Pre-printed graphs or printed diagrams belong to the exam question, NOT the student's work. NEVER describe a pre-printed curve, line, or value as if it was drawn by the student.
2. DO NOT GRADE OR SCORE: Do not judge whether the student's answer is right or wrong. Do not award marks. Simply record what is physically on the page.
3. TRANSCRIBE HANDWRITING: Transcribe handwritten words and sentences as written.
4. CAPTURE MATHEMATICAL WORKING & CALCULATIONS:
   - Note formulas (e.g. "Q = mcΔT", "V = IR", "F = ma").
   - Note substitution numbers and calculations (e.g. "400 / 20 = 20 m s-2", "0.5 * 4200 * 20 = 42000 J").
   - Note units written (e.g. "m/s", "N", "Ω", "J", "°C").
5. CAPTURE DIAGRAMS, DRAWINGS & GRAPHICAL WORK (CRITICAL):
   - Describe every line, arrow, or symbol drawn by the student with their pen/pencil.
   - For light/optics: direction of rays, arrows on rays, angles, normal lines, focal points, virtual extensions.
   - For mechanics/forces: direction of force vectors, labels (e.g. "downward arrow from center labelled W"), relative arrow lengths.
   - For electricity: circuit symbols, series/parallel connections, meter placements (ammeter/voltmeter).
   - For graphs: plotted coordinates, curves of best fit, intercepts, tangent lines drawn by the candidate.
6. SELECTION & WORD LIST QUESTIONS:
   - Identify which specific words are actively underlined, circled, or ticked by the student's pen.
7. TARGET RELEVANCE:
   - State whether the work on this page genuinely attempts Question ${qNum} of this target paper, or if it is from an unrelated question/paper.

OUTPUT STRICTLY VALID JSON MATCHING THIS SCHEMA:
{
  "is_attempting_target_question": boolean,
  "relevance_reason": "string (confirming relevance to Question ${qNum} or explaining mismatch)",
  "subparts": [
    {
      "part_label": "(a)",
      "written_text": "verbatim handwritten text written by student",
      "math_steps": ["formula: ...", "substitution: ...", "final value: ..."],
      "diagram_features": ["arrow drawn downwards...", "normal line dotted...", "curve passes through origin..."],
      "selections": ["circled word...", "underlined term..."],
      "page_index": 0
    }
  ],
  "unassigned_margin_notes": ["any scratch work or annotations in the margins"]
}`;
}
