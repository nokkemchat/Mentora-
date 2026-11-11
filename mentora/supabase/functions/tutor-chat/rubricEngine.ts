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
    const isLevel = /^LEVEL/.test(baseCode) || /^level\s+\d\b/i.test(rr.text);

    // Strip trailing inline guidance ("— Guidance: ..." or "— Note: ...") out of criterion text
    // so numeric target parsers and quote validators see only the clean answer specification.
    let cleanText = rr.text;
    let inlineGuidance = '';
    if (!isGuidance && !isAllocation) {
      const inlineMatch = cleanText.match(/^(.+?)\s*[\u2013\u2014-]\s*((?:Guidance|Note)\s*:[\s\S]+)$/i);
      if (inlineMatch) {
        cleanText = inlineMatch[1].trim();
        inlineGuidance = inlineMatch[2].trim();
      }
    }

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
          const textMarks = cleanText.match(/(?:[\u2013\u2014-]|\[|\()\s*(\d+)\s*marks?(?:\]|\)|\s|$)/i)
            || cleanText.match(/\b(\d+)\s*marks?\b/i);
          if (textMarks) {
            value = parseInt(textMarks[1], 10);
          }
        }
      }
    }

    const isFallback = /^SC/i.test(code)
      || /^(?:if\s+(?:b0|0|b1)\s+scored|instead\s+award|or\s+sc\d)/i.test(cleanText)
      || /^for\s+\d+\s+correct\b/i.test(cleanText);

    // Textual AO rows: record the per-AO cap as guidance so the judge sees it
    const aoCapGuidance = aoCapMatch
      ? `Per-AO budget: ${aoCapMatch[1].toUpperCase()} up to ${aoCapMatch[2]} marks`
      : '';

    const combinedGuidance = [
      ...(subpartWideGuidance.length > 0 ? [subpartWideGuidance.join(' | ')] : []),
      ...(aoCapGuidance ? [aoCapGuidance] : []),
      ...(inlineGuidance ? [inlineGuidance] : [])
    ].join(' | ') || undefined;

    // Split multi-item criteria with explicit "B1/B1FT/A1 for each" guidance (e.g. "-3.7 -2.7 — Guidance: B1FT for each")
    // into individual 1-mark items so partial matches award 1 mark smoothly instead of swinging 0 vs full marks.
    if (!isLevel && value >= 2 && !isFallback && inlineGuidance) {
      const eachCodeMatch = inlineGuidance.match(/\b([ABM]1(?:FT|DEP)?|SC1)\s+(?:for\s+)?each\b/i);
      if (eachCodeMatch) {
        const tokenMatches = cleanText.match(/\([^)]+\)|-?\d+(?:\.\d+)?(?:\s*\/\s*-?\d+(?:\.\d+)?)?|[a-z]\s*=\s*-?\d+(?:\.\d+)?/gi) || [];
        const leftover = cleanText
          .replace(/\([^)]+\)|-?\d+(?:\.\d+)?(?:\s*\/\s*-?\d+(?:\.\d+)?)?|[a-z]\s*=\s*-?\d+(?:\.\d+)?/gi, '')
          .replace(/[\s,;]+/g, '');
        if (tokenMatches.length === value && leftover.length === 0) {
          const itemCode = eachCodeMatch[1].toUpperCase();
          for (const tok of tokenMatches) {
            rows.push({
              index: idx++,
              label,
              code: itemCode,
              value: 1,
              text: tok.trim(),
              isLevel: false,
              isFallback: false,
              guidance: combinedGuidance,
              overlapGroup: null
            } as RubricCriterion);
          }
          continue;
        }
      }
    }

    // Expand combined multi-mark "or"-lists (e.g. "(a) [4] Fact 1. or Fact 2. or ...")
    // into individual 1-mark items so 1 recalled fact cannot earn all 4 marks.
    if (!isLevel && value >= 2 && !isCalculationCriterion(baseCode, cleanText)) {
      const orClauses = cleanText.split(/(?<=[.?!])\s+or\s+/i).map(s => s.trim()).filter(Boolean);
      if (orClauses.length >= value) {
        for (const clause of orClauses) {
          rows.push({
            index: idx++,
            label,
            code: baseCode,
            value: 1,
            text: clause,
            isLevel: false,
            isFallback: false,
            guidance: combinedGuidance,
            overlapGroup: null
          } as RubricCriterion);
        }
        continue;
      }
    }

    rows.push({
      index: idx++,
      label,
      code: baseCode,
      value,
      text: cleanText,
      isLevel,
      isFallback,
      guidance: combinedGuidance,
      overlapGroup: null
    } as RubricCriterion);

    // Materialize explicit tiered partial-credit fallbacks declared inside inline guidance
    // (e.g. "Guidance: B2 for 3 or 4 correct or B1 for 1 or 2 correct") as fallback rows
    // in the same overlap group so a single minor table mismatch degrades smoothly (e.g. 2/3)
    // instead of collapsing from full marks to 0.
    if (!isLevel && value >= 2 && inlineGuidance) {
      const tierRe = /\b([ABM]\d+(?:FT|DEP)?|SC\d+)\s+for\s+((?:\d+(?:\s*(?:or|to|-)\s*\d+)?|one|two|three|four)\s+correct)\b/gi;
      let tm: RegExpExecArray | null;
      while ((tm = tierRe.exec(inlineGuidance)) !== null) {
        const tierCode = tm[1].toUpperCase();
        const tierCond = tm[2].trim();
        const tierDigits = tierCode.match(/(\d+)/);
        const tierVal = tierDigits ? parseInt(tierDigits[1], 10) : 1;
        if (tierVal > 0 && tierVal < value) {
          rows.push({
            index: idx++,
            label,
            code: tierCode,
            value: tierVal,
            text: `${tierCond} (from: ${cleanText})`,
            isLevel: false,
            isFallback: true,
            guidance: `Fallback partial tier for ${baseCode}`,
            overlapGroup: null
          } as RubricCriterion);
        }
      }
    }
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

