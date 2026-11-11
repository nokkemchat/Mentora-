/**
 * RUBRIC ENGINE TESTS — deterministic verification of the marking core.
 * Run: npx tsx supabase/functions/tutor-chat/rubricEngine.test.ts
 *
 * Scenarios (per spec):
 * 1. Overlapping points       — same idea in two rows cannot double-count
 * 2. Equivalent wording       — paraphrase satisfies a criterion
 * 3. Missing details           — absent optional points never deduct
 * 4. Full marks w/o all rows  — 6 distinct ideas from a 10-row menu → 6/6
 * 5. The Austria 1866 case    — the reference 6/6 vs 5/6 scenario
 * 6. Cap enforcement          — more satisfied rows than marks available
 * 7. Level tables             — level descriptor marking
 * 8. Determinism             — same inputs → identical outputs (repeated runs)
 */

import {
  parseRubric,
  computeSubpartScore,
  canonicalLabel,
  ParsedRubric,
  isAlgebraicMatch
} from './rubricEngine.ts';

let passed = 0, failed = 0;
function assert(cond: boolean, name: string, detail?: string) {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.error(`  ✗ ${name}${detail ? ' — ' + detail : ''}`); }
}

// ── THE REAL AUSTRIA-1866 RUBRIC (subpart b — the reference case) ──────────
const AUSTRIA_RUBRIC = `
(b) [C1] It was important because it meant that Prussia was now the major power in Germany and was the only possible leader of a future unification.
(b) [C1] Prussia grew by annexing some states that had fought against it and so became more powerful.
(b) [C1] The King of Prussia became President of the North German Confederation.
(b) [C1] Austria was effectively excluded from German affairs, leaving Prussia dominating Germany and the North German Confederation.
(b) [B1] States like Hanover, Frankfurt and Nassau were annexed by Prussia.
(b) [B1] As a result, north Germany was completely remodelled.
(b) [B1] All the states in northern Germany became part of the North German Confederacy.
(b) [B1] It was a step towards the unification of Germany.
(b) [B1] Prussia now dominated Germany.
(b) [B1] Austria was excluded from German affairs.
`;

// ── 1+2+5. Parse the real rubric: structure, overlaps, equivalence ─────────
console.log('\n[1] Rubric parsing — the Austria 1866 case:');
const rub = parseRubric('b', AUSTRIA_RUBRIC);
assert(rub.criteria.length === 10, `10 criteria parsed (got ${rub.criteria.length})`);
assert(rub.schemeType === 'menu', `scheme type is menu (got ${rub.schemeType})`);
assert(rub.criteria.every(c => c.value === 1), 'all C1/B1 rows worth 1 mark');

console.log('\n[2] Overlap detection (same idea must not double-count):');
const groups = new Map<number, number>();
rub.criteria.forEach(c => groups.set(c.overlapGroup ?? c.index, (groups.get(c.overlapGroup ?? c.index) || 0) + 1));
const multiMemberGroups = [...groups.values()].filter(n => n > 1);
assert(multiMemberGroups.length >= 2, `overlap groups detected (got ${multiMemberGroups.length}, expected ≥2)`);
assert(rub.overlapGroups < rub.criteria.length, `distinct idea groups (${rub.overlapGroups}) < rows (${rub.criteria.length})`);
// Verify the known overlapping pair is grouped: "major power in Germany" ↔ "Prussia now dominated Germany"
const majorPowerIdx = rub.criteria.findIndex(c => c.text.includes('major power in Germany'));
const dominatedIdx = rub.criteria.findIndex(c => c.text.includes('now dominated Germany'));
if (majorPowerIdx >= 0 && dominatedIdx >= 0) {
  assert(
    rub.criteria[majorPowerIdx].overlapGroup === rub.criteria[dominatedIdx].overlapGroup,
    `"major power" and "dominated Germany" rows share an overlap group`
  );
}
// And the excluded-Austria pair
const exc1 = rub.criteria.findIndex(c => c.text.startsWith('Austria was effectively excluded'));
const exc2 = rub.criteria.findIndex(c => c.text === 'Austria was excluded from German affairs.');
if (exc1 >= 0 && exc2 >= 0) {
  assert(
    rub.criteria[exc1].overlapGroup === rub.criteria[exc2].overlapGroup,
    `both "Austria excluded" rows share an overlap group`
  );
}

