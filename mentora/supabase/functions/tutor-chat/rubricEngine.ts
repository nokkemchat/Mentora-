/**
 * DETERMINISTIC RUBRIC ENGINE — structural marking-scheme processing in code.
 *
 * Philosophy: the LLM's ONLY job is judging "does the student's answer satisfy
 * this criterion?" Everything else — row parsing, overlap detection, score
 * computation, cap enforcement, best-of selection — is deterministic code that
 * runs identically on every invocation.
 *
 * Responsibilities:
 * 1. RUBRIC INTERPRETATION: parse "(label) [CODE] criteria" rows into structured
 *    criteria with mark values, and detect scheme type (point-based / level-based /
 *    menu-based) from the scheme's own phrasing.
 * 2. OVERLAP DETECTION: group rows that express the same idea (via lexical
 *    similarity) so a single student idea cannot earn marks from two rows —
 *    while distinct facts still earn distinct marks.
 * 3. SCORING: award per satisfied criterion, cap at the part's printed marks,
 *    never compute deductions for "missing" optional rows. Score = count of
 *    satisfied criteria (respecting value + overlap groups), clamped to max.
 */

export interface RubricCriterion {
  index: number;            // original row order
  label: string;           // subpart label, e.g. 'a', 'b', 'b.i'
  code: string;            // mark code, e.g. 'B1', 'C1', 'A1', 'M1', '1', 'AO1'
  value: number;           // marks the row is worth (B1=1, C1=1, A3=3, LEVEL=n/a)
  text: string;            // criterion text
  isLevel: boolean;        // level-table descriptor row
  guidance?: string;       // attached GUIDANCE / MARK ALLOCATION constraints (Economics dialect)
  overlapGroup: number | null; // rows sharing an idea get the same group id
  isFallback?: boolean;    // fallback/alternative row (e.g. SC1, "If B0 scored", "for 3 correct")
}

export interface ParsedRubric {
  subpart: string;                 // canonical subpart label
  criteria: RubricCriterion[];
  schemeType: 'points' | 'levels' | 'menu';
  printedMax: number | null;        // the part's printed marks-available if detectable
  overlapGroups: number;           // count of distinct idea groups
}

/** Canonicalise a subpart label: '(b)(i)' → 'b.i', '3(a)' → 'a', 'a(ii)' → 'a.ii',
 *  '2a' → 'a', '4(a)' → 'a'. Handles Economics-dialect glued labels where the
 *  question number sits inside or directly prefixes the subpart letter. */