/**
 * Returns true if a rubric criterion represents a mathematical/numeric calculation
 * step (M/A/SC method/accuracy codes or numeric/formula B-codes), rather than a
 * qualitative prose point. Used consistently across overlap grouping, consensus gating,
 * and evidence deduplication.
 */
export function isCalculationCriterion(code: string, text: string): boolean {
  if (/^(?:M\d|A\d|SC\d?)(?:DEP)?$/i.test(code)) return true;
  if (!/^B\d(?:DEP)?$/i.test(code)) return false;
  return (
    /[=<>±√π×÷^]/.test(text) ||
    /(?:\d|\))\s*[+\-*/]\s*(?:\d|\(|[a-z]\b)/i.test(text) ||
    /\b\d+(?:\.\d+)?\s*(?:cm|mm|km|mg|kg|mol|dm|ml|°)\b/i.test(text) ||
    /^\s*(?:allow|accept|cao|oe|ft|isw)?\s*-?\d+(?:\.\d+)?(?:\s*(?:,|or)\s*-?\d+(?:\.\d+)?)*\s*$/i.test(text) ||
    /^\s*(?:\[\s*[\d.\-\s]+\]|-?\d+(?:\.\d+)?)(?:[\s,|]+(?:\[\s*[\d.\-\s]+\]|-?\d+(?:\.\d+)?))+\s*$/i.test(text)
  );
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

      // Explicitly materialized partial-credit fallback tiers (e.g. "B2 for 3 or 4 correct"
      // derived from B3) always share an overlap group with their parent criterion.
      if (rows[j].isFallback && rows[i].value > rows[j].value &&
          rows[j].guidance?.includes(`Fallback partial tier for ${rows[i].code}`)) {
        union(i, j);
        continue;
      }

      if (isCalculationCriterion(rows[i].code, rows[i].text) && isCalculationCriterion(rows[j].code, rows[j].text)) {
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
 * Checks whether two qualitative rubric criteria share substantive concept overlap
 * (so citing identical student text for both is double-counting), while keeping
 * genuinely distinct rubric facts separate (even when packed into one compound sentence).
 */
function criteriaShareConceptOverlap(rowA: RubricCriterion, rowB: RubricCriterion): boolean {
  if (rowA.overlapGroup !== null && rowA.overlapGroup === rowB.overlapGroup) return true;

  const tokA = new Set(stemmedContentWords(rowA.text));
  const tokB = new Set(stemmedContentWords(rowB.text));
  if (tokA.size > 0 && tokB.size > 0) {
    const inter = [...tokA].filter(w => tokB.has(w)).length;
    const minSize = Math.min(tokA.size, tokB.size);
    const unionSize = new Set([...tokA, ...tokB]).size;
    if ((inter >= 2 && inter / unionSize >= 0.25) || (inter >= 2 && inter / minSize >= 0.40)) {
      return true;
    }
  }

  const predA = predicateGroupHits(rowA.text);
  const predB = predicateGroupHits(rowB.text);
  const sharedPreds = [...predA].filter(p => predB.has(p));
  if (sharedPreds.length > 0 && tokA.size > 0 && tokB.size > 0) {
    const predTerms = new Set<string>();
    for (const gIdx of sharedPreds) {
      for (const term of GENERIC_PREDICATE_GROUPS[gIdx]) {
        stemmedContentWords(term).forEach(s => predTerms.add(s));
      }
    }
    const sharedEntities = [...tokA].filter(w => tokB.has(w) && !predTerms.has(w));
    if (sharedEntities.length >= 1) return true;
  }

  return false;
}

/**
 * Checks whether two cited student evidence snippets represent the same single
 * claim/phrase, preventing double-counting when one quote is cited for two overlapping B1 criteria.
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

interface ParsedNumericTargets {
  singles: number[];
  ranges: Array<[number, number]>;
}

/**
 * Extracts pure standalone numeric/fraction targets or tolerance ranges from an
 * exact numeric criterion (e.g. "52", "-5", "25.2[0]", "1/3 cao", "36.9 or 36.86 to 36.87",
 * "59.8 (or 119.6) or 63.25"). Returns null if the criterion requires algebraic symbols,
 * words/reasons, units conversions, or multi-step expressions.
 */
function parseScalarTargets(criterionText: string): ParsedNumericTargets | null {
  let s = String(criterionText || '')
    // Expand Cambridge optional digits like "25.2[0]" -> "25.2 or 25.20"
    .replace(/(\d+(?:\.\d+)?)\[(\d+)\]/g, '$1')
    // Strip bracketed optional signs/prefixes like "[1 : ]" or "[$]"
    .replace(/\[[^\]]*\]/g, ' ')
    // Replace "(or ...)" parentheticals with " or "
    .replace(/\(\s*or\s+([^)]+)\)/gi, ' or $1 ')
    // Strip trailing/inline rubric qualifiers
    .replace(/\b(?:oe|cao|isw|soi|seen|allow|accept|correct|both|either|answers?|figs?|to\s+\d+\s*(?:d\.?p\.?|s\.?f\.?)|hours?|minutes?|mins?|hrs?|seconds?|secs?|cm|mm|km|m|kg|g|ml|l|euros?|\$)\b/gi, ' ')
    .replace(/[°$£€%]/g, ' ')
    .replace(/[\u2013\u2014\u2212]/g, '-')
    .trim();

  if (!s) return null;
  // Must not contain remaining alphabetic words (other than "or" / "to") or algebraic operators
  const withoutConnectors = s.replace(/\b(?:or|to)\b/gi, ' ');
  if (/[a-z=<>±√π×÷^*+]/i.test(withoutConnectors)) return null;
  if (/\d\s*-\s*\d/.test(withoutConnectors)) return null; // subtraction expression like "10 - 3.55"

  const singles: number[] = [];
  const ranges: Array<[number, number]> = [];
  const parts = s.split(/\s+or\s+|,/i).map(p => p.trim()).filter(Boolean);
  if (parts.length === 0) return null;

  const parseToken = (tok: string): number | null => {
    const frac = tok.match(/^(-?\d+(?:\.\d+)?)\s*\/\s*(-?\d+(?:\.\d+)?)$/);
    if (frac) {
      const den = parseFloat(frac[2]);
      return den !== 0 ? parseFloat(frac[1]) / den : null;
    }
    if (/^-?\d+(?:\.\d+)?$/.test(tok)) {
      return parseFloat(tok);
    }
    return null;
  };

  for (const p of parts) {
    const rangeMatch = p.match(/^(-?\d+(?:\.\d+)?)\s+to\s+(-?\d+(?:\.\d+)?)$/i);
    if (rangeMatch) {
      const a = parseFloat(rangeMatch[1]);
      const b = parseFloat(rangeMatch[2]);
      ranges.push([Math.min(a, b), Math.max(a, b)]);
      continue;
    }
    const v = parseToken(p);
    if (v === null || isNaN(v)) return null;
    singles.push(v);
  }

  return singles.length > 0 || ranges.length > 0 ? { singles, ranges } : null;
}

