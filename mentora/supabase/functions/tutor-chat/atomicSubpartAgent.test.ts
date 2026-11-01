import {
  extractQuestionSubparts,
  runWithConcurrencyLimit
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

  console.log(`\n══════════════════════════════════════`);
  console.log(`RESULTS: ${passed} passed, ${failed} failed`);
  console.log(`══════════════════════════════════════\n`);
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