export function canonicalLabel(label: string): string {
  let s = String(label || '').toLowerCase().trim();
  // Strip leading "Question 6", "Q6", "Part " prefixes before stripping leading question digits
  s = s.replace(/^(?:question\s*\d*|q\s*(?=\d)|part\s+)\s*/i, '');
  // Strip a LEADING question number: '3(a' → '(a', '1(a)(ii)' → '(a)(ii)', '2a' → 'a'
  s = s.replace(/^\d{1,2}\s*(?=[({.]*[a-z]|[a-z]$)/, '');
  return s
    .replace(/[()]/g, '.')
    .replace(/\s+/g, '')
    .replace(/\.+/g, '.')
    .replace(/^\.|\.$/g, '');
}

/**
 * Parse one subpart's rubric rows from the stored mark-scheme text.
 * Accepts the storage format produced by the extraction pipeline:
 *   "(a) [B1] Leopold was offered the Spanish crown."
 *   "(b)(i) [A3] 0.078 J"
 *   "(c) [LEVEL] Level 4: Explains both sides... — 7–9"
 */
export function parseRubric(
  subpartLabel: string,
  officialMarkScheme: string
): ParsedRubric {
  const target = canonicalLabel(subpartLabel);
  const rows: RubricCriterion[] = [];
  const subpartGuidance: string[] = [];
  const subpartWideGuidance: string[] = [];

  // ── Pass 1: read every scheme line in ANY known dialect ──
  // Dialects:
  //  A (History/Cambridge): "(b) [C1] criteria text"      — letter+digit codes
  //  B (Economics/Edexcel): "(1(a)(ii)) [1] criteria"       — numeric codes, glued labels
  //  B guidance rows:       "(1(a)(ii)) [GUIDANCE] …"      — constraints, not awardable rows
  //  B allocation rows:    "(3(a)) [MARK ALLOCATION] up to 3 marks for AO1…" — AO budgets
  //  B marking-guidance:   "(3(a)) [MARKING GUIDANCE] follow the point-based…" — scheme meta
  interface RawRow { labelRaw: string; code: string; text: string; }
  const rawRows: RawRow[] = [];

  for (const raw of String(officialMarkScheme || '').split('\n')) {
    const t = raw.trim();
    if (!t) continue;
    // Row regex captures the WHOLE label blob (both dialects) and canonicalLabel cleans it:
    //  History: '(b) [C1] text'                → captures 'b'
    //  Economics A: '(1(a)(i)) [1] text'        → captures '1(a)(i)' → canonicalLabel strips '1'
    //  Economics B: '(2a) [AO1 — max 3 marks]'  → glued '2a' label + textual AO codes
    const m = t.match(/^\((\d{0,2}\(?[a-z0-9()]*[a-z0-9]\)*)\)\s*\[([^\]]+)\]\s*(.+)$/i)
      || t.match(/^\(?([a-z][ivx0-9().]*|\d{0,2}[a-z](?:\([ivx0-9]+\))*)\)?\s*\[([^\]]+)\]\s*(.+)$/i);
    if (!m) continue;
    rawRows.push({ labelRaw: m[1], code: m[2].trim().toUpperCase(), text: m[3].trim() });
  }

  // ── Pass 2: classify rows and keep only this subpart's ──
  let idx = 0;
  for (const rr of rawRows) {
    const label = canonicalLabel(rr.labelRaw);
    if (label !== target && !label.startsWith(target + '.')) continue;

    const code = rr.code;
    // Textual AO codes: 'AO1 — max 3 marks' → base 'AO1' with an embedded per-AO cap
    const aoCapMatch = code.match(/^(AO\d)\s*[\u2013\u2014-]\s*max\s*(\d+)\s*marks?$/i);
    const baseCode = aoCapMatch ? aoCapMatch[1].toUpperCase() : code;
    const isGuidance = /^(GUIDANCE|MARKING GUIDANCE|NOTE)$/i.test(baseCode) || /—\s*note$/i.test(code);
    const isAllocation = /^(MARK ALLOCATION)$/i.test(baseCode);
    const isLevel = /^LEVEL/.test(baseCode) || /level\s+\d/i.test(rr.text);

    if (isGuidance || isAllocation) {
      const guidanceEntry = `${isAllocation ? 'MARK ALLOCATION' : 'GUIDANCE'}: ${rr.text}`;
      // Subpart-wide guidance ("Both parts must be clearly linked", AO budgets) applies
      // to EVERY criterion of the subpart; criterion-specific guidance attaches to the
      // preceding row. Heuristic: subpart-wide if it mentions 'both parts', 'each',
      // 'all', 'up to N marks', or starts before any criterion exists.
      const isSubpartWide = /both parts|each |all parts|up to \d+ marks?/i.test(rr.text) || rows.length === 0;
      if (isSubpartWide) {
        subpartGuidance.push(guidanceEntry);
        // Also stamp onto every existing criterion (and remember for future ones)
        rows.forEach(r => { r.guidance = (r.guidance || '') + (r.guidance ? ' | ' : '') + guidanceEntry; });
        subpartWideGuidance.push(guidanceEntry);
      } else {
        const attachTo = [...rows].reverse().find(r => !r.isGuidance && !r.isAllocation);
        if (attachTo) {
          attachTo.guidance = (attachTo.guidance || '') + (attachTo.guidance ? ' | ' : '') + guidanceEntry;
        } else {
          subpartGuidance.push(guidanceEntry);
        }
      }
      continue;
    }

    // Value by code dialect:
    //  A: B1/C1/A1 → 1; A3/B2 → 3/2; B1DEP → 1, M2DEP → 2; SC2 → 2
    //  B: [1]/[2] → the number; AO1/AO2/AO3 → 1; 'AO1 — max 3 marks' → 1 with cap in guidance
    //  C: Direct answer marks: 'ANSWER — 2 MARKS' → 2; 'ANSWER — 3 MARKS' → 3
    //  D: Text-declared marks: '150 — 3 marks' → 3
    let value = 1;
    if (isLevel) {
      value = 0;
    } else if (/^\d+$/.test(code)) {
      value = parseInt(code, 10);
    } else if (aoCapMatch) {
      value = 1; // AO rows award 1 each; the 'max N' cap is recorded in guidance
    } else if (/^AO\d/i.test(code)) {
      value = 1;
    } else {
      // 1. Explicit marks in code: e.g. "ANSWER — 3 MARKS", "3 MARKS"
      const codeMarks = code.match(/(\d+)\s*marks?/i);
      if (codeMarks) {
        value = parseInt(codeMarks[1], 10);
      } else {
        // 2. Standard codes: M1, M2, B1, B2, M3, B1DEP, M2DEP, SC2, A3
        const codeDigits = code.match(/^[A-Z]*(\d+)/i) || code.match(/(\d+)/);
        if (codeDigits) {
          value = parseInt(codeDigits[1], 10);
        } else {
          // 3. Fallback: check criterion text for "— 3 marks", "[3 marks]", or "3 marks"
          const textMarks = rr.text.match(/(?:[\u2013\u2014-]|\[|\()\s*(\d+)\s*marks?(?:\]|\)|\s|$)/i)
            || rr.text.match(/\b(\d+)\s*marks?\b/i);
          if (textMarks) {
            value = parseInt(textMarks[1], 10);
          }
        }
      }
    }

    const isFallback = /^SC/i.test(code)
      || /^(?:if\s+(?:b0|0|b1)\s+scored|instead\s+award|or\s+sc\d)/i.test(rr.text)
      || /^for\s+\d+\s+correct\b/i.test(rr.text);

    // Textual AO rows: record the per-AO cap as guidance so the judge sees it
    const aoCapGuidance = aoCapMatch
      ? `Per-AO budget: ${aoCapMatch[1].toUpperCase()} up to ${aoCapMatch[2]} marks`
      : '';

    rows.push({
      index: idx++,
      label,
      code: baseCode,
      value,
      text: rr.text,
      isLevel,
      isFallback,
      guidance: [
        ...(subpartWideGuidance.length > 0 ? [subpartWideGuidance.join(' | ')] : []),
        ...(aoCapGuidance ? [aoCapGuidance] : [])
      ].join(' | ') || undefined,
      overlapGroup: null
    } as RubricCriterion);
  }

  // Per-subpart guidance that had no preceding criterion (e.g. allocation rows first)
  if (subpartGuidance.length > 0 && rows.length > 0) {
    rows[0].guidance = (rows[0].guidance ? rows[0].guidance + ' | ' : '') + subpartGuidance.join(' | ');
  }

  // Scheme type inference from the scheme's own phrasing
  const joined = rows.map(r => r.text).join(' ').toLowerCase();
  const menuPhrases = ['one mark for each', 'each relevant point', 'responses may include', 'any ' + '', 'or '];
  const isMenu = rows.filter(r => !r.isLevel).length > 0 &&
    (joined.includes('one mark for each') || joined.includes('each relevant point') ||
     joined.includes('responses may include') || rows.length >= 6);
  const isLevels = rows.some(r => r.isLevel);
  const schemeType: 'points' | 'levels' | 'menu' = isLevels ? 'levels' : (isMenu ? 'menu' : 'points');

  // Printed max: highest trailing bracket like "[6]" or "– 9" in level ranges —
  // callers should prefer the DB part marks; this is a fallback.
  let printedMax: number | null = null;

  // Overlap detection
  assignOverlapGroups(rows);

  return {
    subpart: target,
    criteria: rows,
    schemeType,
    printedMax,
    overlapGroups: new Set(rows.map(r => r.overlapGroup).filter(g => g !== null)).size
  };
}