/** Extracts numeric values (including LaTeX/simple fractions and HH:MM compact forms) from student evidence. */
function extractEvidenceNumbers(evidence: string): {
  numbers: number[];
  hasArithmeticDerivation: boolean;
} {
  // Normalize Unicode minus signs and LaTeX fractions (\frac{a}{b}, \dfrac{a}{b}, \tfrac{a}{b})
  const s = String(evidence || '')
    .replace(/[\u2013\u2014\u2212]/g, '-')
    .replace(/\\(?:d|t)?frac\s*\{([^}]+)\}\s*\{([^}]+)\}/g, '$1/$2')
    .replace(/\\times/g, '×')
    .replace(/\\div/g, '÷')
    .replace(/[\s]+/g, ' ')
    .trim();
  const hasArithmeticDerivation =
    /(?:\d|\))\s*[+*×÷^\\]\s*(?:\d|\(|[a-z])/i.test(s) ||
    /(?:\d|\))\s+-\s+(?:\d|\()/.test(s) ||
    /[a-z]\s*[+\-*/×÷^]|[+\-*/×÷^]\s*[a-z]/i.test(s);

  const numbers: number[] = [];
  // Handle simple fractions first e.g. 1/3, -2/5
  const fracRe = /(-?\d+(?:\.\d+)?)\s*\/\s*(-?\d+(?:\.\d+)?)/g;
  let m: RegExpExecArray | null;
  while ((m = fracRe.exec(s)) !== null) {
    const den = parseFloat(m[2]);
    if (den !== 0) numbers.push(parseFloat(m[1]) / den);
  }
  // Handle HH:MM time notation as equivalent compact integer (e.g. "17:05" -> 1705)
  const timeRe = /\b(\d{1,2}):(\d{2})\b/g;
  while ((m = timeRe.exec(s)) !== null) {
    numbers.push(parseInt(m[1] + m[2], 10));
  }
  // Standard signed scalars
  const numRe = /(?<![a-z0-9.])(-?\d+(?:\.\d+)?)/gi;
  while ((m = numRe.exec(s)) !== null) {
    const val = parseFloat(m[1]);
    if (!isNaN(val)) numbers.push(val);
  }
  return { numbers, hasArithmeticDerivation };
}