// ── 3+4+5. The reference scenario: student wrote 6 distinct ideas, NOT the President row ──
console.log('\n[3] The 6/6 vs 5/6 reference case (no President row mentioned):');
// Student answer: strong — covers annexations, exclusion of Austria, Prussian dominance,
// remodelling, step to unification, Confederation membership. Does NOT mention the King
// becoming President.
const studentIdeaRows = [0, 1, 3, 5, 6, 7, 8, 9]; // indices satisfied by the answer
const verdicts = rub.criteria.map(c => ({ criterionIndex: c.index, satisfied: studentIdeaRows.includes(c.index) }));
const marksAvailable = 6;
const result = computeSubpartScore(rub, verdicts, marksAvailable);
console.log(`  → engine score: ${result.score}/6 (overlap-capped: ${result.cappedByOverlap})`);
assert(result.score === 6, `6 distinct ideas → 6/6 (got ${result.score}) — NOT 5/6`);
assert(result.score <= marksAvailable, 'score capped at marks available');

// The exact reason the old runs failed: satisfying MORE rows than marks (8 satisfied rows,
// overlapping pairs collapse) must still give exactly 6 — deterministic, every time.
console.log('\n[4] Overlap collapse determinism (8 satisfied rows incl. both members of 2 overlap pairs):');
for (let run = 1; run <= 5; run++) {
  const r = computeSubpartScore(rub, verdicts, marksAvailable);
  assert(r.score === 6, `run ${run}: identical answer → 6/6 (got ${r.score})`);
}

// ── 6. Double-counting prevention ─────────────────────────────────────────
console.log('\n[5] Double-counting prevention:');
// Student ONE idea only: "Austria was excluded from German affairs" — but BOTH
// excluded-rows are judged satisfied (the grader matched both phrasings).
const oneIdeaVerdicts = rub.criteria.map(c => ({
  criterionIndex: c.index,
  satisfied: c.text.includes('excluded from German affairs')
}));
const oneIdeaResult = computeSubpartScore(rub, oneIdeaVerdicts, marksAvailable);
assert(oneIdeaResult.score === 1, `one idea across 2 overlapping rows → 1 mark, not 2 (got ${oneIdeaResult.score})`);

// ── 7. Missing optional points never deduct ───────────────────────────────
console.log('\n[6] Missing optional points never deduct:');
// 3 satisfied distinct ideas out of a 6-mark menu → 3, not negative-adjusted
const threeIdeas = [0, 2, 5].map(i => ({ criterionIndex: rub.criteria[i].index, satisfied: true }))
  .concat(rub.criteria.filter((c, i) => ![0, 2, 5].includes(i)).map(c => ({ criterionIndex: c.index, satisfied: false })));
const threeResult = computeSubpartScore(rub, threeIdeas, 6);
assert(threeResult.score === 3, `3 satisfied → 3/6 (got ${threeResult.score}) — no deduction logic`);

// ── 8. Cap enforcement ────────────────────────────────────────────────────
console.log('\n[7] Cap enforcement:');
const allSatisfied = rub.criteria.map(c => ({ criterionIndex: c.index, satisfied: true }));
const allResult = computeSubpartScore(rub, allSatisfied, 6);
assert(allResult.score === 6, `all 10 rows satisfied (5 idea groups) → capped at 6 (got ${allResult.score})`);

// A single-row high-value criterion: A3
console.log('\n[8] Value codes (A3 etc.):');
const singleRowRubric = parseRubric('a', '(a) [A3] 0.078 J\n(a) [C1] Shows correct method.');
const singleVerdicts = singleRowRubric.criteria.map(c => ({ criterionIndex: c.index, satisfied: true }));
const singleResult = computeSubpartScore(singleRowRubric, singleVerdicts, 4);
assert(singleResult.score === 4, `A3 + C1 satisfied → 4/4 (got ${singleResult.score})`);

// ── 9. Level tables ───────────────────────────────────────────────────────
console.log('\n[9] Level-table marking:');
const levelRubric = parseRubric('c', `
(c) [LEVEL] Level 5: Explains both sides and supports a valid judgement — 10
(c) [LEVEL] Level 4: Explains both sides — 7–9
(c) [LEVEL] Level 3: Explains one side — 4–6
(c) [LEVEL] Level 2: Identifies valid points — 2–3
(c) [LEVEL] Level 1: Writes about the topic — 1
(c) [LEVEL] Level 0: No creditable response — 0
`);
const levelVerdicts = levelRubric.criteria.map(c => ({ criterionIndex: c.index, satisfied: c.text.includes('Level 4') || c.text.includes('Level 3') }));
const levelResult = computeSubpartScore(levelRubric, levelVerdicts, 10);
assert(levelRubric.schemeType === 'levels', `levels scheme detected (got ${levelRubric.schemeType})`);
assert(levelResult.score === 9, `Level 4 satisfied → top of its range 9 (got ${levelResult.score})`);