/** Content words used for overlap comparison (stopword-free). */
const STOPWORDS = new Set([
  'the', 'a', 'an', 'of', 'and', 'or', 'to', 'in', 'was', 'were', 'is', 'are',
  'be', 'been', 'it', 'that', 'this', 'as', 'by', 'for', 'with', 'from', 'so',
  'now', 'at', 'on', 'into', 'part', 'became', 'because', 'which', 'their', 'its'
]);

/** Mark scheme boilerplate/direction words that must not be used to signal semantic overlap */
const SCHEME_BOILERPLATE = new Set([
  'accept', 'equivalent', 'equation', 'better', 'their', 'seen', 'soi',
  'substitute', 'simplif', 'simplified', 'simplifying', 'values', 'value',
  'correct', 'answer', 'where', 'instead', 'award', 'scored', 'without',
  'shown', 'using', 'calculate', 'method', 'step', 'steps', 'final', 'dep',
  'following', 'omissions', 'statement', 'reasons', 'reason', 'working',
  'work', 'marks', 'mark', 'score', 'points', 'point', 'case', 'special',
  'answers', 'allow', 'oe', 'isw', 'ft'
]);

/** Lightweight domain-agnostic English stemmer for matching inflected word forms. */
function stemWord(raw: string): string {
  let w = String(raw || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  if (w.length <= 4) return w;
  const rules: Array<[RegExp, string]> = [
    [/ations?$/, ''],
    [/isation$|ization$/, ''],
    [/ments?$/, ''],
    [/ness$/, ''],
    [/ities$|ity$/, ''],
    [/ings?$/, ''],
    [/ied$/, 'y'],
    [/ies$/, 'y'],
    [/ed$/, ''],
    [/es$/, ''],
    [/ly$/, ''],
    [/ing$/, ''],
    [/s$/, ''],
  ];
  for (const [re, rep] of rules) {
    if (re.test(w) && w.replace(re, rep).length >= 3) {
      w = w.replace(re, rep);
      break;
    }
  }
  return w;
}

function contentWords(text: string): string[] {
  return String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 3 && !STOPWORDS.has(w) && !SCHEME_BOILERPLATE.has(w));
}