/**
 * Checks whether every number in `needle` appears in order inside `haystack`
 * (allowing intervening numbers such as pre-printed table headers/values).
 */
function isOrderedSubsequence(needle: number[], haystack: number[]): boolean {
  if (needle.length === 0) return true;
  if (haystack.length < needle.length) return false;
  let ni = 0;
  for (let hi = 0; hi < haystack.length && ni < needle.length; hi++) {
    if (Math.abs(haystack[hi] - needle[ni]) <= 1e-5) {
      ni++;
    }
  }
  return ni === needle.length;
}

/**
 * Extracts a strict ordered numeric sequence (>= 4 numbers) from criteria like
 * stem-and-leaf diagrams or completion tables (e.g. "9, 3, -3, -3, -3" or
 * "2 [5 7 9] 3 [6 8 8 8] 4 1 3 3 9 5 2 3 9 9 6 0"). Bracketed "[...]" elements
 * are treated as optional/pre-printed and omitted from the mandatory sequence.
 */
function parseOrderedSequenceTargets(rowText: string): number[] | null {
  const raw = String(rowText || '').replace(/[\u2013\u2014\u2212]/g, '-').trim();
  if (!raw) return null;
  if (/\b(?:or|to|allow|accept|oe)\b|[a-z=<>±√π×÷^*+]/i.test(raw)) return null;

  const mandatoryOnly = raw.replace(/\[[^\]]*\]/g, ' ').replace(/[|,]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!mandatoryOnly) return null;

  const tokens = mandatoryOnly.split(' ').filter(Boolean);
  if (tokens.length < 4) return null;
  const nums: number[] = [];
  for (const tok of tokens) {
    if (!/^-?\d+(?:\.\d+)?$/.test(tok)) return null;
    nums.push(parseFloat(tok));
  }
  return nums.length >= 4 ? nums : null;
}

/**
 * Deterministically rejects clear scalar mismatches or mismatched ordered numeric sequences
 * on strict non-FT accuracy/independent criteria (e.g. criterion "52" matched to "75°",
 * "-5" matched to "centre (1, 1)", or a wrong stem-and-leaf / table sequence).
 */
