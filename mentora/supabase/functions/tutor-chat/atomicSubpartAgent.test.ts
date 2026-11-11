import {
  extractQuestionSubparts,
  runWithConcurrencyLimit,
  synthesizeBookletAnnotations,
  evaluateSubpartAtomically,
  getOrExtractPageTranscript,
  safeParseJsonObject
} from './atomicSubpartAgent.ts';

let passed = 0, failed = 0;
function assert(cond: boolean, name: string, detail?: string) {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.error(`  ✗ ${name}${detail ? ' — ' + detail : ''}`); }
}

console.log('\n[1] Subpart extraction from official mark scheme:');
const Q4_SCHEME = `
(4(a)(i)) [ANSWER — 1 mark] 1.65 < h ≤ 1.8
(4(a)(ii)) [ANSWER — 4 marks] 1.63875
(4(a)(ii)) [M1] for midpoints soi
(4(a)(ii)) [M1] for use of ∑ fh with h in correct interval including both boundaries
(4(a)(ii)) [M1dep] on 2nd M1 for ∑ fh ÷ 80
(4(b)(i)) [ANSWER — 1 mark] 1/40 oe
(4(b)(ii)) [ANSWER — 3 marks] 63/395 oe
(4(b)(ii)) [M2] for 56 × 9 / 80 × 79 oe
(4(b)(ii)) [B1] for 56/80 or 9/79 or 9/80 or 56/79 oe seen
(4(b)(ii)) [SC2] If 0 or B1 scored, instead award SC2 for answer 117/632 oe
(4(b)(ii)) [SC1] or SC1 for answer 63/400 oe
(4(c)(i)) [ANSWER — 2 marks] 15, 39, 71, 80
(4(c)(i)) [B1] for 3 correct
(4(c)(i)) [M1] for 1 error in addition with other values then consistent
(4(c)(ii)) [ANSWER — 3 marks] Correct curve
(4(c)(ii)) [B1] for correct horizontal placement for 5 plots
(4(c)(ii)) [B1FT] for correct vertical placement for 5 plots
(4(c)(ii)) [B1FT] dep on at least B1 for reasonable increasing curve or polygon through their 5 points
(4(c)(ii)) [SC1 FT] If 0 scored for 4 out of 5 points correctly plotted
(4(d)(i)) [ANSWER — 2 marks] Strict FT their UQ – their LQ
(4(d)(i)) [B1dep] for their UQ or their LQ seen
(4(d)(i)) [CONDITION] Dep on increasing curve/polygon for 2 marks or B1
(4(d)(ii)) [ANSWER — 2 marks] Strict FT their reading at 48
(4(d)(ii)) [B1] for 48 written
`;

const subparts = extractQuestionSubparts("4", 18, Q4_SCHEME);
assert(subparts.length === 8, `Q4 has 8 distinct subparts (got ${subparts.length})`);
assert(subparts.map(s => s.canonical_label).join(',') === 'a.i,a.ii,b.i,b.ii,c.i,c.ii,d.i,d.ii', 'canonical labels match expected sequence');

const partB2 = subparts.find(s => s.canonical_label === 'b.ii');
assert(partB2 !== undefined, 'Part 4(b)(ii) found');
assert(partB2?.marks === 3, `Part 4(b)(ii) has 3 marks (got ${partB2?.marks})`);

const partA1 = subparts.find(s => s.canonical_label === 'a.i');
assert(partA1?.marks === 1, `Part 4(a)(i) has 1 mark (got ${partA1?.marks})`);

const partA2 = subparts.find(s => s.canonical_label === 'a.ii');
assert(partA2?.marks === 4, `Part 4(a)(ii) has 4 marks (got ${partA2?.marks})`);

console.log('\n[2] Question 8 hierarchical deduplication verification:');
const Q8_SCHEME = `
(8(a)(i)) [M1] Correct expansion of a pair of brackets
(8(a)(i)) [A1] leading to and stating y = x³ - 5x² + 2x + 8
(8(a)(ii)) [B1] for positive cubic
(8(a)(ii)) [B2] for three intercepts
(8(a)(ii)) [B1] for single intercept on y-axis
(8(b)) [B2] for derivative = 3x² - 10x + 2
(8(b)) [M1] dep on B1 for derivative = 10
(8(b)) [B1] for x = 4 and x = -2/3
(8(b)) [B1] for (4, 0) and (-2/3, 112/27)
(8(b)) [B2] for y = 10x - 40 and y = 10x + 292/27
`;

