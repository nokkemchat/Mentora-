import {
  sortBookletPages,
  canonicalSubpartLabel,
  getSubpartKey,
  getSubpartSortWeight,
  PageFingerprint
} from './pageFingerprinter.ts';

let passed = 0, failed = 0;
function assert(cond: boolean, name: string, detail?: string) {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.error(`  ✗ ${name}${detail ? ' — ' + detail : ''}`); }
}

console.log('\n[1] Subpart canonicalisation and sorting weights:');
assert(canonicalSubpartLabel('(a)') === 'a', 'canonical (a) -> a');
assert(canonicalSubpartLabel('(b)(i)') === 'b.i', 'canonical (b)(i) -> b.i');
assert(canonicalSubpartLabel('(b)(ii)') === 'b.ii', 'canonical (b)(ii) -> b.ii');
assert(canonicalSubpartLabel('4(b)(ii)') === 'b.ii', 'canonical 4(b)(ii) -> b.ii');
assert(getSubpartSortWeight('a') < getSubpartSortWeight('b.i'), 'a comes before b.i');
assert(getSubpartSortWeight('b.i') < getSubpartSortWeight('b.ii'), 'b.i comes before b.ii');
assert(getSubpartSortWeight('b.ii') < getSubpartSortWeight('c'), 'b.ii comes before c');

console.log('\n[2] Booklet Sorter: Out-of-order page recovery (Swapped Page 8 & Page 9):');
// Simulated 12-page booklet where index 7 is Q8 and index 8 is Q7 (uploaded swapped!)
const dummyImages = Array.from({ length: 12 }, (_, i) => `https://example.com/page_${i}.jpg`);
const dummyFingerprints: PageFingerprint[] = [
  { raw_page_index: 0, printed_page_number: 1, detected_questions: ['1'], subparts: [{ question_number: '1', part_label: '(a)', answer_line_y: 300, has_student_work: true }], is_continuation: false, summary: 'Q1' },
  { raw_page_index: 1, printed_page_number: 2, detected_questions: ['2'], subparts: [{ question_number: '2', part_label: '(a)', answer_line_y: 300, has_student_work: true }], is_continuation: false, summary: 'Q2' },
  { raw_page_index: 2, printed_page_number: 3, detected_questions: ['3'], subparts: [{ question_number: '3', part_label: '(a)', answer_line_y: 300, has_student_work: true }], is_continuation: false, summary: 'Q3' },
  { raw_page_index: 3, printed_page_number: 4, detected_questions: ['4'], subparts: [{ question_number: '4', part_label: '(a)', answer_line_y: 300, has_student_work: true }], is_continuation: false, summary: 'Q4 part 1' },
  { raw_page_index: 4, printed_page_number: 5, detected_questions: ['4'], subparts: [{ question_number: '4', part_label: '(c)', answer_line_y: 300, has_student_work: true }], is_continuation: false, summary: 'Q4 part 2' },
  { raw_page_index: 5, printed_page_number: 6, detected_questions: ['5'], subparts: [{ question_number: '5', part_label: '(a)', answer_line_y: 300, has_student_work: true }], is_continuation: false, summary: 'Q5' },
  { raw_page_index: 6, printed_page_number: 7, detected_questions: ['6'], subparts: [{ question_number: '6', part_label: '(a)', answer_line_y: 300, has_student_work: true }], is_continuation: false, summary: 'Q6' },
  // Notice: raw_page_index 7 has Question 8!
  { raw_page_index: 7, printed_page_number: 9, detected_questions: ['8'], subparts: [{ question_number: '8', part_label: '(a)(i)', answer_line_y: 400, has_student_work: true }], is_continuation: false, summary: 'Q8' },
  // And raw_page_index 8 has Question 7!
  { raw_page_index: 8, printed_page_number: 8, detected_questions: ['7'], subparts: [{ question_number: '7', part_label: '(a)', answer_line_y: 350, has_student_work: true }], is_continuation: false, summary: 'Q7' },
  { raw_page_index: 9, printed_page_number: 10, detected_questions: ['9'], subparts: [{ question_number: '9', part_label: '(a)', answer_line_y: 300, has_student_work: true }], is_continuation: false, summary: 'Q9' },
  { raw_page_index: 10, printed_page_number: 11, detected_questions: ['9', '10'], subparts: [{ question_number: '10', part_label: '(a)', answer_line_y: 500, has_student_work: true }], is_continuation: false, summary: 'Q10' },
  { raw_page_index: 11, printed_page_number: 12, detected_questions: ['10'], subparts: [{ question_number: '10', part_label: '(b)', answer_line_y: 600, has_student_work: true }], is_continuation: false, summary: 'Q10' },
];

const officialQuestions = Array.from({ length: 10 }, (_, i) => ({ question_number: String(i + 1), marks: 10 }));

const layout = sortBookletPages(dummyImages, dummyFingerprints, officialQuestions);

// In canonical order, raw_page_index 8 (Question 7) MUST COME BEFORE raw_page_index 7 (Question 8)!
const canonicalQ7Index = layout.canonical_order.indexOf(8);
const canonicalQ8Index = layout.canonical_order.indexOf(7);

assert(canonicalQ7Index < canonicalQ8Index, `Question 7 (canonical idx ${canonicalQ7Index}) sorted before Question 8 (canonical idx ${canonicalQ8Index})`);
assert(canonicalQ7Index === 7, `Question 7 placed at index 7 (got ${canonicalQ7Index})`);
assert(canonicalQ8Index === 8, `Question 8 placed at index 8 (got ${canonicalQ8Index})`);

// Multi-page question Q4: page with (a) must come before page with (c)
const q4Part1Canon = layout.canonical_order.indexOf(3);
const q4Part2Canon = layout.canonical_order.indexOf(4);
assert(q4Part1Canon < q4Part2Canon, `Q4(a) (idx ${q4Part1Canon}) sorted before Q4(c) (idx ${q4Part2Canon})`);

// Inverted lookup map
const q7Loc = layout.subpart_locations.get('7:a');
assert(q7Loc !== undefined, 'Subpart location for 7:a found');
assert(q7Loc?.canonical_page_index === 7, `Subpart 7:a mapped to canonical page 7 (got ${q7Loc?.canonical_page_index})`);
assert(q7Loc?.answer_line_y === 350, `Subpart 7:a has answer_line_y 350 (got ${q7Loc?.answer_line_y})`);

console.log(`\n══════════════════════════════════════`);
console.log(`RESULTS: ${passed} passed, ${failed} failed`);
console.log(`══════════════════════════════════════\n`);
if (failed > 0) process.exit(1);