// ── 10. Label canonicalisation ────────────────────────────────────────────
console.log('\n[10] Label canonicalisation:');
assert(canonicalLabel('(b)(i)') === 'b.i', `'(b)(i)' → 'b.i' (got '${canonicalLabel('(b)(i)')}')`);
assert(canonicalLabel('a') === 'a', `bare 'a' stays 'a'`);
const nestedRubric = parseRubric('a', '(a)(i) [B1] First.\n(a)(ii) [B1] Second.\n(b) [B1] Other part.');
assert(nestedRubric.criteria.length === 2, `nested (a)(i)/(a)(ii) rows belong to 'a' (got ${nestedRubric.criteria.length})`);

console.log(`\n══════════════════════════════════════`);
console.log(`RESULTS: ${passed} passed, ${failed} failed`);
console.log(`══════════════════════════════════════`);

// ════════════════════════════════════════════════════════════════════════
// ECONOMICS DIALECT (Edexcel/AO style): numeric codes, GUIDANCE rows,
// MARK ALLOCATION budgets, glued labels like '(3(a))'.
// Rows below are the REAL stored rubric format from the Economics P2 paper.
// ════════════════════════════════════════════════════════════════════════
console.log('\n\n[11] ECONOMICS DIALECT — glued labels + numeric codes:');
const ECON_Q1 = `
(1(a)(i)) [1] The trade deficit has fallen / declined / decreased / reduced
(1(a)(ii)) [1] (Deficit has fallen) by 52%
(1(a)(ii)) [GUIDANCE] The answer MUST refer to the trade deficit and the fact that it has fallen for the first mark i.e., not simply improved.
(1(a)(ii)) [GUIDANCE] Accept answers in the range 51% to 53% for part (ii).
(1(b)) [1] This means that Sri Lanka can grow and export tea at a lower opportunity cost
(1(b)) [1] than another country
(1(b)) [GUIDANCE] Both parts must be clearly linked.
`;
// Parsing subpart a.i of Q1
const econA = parseRubric('a.i', ECON_Q1);
assert(econA.criteria.length === 1, `subpart (a)(i): 1 criterion parsed (got ${econA.criteria.length})`);
assert(econA.criteria[0]?.value === 1, `numeric code [1] → value 1 (got ${econA.criteria[0]?.value})`);
const econAii = parseRubric('a.ii', ECON_Q1);
assert(econAii.criteria.length === 1, `subpart (a)(ii): 1 criterion parsed (got ${econAii.criteria.length})`);
assert(econAii.criteria[0]?.guidance?.includes('MUST refer to the trade deficit') === true,
  `GUIDANCE row attached to its criterion (got: ${(econAii.criteria[0]?.guidance || '').slice(0, 60)})`);
assert(econAii.criteria[0]?.guidance?.includes('51% to 53%') === true, `accept-range guidance attached`);
const econB = parseRubric('b', ECON_Q1);
assert(econB.criteria.length === 2, `subpart (b): 2 criteria parsed (got ${econB.criteria.length})`);
assert((econB.criteria[0]?.guidance || '').includes('Both parts must be clearly linked'),
  `trailing guidance attached to first (b) criterion`);

console.log('\n[12] ECONOMICS DIALECT — AO budgets + MARK ALLOCATION:');
const ECON_Q3 = `
(3(a)) [MARKING GUIDANCE] Follow the point-based marking guidance at the top of this mark scheme and award:
(3(a)) [MARK ALLOCATION] up to 3 marks for AO1 Knowledge and understanding up to 3 marks for AO2 Analysis up to 2 marks for AO3 Evaluation.
(3(a)) [AO1] For an accurate formula of YED (1).
(3(a)) [AO1] For clear and accurate knowledge and explanation of what is meant by YED (1) including the difference between elastic and inelastic YED (1).
(3(a)) [AO2] For a clear understanding and explanation.
`;
const econQ3 = parseRubric('a', ECON_Q3);
assert(econQ3.criteria.length === 3, `AO criteria parsed: 3 (got ${econQ3.criteria.length})`);
assert(econQ3.criteria.every(c => c.value === 1), `AO rows worth 1 each`);
const allocGuidance = econQ3.criteria.map(c => c.guidance || '').join(' ');
assert(allocGuidance.includes('up to 3 marks for AO1'), `MARK ALLOCATION budget captured in guidance`);
assert(allocGuidance.includes('up to 2 marks for AO3'), `AO3 budget captured`);