function stemmedContentWords(text: string): string[] {
  return contentWords(text).map(stemWord).filter(w => w.length >= 3);
}

/**
 * Overlap grouping: rows expressing the same idea are linked so one student
 * idea cannot earn from both. Completely domain-agnostic detection layers:
 * 1. LEXICAL (stemmed): stemmed Jaccard >= 0.48 or containment >= 0.72.
 * 2. PREDICATE EQUIVALENCE: rows that naturally share a subject/entity term
 *    from their own text AND express the same general English relational concept
 *    (e.g. dominance, weakness, exclusion, expansion, reorganization, growth).
 * Grouping is transitive via union-find; rows in the same group award a
 * SINGLE mark (the highest).
 */

/** General English predicate/action synsets (strictly domain- and topic-agnostic). */
const GENERIC_PREDICATE_GROUPS: string[][] = [
  ['dominated', 'dominating', 'dominate', 'major power', 'most powerful', 'main power', 'sole leader', 'only possible leader', 'led', 'leading'],
  ['weak', 'weaker', 'weakened', 'weakness', 'powerless', 'helpless', 'ineffective', 'unable', 'incapable', 'could not stand'],
  ['annexed', 'annexing', 'annexation', 'absorbed', 'took over', 'incorporated'],
  ['excluded', 'excluding', 'effectively excluded', 'no longer part', 'removed from', 'kept out', 'shut out', 'expelled'],
  ['more powerful', 'grew', 'strengthened', 'increased power', 'expanded', 'stronger'],
  ['opposition', 'opposed', 'resistance', 'resisted', 'protested', 'protests'],
];

