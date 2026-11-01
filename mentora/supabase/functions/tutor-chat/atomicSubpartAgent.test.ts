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

async function main() {
  console.log('\n[2] Concurrency limiter verification:');
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