export function isVerdictContradicted(row: RubricCriterion, evidence: string): boolean {
  if (!evidence || !evidence.trim()) return false;
  if (row.isLevel || row.isFallback) return false;
  if (!/^[AB]\d*(?:DEP)?$/i.test(row.code)) return false;
  if (/\b(?:ft|follow\s*through|their|seen\s*from|dep)\b/i.test(`${row.code} ${row.text} ${row.guidance || ''}`)) {
    return false;
  }

  const ev = extractEvidenceNumbers(evidence);
  if (ev.numbers.length === 0 || ev.hasArithmeticDerivation) return false;

  const seqTargets = parseOrderedSequenceTargets(row.text);
  if (seqTargets) {
    return !isOrderedSubsequence(seqTargets, ev.numbers);
  }

  const targets = parseScalarTargets(row.text);
  if (!targets) return false;

  const matchesAny = ev.numbers.some((n) => {
    if (targets.singles.some((t) => Math.abs(n - t) <= 1e-5)) return true;
    if (targets.ranges.some(([lo, hi]) => n >= lo - 1e-6 && n <= hi + 1e-6)) return true;
    return false;
  });

  return !matchesAny;
}

/**
 * Flags verdicts that warrant independent 2-of-3 moderator consensus verification:
 * - Contradicted numeric targets,
 * - Coordinate mismatches even on FT criteria (e.g. "(1, 28)" vs "(1, 4)"),
 * - Short non-numeric classification terms (1–2 words) whose evidence shares zero stemmed tokens.
 */
export function verdictNeedsModeratorAudit(row: RubricCriterion, evidence: string): boolean {
  if (!evidence || !evidence.trim()) return false;
  if (isVerdictContradicted(row, evidence)) return true;

  // Coordinate pair comparison: criterion "(a, b)" vs evidence "(c, d)"
  const coordCrit = row.text.match(/\(\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*\)/);
  const coordEv = evidence.match(/\(\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*\)/);
  if (coordCrit && coordEv) {
    if (parseFloat(coordCrit[1]) !== parseFloat(coordEv[1]) || parseFloat(coordCrit[2]) !== parseFloat(coordEv[2])) {
      return true;
    }
  }

  // Short exact label / classification term (1-2 alphabetic words, e.g. "Translation", "obtuse", "alternate")
  if (!row.isLevel && /^[AB]\d*$/i.test(row.code) && !/\d/.test(row.text)) {
    const critWords = String(row.text || '')
      .toLowerCase()
      .replace(/[^a-z\s]/g, ' ')
      .trim()
      .split(/\s+/)
      .filter(w => w.length >= 4 && !STOPWORDS.has(w) && !SCHEME_BOILERPLATE.has(w));
    if (critWords.length >= 1 && critWords.length <= 2) {
      const evLower = String(evidence || '').toLowerCase();
      const hasAnyMatch = critWords.some((cw) => {
        const prefix = cw.slice(0, Math.min(4, cw.length));
        return evLower.includes(prefix);
      });
      if (!hasAnyMatch) return true;
    }
  }

  return false;
}

/**
 * Detects fabricated evidence where an LLM copied the mark-scheme criterion itself
 * (including its exact numbers/formula) instead of quoting actual text from the
 * candidate's canonical page transcript.
 */