const Q8_DB_PARTS = [
  { id: "p-b", parent_part_id: null, part_label: "b", marks: 7 },
  { id: "p-a", parent_part_id: null, part_label: "a", marks: 2 },
  { id: "p-i", parent_part_id: "p-a", part_label: "i", marks: 2 },
  { id: "p-ii", parent_part_id: "p-a", part_label: "ii", marks: 4 }
];

const q8Subparts = extractQuestionSubparts("8", 13, Q8_SCHEME, Q8_DB_PARTS);
assert(q8Subparts.length === 3, `Q8 has exactly 3 leaf subparts (got ${q8Subparts.length})`);
assert(q8Subparts.map(s => s.canonical_label).join(',') === 'a.i,a.ii,b', `Q8 canonical labels are a.i, a.ii, b (got ${q8Subparts.map(s => s.canonical_label).join(',')})`);

const q8_a1 = q8Subparts.find(s => s.canonical_label === 'a.i');
assert(q8_a1?.marks === 2, `Q8(a)(i) has 2 marks (got ${q8_a1?.marks})`);

const q8_a2 = q8Subparts.find(s => s.canonical_label === 'a.ii');
assert(q8_a2?.marks === 4, `Q8(a)(ii) has 4 marks (got ${q8_a2?.marks})`);

const q8_b = q8Subparts.find(s => s.canonical_label === 'b');
assert(q8_b?.marks === 7, `Q8(b) has 7 marks (got ${q8_b?.marks})`);

const totalQ8Marks = q8Subparts.reduce((sum, s) => sum + s.marks, 0);
assert(totalQ8Marks === 13, `Q8 sum of subpart marks is 13 (got ${totalQ8Marks})`);