function predicateGroupHits(text: string): Set<number> {
  const t = ' ' + String(text || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ') + ' ';
  const hits = new Set<number>();
  GENERIC_PREDICATE_GROUPS.forEach((cls, ci) => {
    for (const term of cls) {
      if (t.includes(' ' + term + ' ') || t.includes(term + ' ')) { hits.add(ci); break; }
    }
  });
  return hits;
}

function assignOverlapGroups(rows: RubricCriterion[]): void {
  const words = rows.map(r => new Set(stemmedContentWords(r.text)));
  const predHits = rows.map(r => predicateGroupHits(r.text));

  // Union-find
  const parent = rows.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const union = (a: number, b: number): void => {
    const ra = find(a), rb = find(b);
    if (ra !== rb) parent[rb] = ra;
  };

  for (let i = 0; i < rows.length; i++) {
    for (let j = i + 1; j < rows.length; j++) {
      if (rows[i].isLevel || rows[j].isLevel) continue; // levels handled separately

      // Math/Calculation criteria: distinct method (M), accuracy (A), and independent calculation (B) steps
      // represent separate stages in a calculation derivation.
      // NEVER merge distinct sequential calculation steps by loose lexical similarity.
      // BUT DO MERGE:
      // 1. Explicit alternatives ('or', 'instead', 'alternative')
      // 2. Descending partial tiers for the same calculation step (e.g. M2 with M1 partial factorisation,
      //    or B2 with B1 for one correct value, or SC1 fallback).
      const isCalculationStep = (c: string, t: string) =>
        /^(?:M\d|A\d|SC\d?)(?:DEP)?$/i.test(c) || (/^B\d(?:DEP)?$/i.test(c) && /[\d=+\-*/<>]/.test(t));
      const isExplicitAlt = (t: string) => /^(?:or\s+|instead\s+|alternative\b)/i.test(t);

      const isSameFamilyPartial = (idxA: number, idxB: number): boolean => {
        const cA = rows[idxA].code.toUpperCase().replace(/[^A-Z0-9]/g, '');
        const cB = rows[idxB].code.toUpperCase().replace(/[^A-Z0-9]/g, '');
        const tB = rows[idxB].text;
        const vA = rows[idxA].value;
        const vB = rows[idxB].value;

        const letterA = cA.replace(/\d+.*$/, '');
        const letterB = cB.replace(/\d+.*$/, '');

        if (letterA && letterA === letterB && vA > vB) {
          if (idxB === idxA + 1) return true;
          if (/partial|instead|\bor\b|where|or\s+better|or\s+equivalent|for\s+one|for\s+either/i.test(tB)) {
            const wi = words[idxA], wj = words[idxB];
            if ([...wi].some(w => wj.has(w))) return true;
          }
        }

        if (cB.startsWith('SC')) {
          if (idxB === idxA + 1 && (tB.toLowerCase().includes(letterA.toLowerCase() + '0') || /instead|alternative|if\s+0/i.test(tB))) {
            return true;
          }
        }

        if (idxB === idxA + 1 && vA > vB && /partial|\bor\b|for/i.test(tB)) {
          const wi = words[idxA], wj = words[idxB];
          if ([...wi].some(w => wj.has(w))) return true;
        }

        return false;
      };

      if (isCalculationStep(rows[i].code, rows[i].text) && isCalculationStep(rows[j].code, rows[j].text)) {
        if (isSameFamilyPartial(i, j) || isExplicitAlt(rows[j].text)) {
          union(i, j);
        }
        continue;
      }

      // Layer 1: stemmed lexical similarity (avoid letting a tiny 3-word row absorb an unrelated compound sentence)
      const wi = words[i], wj = words[j];
      let linked = false;
      if (wi.size > 0 && wj.size > 0) {
        const inter = [...wi].filter(w => wj.has(w)).length;
        const union_ = new Set([...wi, ...wj]).size;
        const minSize = Math.min(wi.size, wj.size);
        const maxSize = Math.max(wi.size, wj.size);
        const jaccard = inter / union_;
        const containment = inter / minSize;
        if (jaccard >= 0.50 || (containment >= 0.75 && minSize / maxSize >= 0.35)) linked = true;
      }

      // Layer 2: shared dynamically-derived subject/entity stem + same general predicate group
      if (!linked) {
        const sharedPreds = [...predHits[i]].filter(c => predHits[j].has(c));
        if (sharedPreds.length > 0) {
          // Collect predicate stems to ensure the shared stem is a distinct entity/subject word, not the predicate itself
          const predTermsSet = new Set<string>();
          for (const gIdx of sharedPreds) {
            for (const term of GENERIC_PREDICATE_GROUPS[gIdx]) {
              stemmedContentWords(term).forEach(s => predTermsSet.add(s));
            }
          }
          const sharedEntities = [...wi].filter(w => wj.has(w) && !predTermsSet.has(w));
          if (sharedEntities.length >= 1) {
            const classSalientIn = (rowIdx: number): boolean => {
              const txt = ' ' + rows[rowIdx].text.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ') + ' ';
              const rowWords = contentWords(rows[rowIdx].text);
              if (rowWords.length === 0) return false;
              let classTermChars = 0;
              for (const gIdx of sharedPreds) {
                for (const term of GENERIC_PREDICATE_GROUPS[gIdx]) {
                  if (txt.includes(' ' + term + ' ')) classTermChars += term.length;
                }
              }
              return classTermChars / rowWords.join('').length >= 0.12;
            };
            if (classSalientIn(i) && classSalientIn(j)) {
              linked = true;
            }
          }
        }
      }
      if (linked) union(i, j);
    }
  }

  const groupIds = new Map<number, number>();
  rows.forEach((r, i) => {
    const root = find(i);
    if (!groupIds.has(root)) groupIds.set(root, groupIds.size);
    r.overlapGroup = groupIds.get(root)!;
  });
}

/**
 * Checks whether two cited student evidence snippets represent the same single
 * sentence/claim, preventing double-counting when one quote is cited for two B1 criteria.
 */
function areEvidenceSnippetsSameClaim(evA: string, evB: string): boolean {
  const aClean = String(evA || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
  const bClean = String(evB || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!aClean || !bClean) return false;
  if (aClean === bClean) return true;

  const toksA = new Set(aClean.split(' ').filter(w => w.length > 2 && !STOPWORDS.has(w)).map(stemWord));
  const toksB = new Set(bClean.split(' ').filter(w => w.length > 2 && !STOPWORDS.has(w)).map(stemWord));
  if (toksA.size === 0 || toksB.size === 0) return false;

  const inter = [...toksA].filter(t => toksB.has(t)).length;
  const minLen = Math.min(toksA.size, toksB.size);
  const unionLen = new Set([...toksA, ...toksB]).size;
  const containment = inter / minLen;
  const jaccard = inter / unionLen;

  return (minLen >= 3 && containment >= 0.78) || jaccard >= 0.70;
}

/**
 * DETERMINISTIC SCORE COMPUTATION from validated marking decisions.
 * Takes the LLM's per-criterion "satisfied" verdicts and computes the final
 * subpart score in code — the model NEVER computes the total.
 *
 * Rules enforced:
 * - Each OVERLAP GROUP awards at most ONE mark (the highest-value satisfied row
 *   in the group) — no double-counting of the same idea.
 * - LEVEL schemes: the awarded level mark (already a number) is used directly.
 * - Score is capped at the part's marks-available (printedMax / fallbackMax).
 * - Score is never negative; absent criteria simply earn nothing (no deductions).
 */
export function computeSubpartScore(
  rubric: ParsedRubric,
  satisfied: { criterionIndex: number; satisfied: boolean; evidence?: string }[],
  marksAvailable: number
): {
  score: number;
  awardedGroups: number[];
  cappedByOverlap: number;
  cappedAtMax: boolean;
  waivedFallbacks: number[];
  duplicateEvidenceIndices: number[];
} {
  const verdictByIndex = new Map<number, boolean>();
  const evidenceByIndex = new Map<number, string>();
  for (const v of satisfied || []) {
    verdictByIndex.set(v.criterionIndex, !!v.satisfied);
    if (v.evidence) evidenceByIndex.set(v.criterionIndex, String(v.evidence).trim());
  }

  // 1. Level-based: award the highest satisfied level value directly
  const levelRows = rubric.criteria.filter(r => r.isLevel);
  if (levelRows.length > 0 && rubric.schemeType === 'levels') {
    let best = 0;
    for (const r of levelRows) {
      if (verdictByIndex.get(r.index)) {
        const lv = extractLevelValue(r.text);
        if (lv !== null && lv > best) best = lv;
      }
    }
    return {
      score: Math.min(best, marksAvailable),
      awardedGroups: [],
      cappedByOverlap: 0,
      cappedAtMax: best > marksAvailable,
      waivedFallbacks: [],
      duplicateEvidenceIndices: []
    };
  }

  // 2. Point/menu-based: one award per overlap group (highest value satisfied row)
  const groupBest = new Map<number, number>();
  const groupWinnerRow = new Map<number, RubricCriterion>();
  const groupEvidence = new Map<number, string>();
  for (const r of rubric.criteria) {
    if (r.isLevel) continue;
    if (!verdictByIndex.get(r.index)) continue;
    const g = r.overlapGroup ?? r.index;
    const cur = groupBest.get(g) ?? 0;
    const ev = evidenceByIndex.get(r.index) || '';
    if (r.value > cur || (!groupWinnerRow.has(g) && ev)) {
      if (r.value >= cur) {
        groupBest.set(g, r.value);
        groupWinnerRow.set(g, r);
        if (ev) groupEvidence.set(g, ev);
      }
    }
  }

  // 2b. Dynamic Evidence Deduplication:
  // If two distinct qualitative 1-mark criteria (not calculation formulas) cite the
  // exact same student sentence/phrase as evidence, collapse the duplicate claim so
  // one sentence cannot earn two separate marks on subjective checklists.
  const isQualitativeSingleMark = (r?: RubricCriterion): boolean => {
    if (!r || r.value !== 1) return false;
    const isCalc =
      /^(?:M\d|A\d|SC\d?)(?:DEP)?$/i.test(r.code) ||
      (/^B\d(?:DEP)?$/i.test(r.code) &&
        (/[=<>±√π×÷^]/.test(r.text) ||
          /(?:\d|\))\s*[+\-*/]\s*(?:\d|\(|[a-z]\b)/i.test(r.text) ||
          /\b\d+(?:\.\d+)?\s*(?:cm|mm|km|mg|kg|mol|dm|ml|°)\b/i.test(r.text) ||
          /^\s*(?:allow|accept|cao|oe|ft|isw)?\s*-?\d+(?:\.\d+)?(?:\s*(?:,|or)\s*-?\d+(?:\.\d+)?)*\s*$/i.test(r.text)));
    return !isCalc;
  };

  const acceptedEntries: Array<{ group: number; value: number; row: RubricCriterion; evidence: string }> = [];
  const duplicateEvidenceIndices: number[] = [];
  let duplicateClaimCollapses = 0;

  for (const [g, val] of groupBest.entries()) {
    const row = groupWinnerRow.get(g)!;
    const ev = groupEvidence.get(g) || '';
    if (ev && isQualitativeSingleMark(row)) {
      const dupMatch = acceptedEntries.find(
        (prev) => isQualitativeSingleMark(prev.row) && areEvidenceSnippetsSameClaim(prev.evidence, ev)
      );
      if (dupMatch) {
        duplicateClaimCollapses++;
        duplicateEvidenceIndices.push(row.index);
        continue;
      }
    }
    acceptedEntries.push({ group: g, value: val, row, evidence: ev });
  }

  const awarded = acceptedEntries.reduce((s, e) => s + e.value, 0);

  const satisfiedCount = rubric.criteria.filter(r => !r.isLevel && verdictByIndex.get(r.index)).length;
  const cappedByOverlap = satisfiedCount - acceptedEntries.length;

  const finalScore = Math.min(awarded, marksAvailable);

  // Fallbacks and alternatives (SC marks, "for 3 correct", etc.) are waived if
  // full marks or primary marks were earned so they do NOT register as unearned deductions.
  const waivedFallbacks: number[] = [];
  for (const r of rubric.criteria) {
    if (r.isFallback) {
      if (finalScore >= marksAvailable || (!verdictByIndex.get(r.index) && awarded > 0)) {
        waivedFallbacks.push(r.index);
      }
    }
  }

  return {
    score: Math.max(0, finalScore),
    awardedGroups: acceptedEntries.map(e => e.group),
    cappedByOverlap: Math.max(0, cappedByOverlap),
    cappedAtMax: awarded > marksAvailable,
    waivedFallbacks,
    duplicateEvidenceIndices
  };
}

/** Extract a level's mark value from a descriptor like "Level 4: ... — 7–9". */
function extractLevelValue(levelText: string): number | null {
  const range = levelText.match(/(\d{1,2})\s*[–-]\s*(\d{1,2})/);
  if (range) return parseInt(range[2], 10); // top of the range when the level is satisfied
  const single = levelText.match(/(\d{1,2})\s*(?:marks?|$)/i);
  return single ? parseInt(single[1], 10) : null;
}

/**
 * Normalizes mathematical and algebraic expressions for robust comparison:
 * - Converts Unicode minus signs to standard hyphen '-'
 * - Converts LaTeX fractions \frac{a}{b} to (a)/(b)
 * - Removes examiner direction notes (final answer, oe, isw, soi, seen, etc.)
 * - Strips all internal whitespace and degree symbols
 */
export function normalizeMathExpression(str: string): string {
  if (!str) return '';
  return String(str).toLowerCase()
    .replace(/[\u2013\u2014\u2212]/g, '-')
    .replace(/\\frac\{([^}]+)\}\{([^}]+)\}/g, '($1)/($2)')
    .replace(/(?:final\s*answer|oe|isw|soi|seen|accept|correct|cao|dep|their)\b/gi, '')
    .replace(/[\s°]/g, '');
}

/**
 * Checks if a candidate's mathematical/algebraic answer matches a rubric criterion target.
 * Handles whitespace differences, fraction representations, assignments (e.g. c = 150),
 * and examiner trailing annotations.
 */
export function isAlgebraicMatch(student: string, criterion: string): boolean {
  const normS = normalizeMathExpression(student);
  const normC = normalizeMathExpression(criterion);
  if (!normS || !normC) return false;
  if (normS === normC) return true;

  // Extract RHS if student has assignment like "c=150" or "x=55"
  const sRhs = normS.includes('=') ? normS.split('=').pop() : null;

  // Extract primary target from criterion before mark annotation dash / brackets
  const cTarget = normC.split(/[-–—\[(]/)[0];
  if (cTarget && (normS === cTarget || (sRhs && sRhs === cTarget))) return true;

  // Criterion starts with student expression (e.g. "(x+3)/(2y+5)finalanswer")
  for (const s of [normS, sRhs].filter(Boolean) as string[]) {
    if (normC.startsWith(s)) {
      const remainder = normC.slice(s.length);
      if (!remainder || /^[^0-9a-z]/.test(remainder) || /^(?:final|marks?|seen|oe|isw)/.test(remainder)) {
        return true;
      }
    }
  }
  return false;
}