// Determinism on the economics dialect: same parse → same structure
const econAgain = parseRubric('a', ECON_Q3);
assert(JSON.stringify(econAgain.criteria.map(c => c.overlapGroup)) === JSON.stringify(econQ3.criteria.map(c => c.overlapGroup)),
  `repeated parse → identical overlap grouping`);

console.log('\n[13] ECONOMICS DIALECT B — textual AO codes + glued "2a" labels:');
const ECON_Q2 = `
(2a) [AO1 — max 3 marks] For the use of accurate examples of BOTH merit goods and public goods (1).
(2a) [AO1 — max 3 marks] For clearly explaining the characteristics of public goods i.e., non-rivalry and non-excludable (1).
(2a) [AO2 — max 3 marks] A market economy is less likely to produce enough of both goods due to the lack of a profit motive unless heavily subsidised.
(2a) [AO2 — note] Analysis should consider at least 2 markets. If only 1 market is analysed, then 2 marks maximum for analysis and 0 for evaluation.
`;
const econQ2 = parseRubric('a', ECON_Q2);
assert(econQ2.criteria.length === 3, `subpart (2a): 3 criteria parsed (got ${econQ2.criteria.length}) — note row excluded`);
assert(econQ2.criteria.every((c: any) => c.code === 'AO1' || c.code === 'AO2'), `textual codes reduced to base AO codes`);
assert(econQ2.criteria[0]?.guidance?.includes('up to 3 marks') === true, `per-AO cap captured in guidance`);
assert(econQ2.criteria.some((c: any) => (c.guidance || '').includes('at least 2 markets')), `note-row guidance stamped onto criteria`);

console.log('\n[14] CAMBRIDGE MATHEMATICS — multi-step method/accuracy marks must not merge:');
const MATH_Q2 = `
(d) [M1] x + 2x − 5 + x + 20 + 3x − 40 = 360. Accept equivalent equation e.g. 7x − 25 = 360
(d) [M1] 7x = 360 + 5 − 20 + 40 or better. FT their equation, accept e.g. 7x = 385
(d) [B1] x = 55
(d) [B1DEP] 55 and 125 or 105 and 75. Dep on M1M1B1. Accept 55 + 3 × 55 − 40 = 180 or 2 × 55 − 5 + 55 + 20 = 180
(d) [SC1] If B0 scored, for 55, 75, 105 and 125
(d) [A1] Opposite angles sum to 180 oe [so PQRS is a cyclic quadrilateral]. Dep on M1M1B1B1
`;
const mathQ2Rub = parseRubric('d', MATH_Q2);
assert(mathQ2Rub.criteria.length === 6, `6 criteria parsed (got ${mathQ2Rub.criteria.length})`);
// Verify the two M1 rows do NOT share an overlap group
const m1_0 = mathQ2Rub.criteria[0];
const m1_1 = mathQ2Rub.criteria[1];
assert(m1_0.overlapGroup !== m1_1.overlapGroup, `two M1 calculation steps have distinct overlap groups (got ${m1_0.overlapGroup} vs ${m1_1.overlapGroup})`);
assert(mathQ2Rub.criteria[4].isFallback === true, `SC1 row identified as fallback`);

// Evaluate student who earned M1, M1, B1, B1DEP, A1 (all except SC1 fallback)
const q2Verdicts = mathQ2Rub.criteria.map((c, i) => ({ criterionIndex: c.index, satisfied: i !== 4 }));
const q2Score = computeSubpartScore(mathQ2Rub, q2Verdicts, 5);
assert(q2Score.score === 5, `student scores 5/5 full marks (got ${q2Score.score}/5)`);
assert(q2Score.waivedFallbacks.includes(4), `SC1 fallback waived when full marks earned`);