async function main() {
  console.log('\n[3] Concurrency limiter verification:');
  let peakActive = 0;
  let currentActive = 0;
  const tasks = Array.from({ length: 15 }, (_, i) => i);

  await runWithConcurrencyLimit(tasks, 4, async (item) => {
    currentActive++;
    if (currentActive > peakActive) peakActive = currentActive;
    await new Promise(r => setTimeout(r, 20));
    currentActive--;
    return item * 2;
  });

  assert(peakActive <= 4, `concurrency stayed <= 4 (peak was ${peakActive})`);

  console.log('\n[4] synthesizeBookletAnnotations deduplication & multi-question preservation:');
  const dupAndMultiSubparts: any[] = [
    {
      question_number: '6',
      part_label: '6(b)',
      canonical_label: '6(b)',
      score: 2,
      max_score: 6,
      line_y: 450,
      page_index: 0,
      marks_awarded: ['Point 1', 'Point 2'],
      deductions: [],
      teacher_correction_note: 'Expand further',
      constructive_correction: '',
    },
    {
      question_number: '6',
      part_label: '(b)',
      canonical_label: '(b)',
      score: 2,
      max_score: 6,
      line_y: 465,
      page_index: 0,
      marks_awarded: ['Point 1', 'Point 2'],
      deductions: [],
      teacher_correction_note: 'Expand further',
      constructive_correction: '',
    },
    {
      question_number: '5',
      part_label: '5(b)',
      canonical_label: '5(b)',
      score: 4,
      max_score: 4,
      line_y: 180,
      page_index: 0,
      marks_awarded: ['P1', 'P2', 'P3', 'P4'],
      deductions: [],
      teacher_correction_note: '',
      constructive_correction: '',
    },
    {
      question_number: '7',
      part_label: '7(a)',
      canonical_label: '7(a)',
      score: 0,
      max_score: 4,
      line_y: 700,
      page_index: 0,
      unattempted: true,
      marks_awarded: [],
      deductions: [],
      teacher_correction_note: 'Work is absent from page',
      constructive_correction: '',
    }
  ];

  const synthesized = synthesizeBookletAnnotations(dupAndMultiSubparts, ['page0.jpg'], 6, 10);
  const badges = synthesized.filter(a => a.type === 'mark_badge');
  assert(badges.length === 2, `Expected 2 badges (Q5(b) + deduplicated Q6(b)), got ${badges.length}`);
  assert(
    badges.some(b => String(b.question_number) === '5') && badges.some(b => String(b.question_number) === '6'),
    'Both distinct questions (Q5 and Q6) keep their separate subpart badges'
  );
  const q5Ticks = synthesized.filter(a => a.type === 'inline_tick' && String(a.question_number) === '5');
  const uniqueTickXs = new Set(q5Ticks.map(t => t.box_2d?.[1]));
  assert(q5Ticks.length === 4 && uniqueTickXs.size === 4, `Q5(b) 4 inline ticks have distinct x positions (got ${uniqueTickXs.size})`);

  console.log('\n[5] Transcript caching & 2-of-3 consensus verification:');
  let transcriptCalls = 0;
  const mockTranscriptChat = async () => {
    transcriptCalls++;
    return {
      ok: true,
      data: { choices: [{ message: { content: JSON.stringify({ transcript: 'Candidate wrote: The league failed because it lacked an army and could not enforce sanctions.' }) } }] }
    };
  };
  const t1 = await getOrExtractPageTranscript('data:image/jpeg;base64,UNIQUE_TEST_IMAGE_XYZ', mockTranscriptChat);
  const t2 = await getOrExtractPageTranscript('data:image/jpeg;base64,UNIQUE_TEST_IMAGE_XYZ', mockTranscriptChat);
  assert(transcriptCalls === 1 && t1 === t2 && t1.includes('lacked an army'), `Same image triggers only 1 transcript extraction call (got ${transcriptCalls})`);

  const ESSAY_SCHEME = `
(b) [B1] Lack of political will to act.
(b) [B1] Leaders showed weak political will to act.
(b) [B1] Absent major powers reduced reach.
(b) [B1] Slow decision making harmed action.
`;
  let evalCallCount = 0;
  const mockConsensusChat = async (_msgs: any[], _temp?: number, seed?: number) => {
    evalCallCount++;
    // Pass 1 (seed 42): criteria 0, 1 true (1 is duplicate quote of 0!); criterion 2 true
    // Pass 2 (seed 101): criteria 0, 1 true; criterion 2 FALSE (disagreement triggers Pass 3)
    // Pass 3 (seed 202): criterion 2 FALSE (2-of-3 majority => FALSE)
    const c2 = seed === 42;
    const verdicts = [
      { criterion_index: 0, satisfied: true, evidence: 'Governments showed no political will to intervene.' },
      { criterion_index: 1, satisfied: true, evidence: 'Governments showed no political will to intervene.' },
      { criterion_index: 2, satisfied: c2, evidence: c2 ? 'Major powers were absent.' : '' },
      { criterion_index: 3, satisfied: false, evidence: '' }
    ];
    return {
      ok: true,
      data: {
        choices: [{
          message: {
            content: JSON.stringify({
              student_answer_detected: 'Lack of political will',
              transcription_notes: 'Clear essay paragraph',
              answer_line_y: 420,
              verdicts,
              teacher_correction_note: 'Expand with specific economic and structural factors.',
              constructive_correction: 'Give distinct points.'
            })
          }
        }]
      }
    };
  };

  const evalOut = await evaluateSubpartAtomically(
    {
      questionNumber: '6',
      partLabel: '(b)',
      canonicalLabel: 'b',
      marksAvailable: 6,
      officialMarkScheme: ESSAY_SCHEME,
      canonicalPageIndex: 0,
      pageImageUrl: 'data:image/jpeg;base64,TEST_EVAL_IMAGE',
      pageTranscript: 'Governments showed no political will to intervene in crises because leaders prioritised domestic issues over collective action.'
    },
    mockConsensusChat
  );
  assert(evalCallCount === 3, `Disagreement between Pass 1 & 2 invoked 3rd tie-breaker (got ${evalCallCount} calls)`);
  assert(evalOut.score === 1, `2-of-3 rejected borderline c2 AND deduplicated duplicate quote on c1 -> score 1 (got ${evalOut.score})`);
  assert(evalOut.marking_points.filter(p => p.is_earned).length === 1, `Only 1 marking_point earned matches final score 1`);

  console.log('\n[6] Safe JSON repair, transient empty-response retry & nested DB subpart merge:');
  const latexRaw = 'Here is the JSON:\n```json\n{"transcript": "Cost = \\$6.30 \\div 10, angle \\approx 36.9°",}\n```';
  const repairedJson = safeParseJsonObject(latexRaw);
  assert(repairedJson !== null && typeof repairedJson.transcript === 'string' && repairedJson.transcript.includes('36.9'), 'safeParseJsonObject recovers fenced JSON with unescaped LaTeX and trailing comma');

  // Transient empty content on attempt 0 recovers on retry attempt 1 + runs consensus Pass 2 on multi-mark Maths subpart
  let retryCalls = 0;
  const mockRetryMathChat = async (_msgs: any[], _temp?: number, seed?: number) => {
    retryCalls++;
    if (retryCalls === 1) {
      return { ok: true, data: { choices: [{ message: { content: '' } }] } };
    }
    return {
      ok: true,
      data: {
        choices: [{
          message: {
            content: JSON.stringify({
              student_answer_detected: '$5.67',
              transcription_notes: '9 × $6.30 = $56.70, $56.70 ÷ 10 = $5.67',
              answer_line_y: 130,
              verdicts: [
                { criterion_index: 0, satisfied: true, evidence: '9 × $6.30 ÷ 10' },
                { criterion_index: 1, satisfied: true, evidence: '$5.67' }
              ],
              teacher_correction_note: '',
              constructive_correction: '',
              seed_seen: seed
            })
          }
        }]
      }
    };
  };
  const mathRetryOut = await evaluateSubpartAtomically(
    {
      questionNumber: '1',
      partLabel: '(a)(ii)',
      canonicalLabel: 'a.ii',
      marksAvailable: 2,
      officialMarkScheme: '(a)(ii) [M1] [9 × 6.3 ÷ 10] oe\n(a)(ii) [A1] 5.67',
      canonicalPageIndex: 0,
      pageImageUrl: 'data:image/jpeg;base64,MATH_RETRY_IMG',
      pageTranscript: '9 × $6.30 = $56.70\n$56.70 ÷ 10 = $5.67'
    },
    mockRetryMathChat
  );
  assert(mathRetryOut.score === 2 && retryCalls === 3, `Recovered from empty Pass 1 and ran Pass 2 Maths consensus -> 2/2 in 3 calls (score=${mathRetryOut.score}, calls=${retryCalls})`);

  const NESTED_SCHEME = `
(a)(vi)(a) [B1] 375
(a)(vi)(a) [B1] 600
(a)(vi)(b) [B1] Bar chart drawn with linear scale
`;
  const NESTED_DB_PARTS: any[] = [
    { id: 'p-a', parent_part_id: null, part_label: 'a', marks: 10 },
    { id: 'p-vi', parent_part_id: 'p-a', part_label: 'vi', marks: null },
    { id: 'p-via', parent_part_id: 'p-vi', part_label: 'a', marks: 2 },
    { id: 'p-vib', parent_part_id: 'p-vi', part_label: 'b', marks: 3 },
    { id: 'p-detached-via', parent_part_id: null, part_label: 'vi.a', marks: 2 },
    { id: 'p-detached-vib', parent_part_id: null, part_label: 'vi.b', marks: 3 }
  ];
  const nestedSubparts = extractQuestionSubparts('2', 16, NESTED_SCHEME, NESTED_DB_PARTS);
  assert(
    nestedSubparts.length === 2 &&
    nestedSubparts.map(s => s.canonical_label).join(',') === 'a.vi.a,a.vi.b' &&
    nestedSubparts[1].marks === 3,
    `Multi-level nested & detached DB subparts deduplicated cleanly (got ${nestedSubparts.map(s => `${s.canonical_label}:${s.marks}`).join(',')})`
  );

  // [7] Anti-hallucination guard strips copied scheme text that is absent from pageTranscript
  const fabricatedChat = async () => ({
    ok: true,
    data: {
      choices: [{
        message: {
          content: JSON.stringify({
            student_answer_detected: '$294.60',
            transcription_notes: 'Hourly calculation',
            answer_line_y: 800,
            verdicts: [
              { criterion_index: 0, satisfied: true, evidence: '30 ÷ 100 × 11.5' },
              { criterion_index: 1, satisfied: true, evidence: '$59.80' }
            ],
            teacher_correction_note: '',
            constructive_correction: ''
          })
        }
      }]
    }
  });
  const guardOut = await evaluateSubpartAtomically(
    {
      questionNumber: '1',
      partLabel: '(e)',
      canonicalLabel: 'e',
      marksAvailable: 3,
      officialMarkScheme: '(e) [M1] 30 ÷ 100 × 11.5 oe\n(e) [B2] 59.8 seen',
      canonicalPageIndex: 0,
      pageImageUrl: 'data:image/jpeg;base64,GUARD_IMG',
      pageTranscript: 'Weekly pay: Wednesday 18:00 - 22:00 = 4 × $14.95 = $59.80, Friday 5.5 × $11.50 = $63.25, Total = $294.60.'
    },
    fabricatedChat
  );
  assert(guardOut.score === 2 && guardOut.verdicts?.[0]?.satisfied === false, `Stripped ungrounded scheme quote (30 ÷ 100 × 11.5) while keeping grounded $59.80 -> score 2 (got ${guardOut.score})`);

  console.log(`\n══════════════════════════════════════`);
  console.log(`RESULTS: ${passed} passed, ${failed} failed`);
  console.log(`══════════════════════════════════════\n`);
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