export function isFabricatedSchemeQuote(
  criterionText: string,
  evidence: string,
  pageTranscript?: string,
  options?: { requireSequenceOnly?: boolean }
): boolean {
  const ev = String(evidence || '').trim();
  const tr = String(pageTranscript || '').trim();
  const crit = String(criterionText || '').trim();
  if (!ev || !crit || tr.length < 80) return false;

  const normEv = normalizeMathExpression(ev);
  const normCrit = normalizeMathExpression(crit);
  const normTr = normalizeMathExpression(tr);

  // If the normalized expression itself already appears verbatim in the transcript, it's genuine
  if (normEv.length >= 3 && normTr.includes(normEv)) return false;

  // Check whether the evidence closely mirrors the mark-scheme criterion
  const evWords = stemmedContentWords(ev);
  const critWords = stemmedContentWords(crit);
  const evExtracted = extractEvidenceNumbers(ev);
  const evNums = evExtracted.numbers;
  const critNums = extractEvidenceNumbers(crit).numbers;

  // On visual subparts (diagrams, graphs, clocks), only reject copied pure numeric sequences
  // (>= 4 values, no arithmetic operators) so visual prose descriptions are never stripped.
  if (options?.requireSequenceOnly && (evNums.length < 4 || evExtracted.hasArithmeticDerivation)) {
    return false;
  }

  const mirrorsFormula =
    normEv.length >= 4 &&
    (normCrit === normEv || normCrit.includes(normEv) || (normCrit.length >= 6 && normEv.includes(normCrit)));
  const wordHitRatio = evWords.length > 0
    ? evWords.filter((w) => critWords.includes(w)).length / evWords.length
    : 0;
  const numHitRatio = evNums.length > 0
    ? evNums.filter((n) => critNums.some((cn) => Math.abs(n - cn) <= 1e-5)).length / evNums.length
    : 0;

  const mirrorsCriterion =
    evNums.length > 0
      ? mirrorsFormula || (numHitRatio >= 0.85 && (evWords.length === 0 || wordHitRatio >= 0.6))
      : normEv === normCrit && ev.length >= 25;

  if (!mirrorsCriterion) return false;

  // Now check if evidence is ungrounded in the transcript
  if (evNums.length > 0) {
    const trNums = extractEvidenceNumbers(tr).numbers;
    if (evNums.length >= 4 && !evExtracted.hasArithmeticDerivation && !isOrderedSubsequence(evNums, trNums)) {
      return true;
    }
    const missingAnyNum = evNums.some((n) => !trNums.some((tn) => Math.abs(n - tn) <= 1e-5));
    return missingAnyNum;
  }

  if (evWords.length > 0) {
    const trLower = tr.toLowerCase();
    const hasAnyWord = evWords.some((w) => trLower.includes(w.slice(0, Math.min(4, w.length))));
    return !hasAnyWord;
  }

  return false;
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
  contradictedIndices: number[];
} {
  const verdictByIndex = new Map<number, boolean>();
  const evidenceByIndex = new Map<number, string>();
  const contradictedIndices: number[] = [];
  for (const v of satisfied || []) {
    verdictByIndex.set(v.criterionIndex, !!v.satisfied);
    if (v.evidence) evidenceByIndex.set(v.criterionIndex, String(v.evidence).trim());
  }

  for (const r of rubric.criteria) {
    if (verdictByIndex.get(r.index)) {
      const ev = evidenceByIndex.get(r.index) || '';
      if (isVerdictContradicted(r, ev)) {
        verdictByIndex.set(r.index, false);
        contradictedIndices.push(r.index);
      }
    }
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
      duplicateEvidenceIndices: [],
      contradictedIndices
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

  // 2b. Concept-Gated Dynamic Evidence Deduplication:
  // Only collapse duplicate/overlapping evidence between two qualitative 1-mark
  // criteria when the rubric criteria themselves share concept overlap. Distinct facts
  // packed into one compound sentence (Biology/Chemistry/History) are never collapsed.
  const isQualitativeSingleMark = (r?: RubricCriterion): boolean =>
    Boolean(r && r.value === 1 && !isCalculationCriterion(r.code, r.text));

  const acceptedEntries: Array<{ group: number; value: number; row: RubricCriterion; evidence: string }> = [];
  const duplicateEvidenceIndices: number[] = [];
  let duplicateClaimCollapses = 0;

  for (const [g, val] of groupBest.entries()) {
    const row = groupWinnerRow.get(g)!;
    const ev = groupEvidence.get(g) || '';
    if (ev && isQualitativeSingleMark(row)) {
      const dupMatch = acceptedEntries.find(
        (prev) =>
          isQualitativeSingleMark(prev.row) &&
          criteriaShareConceptOverlap(prev.row, row) &&
          areEvidenceSnippetsSameClaim(prev.evidence, ev)
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
    duplicateEvidenceIndices,
    contradictedIndices
  };
}

/** Extract a level's mark value from a descriptor like "Level 4: ... — 7–9" or "... [6]". */
function extractLevelValue(levelText: string): number | null {
  const range = levelText.match(/(\d{1,2})\s*[–-]\s*(\d{1,2})/);
  if (range) return parseInt(range[2], 10); // top of the range when the level is satisfied
  const bracketed = levelText.match(/[\[\(]\s*(\d{1,2})(?:\s*marks?)?\s*[\]\)]/i);
  if (bracketed) return parseInt(bracketed[1], 10);
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