console.log('\n[15] CAMBRIDGE MATHEMATICS — direct answer marks [ANSWER — 2 MARKS] & text marks:');
const MATH_Q6 = `
(c)(i) [ANSWER — 2 MARKS] 15, 39, 71, 80
(c)(i) [B1] for 3 correct
`;
const mathQ6Rub = parseRubric('c.i', MATH_Q6);
assert(mathQ6Rub.criteria.length === 2, `2 criteria parsed (got ${mathQ6Rub.criteria.length})`);
assert(mathQ6Rub.criteria[0].value === 2, `[ANSWER — 2 MARKS] parsed as value 2 (got ${mathQ6Rub.criteria[0].value})`);
assert(mathQ6Rub.criteria[1].isFallback === true, `[B1] for 3 correct identified as fallback`);

// Student got all 4 correct (criterion 0 satisfied, fallback criterion 1 not satisfied)
const q6Verdicts = [
  { criterionIndex: mathQ6Rub.criteria[0].index, satisfied: true },
  { criterionIndex: mathQ6Rub.criteria[1].index, satisfied: false }
];
const q6Score = computeSubpartScore(mathQ6Rub, q6Verdicts, 2);
assert(q6Score.score === 2, `student scores 2/2 full marks (got ${q6Score.score}/2)`);
assert(q6Score.waivedFallbacks.includes(mathQ6Rub.criteria[1].index), `fallback [B1 for 3 correct] waived`);

console.log('\n[16] DIRECT TEXT-DECLARED MARKS — [ANSWER] 150 — 3 marks:');
const MATH_Q1 = `
(b) [ANSWER] 150 — 3 marks
(b) [M1] for k ÷ (3 + 4 + 5) [× p ] where p = 1, 3, 4 or 5 or 5/12 oe
`;
const mathQ1Rub = parseRubric('b', MATH_Q1);
assert(mathQ1Rub.criteria[0].value === 3, `[ANSWER] 150 — 3 marks parsed as value 3 (got ${mathQ1Rub.criteria[0].value})`);
const q1Verdicts = [
  { criterionIndex: mathQ1Rub.criteria[0].index, satisfied: true },
  { criterionIndex: mathQ1Rub.criteria[1].index, satisfied: true }
];
const q1Score = computeSubpartScore(mathQ1Rub, q1Verdicts, 3);
assert(q1Score.score === 3, `student scores 3/3 full marks (got ${q1Score.score}/3)`);

console.log('\n[17] ALGEBRAIC EQUIVALENCE NORMALIZATION & MATCHING:');
assert(isAlgebraicMatch('(x + 3)/(2y + 5)', '(x + 3)/(2y + 5) final answer') === true, 'matches (x + 3)/(2y + 5) with final answer');
assert(isAlgebraicMatch('(x+3)/(2y+5)', '(x + 3)/(2y + 5) final answer') === true, 'matches stripped spacing (x+3)/(2y+5)');
assert(isAlgebraicMatch('\\frac{x+3}{2y+5}', '(x + 3)/(2y + 5) final answer') === true, 'matches LaTeX fraction \\frac{x+3}{2y+5}');
assert(isAlgebraicMatch('c = 150°', '150 — 3 marks') === true, 'matches assigned angle c = 150° with 150');
assert(isAlgebraicMatch('150', '150 — 3 marks') === true, 'matches 150 with 150 — 3 marks');
assert(isAlgebraicMatch('x = 55°', 'x = 55') === true, 'matches x = 55° with x = 55');
assert(isAlgebraicMatch('15, 39, 71, 80', '15, 39, 71, 80') === true, 'matches cumulative frequencies list');
assert(isAlgebraicMatch('1.629', '1.63875') === false, 'correctly rejects wrong calculation 1.629');
assert(isAlgebraicMatch('1/5, 2/7, 1/3', '1/5, 2/7, 3/9 final answer') === false, 'correctly rejects wrong sequence term');

console.log('\n[18] HUMANITIES REGRESSION SAFETY — qualitative History B1 rows still merge on same idea:');
const HISTORY_PARALLEL = `
(a) [B1] Prussia now dominated Germany.
(a) [B1] Prussia was dominating Germany and the North German states.
(a) [B1] The King of Prussia became President of the North German Confederation.
`;
const histRub = parseRubric('a', HISTORY_PARALLEL);
assert(histRub.criteria.length === 3, `3 criteria parsed for History (got ${histRub.criteria.length})`);
assert(histRub.criteria[0].overlapGroup === histRub.criteria[1].overlapGroup, `qualitative B1 rows on Prussian dominance share an overlap group (got group ${histRub.criteria[0].overlapGroup})`);
assert(histRub.criteria[0].overlapGroup !== histRub.criteria[2].overlapGroup, `distinct historical fact has different overlap group (got group ${histRub.criteria[2].overlapGroup})`);

console.log('\n[19] CAMBRIDGE MATHEMATICS — descending partial tiers (M2 with M1 partial) must merge:');
const MATH_Q3 = `
(a)(ii) [M2] (2x + 21)(x - 5) = 0
(a)(ii) [M1] for (2x + a)(x + b) where ab = -105 or 2b + a = 11
(a)(ii) [B1] 5
`;
const mathQ3Rub = parseRubric('a.ii', MATH_Q3);
assert(mathQ3Rub.criteria.length === 3, `3 criteria parsed (got ${mathQ3Rub.criteria.length})`);
assert(mathQ3Rub.criteria[0].overlapGroup === mathQ3Rub.criteria[1].overlapGroup, `M2 and M1 partial factorisation share an overlap group (got ${mathQ3Rub.criteria[0].overlapGroup} vs ${mathQ3Rub.criteria[1].overlapGroup})`);
assert(mathQ3Rub.criteria[0].overlapGroup !== mathQ3Rub.criteria[2].overlapGroup, `M2 and B1 final answer have distinct overlap groups`);

// Candidate satisfies both M2 and M1 (model checks both) plus B1: score MUST be 3/3, never 4/3
const q3Verdicts = mathQ3Rub.criteria.map((c) => ({ criterionIndex: c.index, satisfied: true }));
const q3Score = computeSubpartScore(mathQ3Rub, q3Verdicts, 3);
assert(q3Score.score === 3, `student scores 3/3 without stacking M2 + M1 (got ${q3Score.score}/3)`);

// Candidate satisfies ONLY M1 partial plus B1: score MUST be 2/3
const q3PartialVerdicts = [
  { criterionIndex: 0, satisfied: false },
  { criterionIndex: 1, satisfied: true },
  { criterionIndex: 2, satisfied: true },
];
const q3PartialScore = computeSubpartScore(mathQ3Rub, q3PartialVerdicts, 3);
assert(q3PartialScore.score === 2, `student scores 2/3 with partial M1 + B1 (got ${q3PartialScore.score}/3)`);

console.log('\n[20] DYNAMIC EVIDENCE DEDUPLICATION — one student claim cannot double-count:');
const GENERIC_ESSAY_SCHEME = `
(b) [B1] Lack of political will of Presidents/Federal Government.
(b) [B1] Reconstruction was weakened by Johnson.
(b) [B1] President Johnson allowed Black Codes to appear.
`;
const essayRub = parseRubric('b', GENERIC_ESSAY_SCHEME);
const sameQuoteVerdicts = [
  { criterionIndex: 0, satisfied: true, evidence: 'The federal government eventually reduced its involvement in the South, so protection became weaker.' },
  { criterionIndex: 1, satisfied: true, evidence: 'The federal government eventually reduced its involvement in the South, so protection became weaker.' },
  { criterionIndex: 2, satisfied: false, evidence: '' }
];
const dedupedRes = computeSubpartScore(essayRub, sameQuoteVerdicts, 6);
assert(dedupedRes.score === 1, `exact same evidence sentence across two B1 points → 1 mark (got ${dedupedRes.score})`);
assert(dedupedRes.duplicateEvidenceIndices.includes(1), `second duplicate-evidence criterion recorded in duplicateEvidenceIndices`);

const distinctQuotesVerdicts = [
  { criterionIndex: 0, satisfied: true, evidence: 'The federal government eventually reduced its involvement in the South.' },
  { criterionIndex: 1, satisfied: true, evidence: 'Johnson vetoed civil rights bills and pardoned former Confederates.' },
  { criterionIndex: 2, satisfied: false, evidence: '' }
];
const distinctRes = computeSubpartScore(essayRub, distinctQuotesVerdicts, 6);
assert(distinctRes.score === 2, `distinct evidence sentences across two B1 points → 2 marks (got ${distinctRes.score})`);

console.log(`\n══════════════════════════════════════`);
console.log(`FINAL: ${passed} passed, ${failed} failed`);
console.log(`══════════════════════════════════════`);
if (failed > 0) { process.exit(1); }




