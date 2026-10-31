import * as fs from 'fs/promises';

/**
 * PHASE 0 — Text-Layer Skeleton Parser (deterministic, zero model calls).
 *
 * Parses the question paper PDF's OWN text layer into the complete question
 * skeleton: metadata hints, answer instructions, sections, question numbers,
 * part labels, PER-PART MARKS, and verbatim part text.
 *
 * The skeleton is the single source of truth for numbering / marks / text on
 * text-layer PDFs. Vision passes (page mapping + diagram extraction) attach
 * to the skeleton and never override it.
 */

let pdfjsLib: any = null;

async function getPdfjs(): Promise<any> {
    if (pdfjsLib) return pdfjsLib;
    // Robust import: pdf.mjs exposes getDocument at the top level, but some
    // module shapes (CJS interop) nest it under .default. Handle both.
    const legacy: any = await import('pdfjs-dist/legacy/build/pdf.mjs' as any);
    if (typeof legacy?.getDocument === 'function') {
        pdfjsLib = legacy;
    } else if (typeof legacy?.default?.getDocument === 'function') {
        pdfjsLib = legacy.default;
    } else {
        throw new Error('pdfjs-dist getDocument not found in import');
    }
    return pdfjsLib;
}

export interface SkeletonSubPart {
    label: string;        // e.g. 'i', 'ii'
    canonical: string;     // e.g. 'a.i' (relative to parent)
    text: string;
    marks: number | null;
}

export interface SkeletonPart {
    label: string;        // raw label, e.g. 'a', 'b'
    canonical: string;    // canonical form, e.g. 'a', 'b'
    text: string;         // verbatim printed text (the part's own prompt, excluding subpart text)
    marks: number | null; // printed bracket marks for the part itself (0 when all marks live on subparts)
    sub_parts: SkeletonSubPart[]; // roman/digit subparts (i), (ii), (1), (2)...
}

export interface SkeletonQuestion {
    number: string;          // printed question number
    section: string | null;  // section label (A/B/...) or null
    stemText: string;        // verbatim stem (the sentence(s) before part (a))
    parts: SkeletonPart[];   // ordered parts with marks
    totalPagesSpan: number[]; // 1-based page numbers where this question appears
}

export interface PaperSkeleton {
    questions: SkeletonQuestion[];
    answerInstructions: string;
    totalQuestions: number;
    usable: boolean; // false when no text layer (scanned PDF)
}

/** Build the raw line-ordered text of each page. */
async function readPages(pdfPath: string): Promise<{ pages: string[]; usable: boolean }> {
    const pdfjs = await getPdfjs();
    const data = new Uint8Array(await fs.readFile(pdfPath));
    const doc = await pdfjs.getDocument({ data, useSystemFonts: true }).promise;
    const pages: string[] = [];
    let totalLen = 0;

    for (let p = 1; p <= doc.numPages; p++) {
        const page = await doc.getPage(p);
        const content = await page.getTextContent();
        let raw = '';
        let lastY: number | null = null;
        for (const item of content.items as any[]) {
            if (!item.str) continue;
            const y = Math.round(item.transform[5]);
            if (lastY !== null && Math.abs(y - lastY) > 2) raw += '\n';
            raw += item.str;
            if (item.hasEOL) raw += '\n';
            lastY = y;
        }
        totalLen += raw.length;
        pages.push(raw);
    }
    return { pages, usable: totalLen >= 200 };
}

const canon = (label: string): string =>
    label.replace(/\(/g, '.').replace(/\)/g, '').replace(/\s+/g, '')
        .replace(/^\.+/, '').replace(/\.+$/, '').toLowerCase();

/** Parse the printed part label from a label string like 'b(i)' or 'a'. */
function parsePartLabel(raw: string): { label: string; canonical: string } | null {
    // Only lowercase part labels (a-h); roman sub-parts allowed: 'b', 'b(i)', 'b(ii)'
    // Uppercase single letters (A, B, E, F...) are usually misreads of table rows /
    // axis labels and are REJECTED.
    const m = raw.match(/^\(?([a-h](?:\s*\(\s*(?:viii|vii|vi|iv|ix|x|v|iii|ii|i)\s*\))?)\)?$/i);
    if (!m) return null;
    // Enforce lowercase: single letter must be a-h lowercase after normalisation
    const label = m[1].replace(/\s+/g, '').toLowerCase();
    if (!/^[a-h]((viii|vii|vi|iv|ix|x|v|iii|ii|i))?$/.test(label)) return null;
    return { label, canonical: canon(label) };
}

/**
 * Parse the complete skeleton from the pages' text.
 * Strategy: walk lines in order; detect section headings, question starts
 * ('N <Capital>...' or 'N (a)...'), part lines ('(a) text ... [4]'), and
 * accumulate multi-line part text until the next part/question.
 */
export function parseSkeleton(pages: string[]): SkeletonQuestion {
    const questions: SkeletonQuestion[] = [];
    const sectionOf = (line: string): string | null => {
        const m = line.match(/^\s*SECTION\s+([A-Z])/i);
        return m ? m[1].toUpperCase() : null;
    };

    let currentSection: string | null = null;
    let currentQ: SkeletonQuestion | null = null;
    let currentPart: SkeletonPart | null = null;
    let currentSub: SkeletonSubPart | null = null;
    let instructions: string[] = [];
    // Scenario-paper mode: inside an 'Additional information' block, numbered lines
    // are sub-instructions of the current question, not new questions.
    let inInfoBlock = false;

    pages.forEach((page, pageIdx) => {
        const lines = page.split('\n');
        for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) continue;

            // Section heading (SECTION A/B or 'Depth study A: ...' lines) — stops any
            // current part/subpart continuation: headings are NEVER question content.
            const sec = sectionOf(trimmed);
            const depthStudy = trimmed.match(/^(?:SECTION\s+[A-Z]|Depth\s+stud(?:y|ies)\s+[A-Z])/i);
            if (sec || depthStudy) {
                currentSection = sec || currentSection;
                currentPart = null;
                currentSub = null;
                continue;
            }

            // Footer/page furniture — never question content (stops junk leaking into
            // the last subpart of a page's final question).
            if (/^\d{1,2}$/.test(trimmed) || /^05\d{3}\/|^\[Turn over|^© ?Cambridge|^\[Total:/i.test(trimmed)) {
                currentPart = null;
                currentSub = null;
                continue;
            }

            // Answer instructions (cover page)
            if (/answer\s+(all|any|three|two|four|five|six)/i.test(trimmed) && !currentQ) {
                instructions.push(trimmed);
                continue;
            }

            // Answer/dotted line carrying marks: '$ ............ [1]' / '...... [2]'
            // — attach its bracket to the nearest subpart/part, never a new part.
            const answerMark = trimmed.match(/\.{2,}\s*\[(\d{1,2})\]/);
            if (answerMark && (currentSub || currentPart) && !/^\(/.test(trimmed)) {
                const m = parseInt(answerMark[1], 10);
                if (currentSub) {
                    if (currentSub.marks === null) currentSub.marks = m;
                } else if (currentPart && currentPart.marks === null) {
                    currentPart.marks = m;
                }
                continue;
            }

            // Question start: '1 (a) The cost...' or '7 After the Second World War...'
            // SCENARIO PAPERS (Accounting etc.): questions open with a business scenario
            // whose data items are NUMBERED ('1 Bank statements...', '2 Amounts...').
            // These appear AFTER the question stem and BEFORE its first (a) part —
            // so while the current question has a stem but NO parts yet, numbered
            // lines are scenario data, not new questions.
            if (/^(?:additional\s+information|the\s+following\s+information)/i.test(trimmed)) {
                inInfoBlock = true;
            }
            const qStart = trimmed.match(/^(\d{1,2})\s+(?=\(|[A-Z\u2018\u2019""])/);
            const scenarioGuard = !!(currentQ && currentQ.stemText && currentQ.parts.length === 0);
            if (qStart && !inInfoBlock && !scenarioGuard) {
                const qn = qStart[1];
                const n = parseInt(qn, 10);
                if (n >= 1 && n <= 40 && !questions.some(q => q.number === qn)) {
                    currentQ = {
                        number: qn,
                        section: currentSection,
                        stemText: '',
                        parts: [],
                        totalPagesSpan: [pageIdx + 1]
                    };
                    questions.push(currentQ);
                    const rest = trimmed.slice(qStart[0].length).trim();
                    const partMatch = rest.match(/^\(?([a-h])\)?\s+(.*)/i);
                    if (partMatch && parsePartLabel(partMatch[1])) {
                        const parsed = parsePartLabel(partMatch[1])!;
                        currentPart = { label: parsed.label, canonical: parsed.canonical, text: partMatch[2].trim(), marks: null, sub_parts: [] };
                        currentQ.parts.push(currentPart);
                        currentSub = null;
                    } else if (rest) {
                        currentQ.stemText = rest;
                        currentPart = null;
                        currentSub = null;
                    }
                    continue;
                }
            }

            if (!currentQ) continue;

            // Roman/digit subpart line: '(i) Work out...' — nested under the current part.
            const subMatch = trimmed.match(/^\(?((?:viii|vii|vi|iv|ix|x|v|iii|ii|i)|[1-9])\)?\s+(.*)$/i);
            if (subMatch && currentPart && currentPart.sub_parts.length < 12) {
                currentSub = {
                    label: subMatch[1].toLowerCase(),
                    canonical: `${currentPart.canonical}.${subMatch[1].toLowerCase()}`,
                    text: subMatch[2].trim(),
                    marks: null
                };
                currentPart.sub_parts.push(currentSub);
                continue;
            }

            // Part start: '(b) The cinema has 650 seats.' — also EXITS an information
            // block: the answerable tasks resume after the scenario data.
            const partStart = trimmed.match(/^\(?([a-h])\)?\s+(.*)/i);
            if (partStart && parsePartLabel(partStart[1]) && !/^\(\s*\)/.test(trimmed)) {
                inInfoBlock = false; // a part instruction ends the information block
                const parsed = parsePartLabel(partStart[1])!;
                currentPart = {
                    label: parsed.label,
                    canonical: parsed.canonical,
                    text: partStart[2].trim(),
                    marks: null,
                    sub_parts: []
                };
                currentQ.parts.push(currentPart);
                currentSub = null;
                continue;
            }

            // Continuation text: append to the current subpart, part, or stem
            if (currentSub) {
                currentSub.text = (currentSub.text + ' ' + trimmed).trim();
            } else if (currentPart) {
                currentPart.text = (currentPart.text + ' ' + trimmed).trim();
            } else if (currentQ) {
                currentQ.stemText = (currentQ.stemText + ' ' + trimmed).trim();
            }
        }
    });

    // Second pass: clean + extract trailing bracket marks from each part/subpart text
    const stripLeaks = (t: string): string => {
        let out = t.trim();
        // Cut mid-text leaks FIRST (before mark extraction): the heading often
        // FOLLOWS the [marks] bracket on the same line, e.g.
        //   '...Explain your answer. [10] Depth study B: Germany, 1918-45'
        // The bracket belongs to the part; everything from the heading onward is junk.
        const leakIdx = out.search(/\s(?:Depth\s+stud(?:y|ies)\s+[A-Z](?![a-z])|SECTION\s+[A-Z]\b|\[Turn over\]|©\s*Cambridge)/i);
        if (leakIdx > 0) out = out.slice(0, leakIdx).trim();
        return out;
    };
    const cleanText = (t: string): string => {
        let out = t.trim();
        // Normalize smart quotes to plain ASCII quotes (cleaner rendering everywhere;
        // they are meaningful punctuation in essay questions like 'How far...').
        out = out.replace(/[\u2018\u2019]/g, "'").replace(/[\u201C\u201D]/g, '"');
        return out.trim();
    };
    for (const q of questions) {
        q.stemText = cleanText(stripLeaks(q.stemText));
        for (const p of q.parts) {
            const tailMark = (rawText: string): { text: string; marks: number | null } => {
                const t = stripLeaks(rawText);
                const m = t.match(/\[(\d{1,2})\]\s*$/);
                if (m) return { text: t.replace(/\s*\[\d{1,2}\]\s*$/, '').trim(), marks: parseInt(m[1], 10) };
                return { text: t, marks: null };
            };
            const own = tailMark(p.text);
            p.text = cleanText(own.text);
            if (p.marks === null) p.marks = own.marks;
            for (const sp of p.sub_parts) {
                const s = tailMark(sp.text);
                sp.text = cleanText(s.text);
                if (sp.marks === null) sp.marks = s.marks;
            }
        }
    }

    // Marks-completion pass: exam papers ALWAYS print a bracket [n] after each part's
    // answer space, but text-layer line reconstruction sometimes separates them from
    // the part line. Walk the raw page text in order; whenever a bracket mark appears
    // that has not been claimed by any part/subpart yet, assign it to the most recent
    // part/subpart still missing its marks (print order guarantees correctness).
    {
        const flatText = pages.join('\n');
        const claimed = new Set<string>(); // 'q|p' or 'q|p|s' keys of parts WITH marks
        for (const q of questions) {
            for (const p of q.parts) {
                if (p.marks !== null) claimed.add(`${q.number}|${p.canonical}`);
                for (const sp of p.sub_parts) {
                    if (sp.marks !== null) claimed.add(`${q.number}|${sp.canonical}`);
                }
            }
        }
        // Find every bracket mark in print order with its position
        const bracketMarks = [...flatText.matchAll(/\[(\d{1,2})\]/g)];
        // Build an ordered list of ALL parts/subparts (document order via their text position)
        const orderedParts: { q: SkeletonQuestion; p: SkeletonPart; sp: SkeletonSubPart | null; pos: number }[] = [];
        for (const q of questions) {
            for (const p of q.parts) {
                orderedParts.push({ q, p, sp: null, pos: flatText.indexOf(p.text.slice(0, 40)) });
                for (const sp of p.sub_parts) {
                    orderedParts.push({ q, p, sp, pos: flatText.indexOf(sp.text.slice(0, 40)) });
                }
            }
        }
        orderedParts.sort((a, b) => a.pos - b.pos);
        // Assign unclaimed bracket marks in order to the next part missing marks
        let partIdx = 0;
        for (const bm of bracketMarks) {
            const m = parseInt(bm[1], 10);
            // advance to the next part missing marks
            while (partIdx < orderedParts.length) {
                const entry = orderedParts[partIdx];
                const key = entry.sp ? `${entry.q.number}|${entry.sp.canonical}` : `${entry.q.number}|${entry.p.canonical}`;
                const hasMarks = entry.sp ? entry.sp.marks !== null : entry.p.marks !== null;
                if (hasMarks) { partIdx++; continue; }
                // only take marks that appear AFTER this part's text position
                if (bm.index >= entry.pos) {
                    if (entry.sp) entry.sp.marks = m; else entry.p.marks = m;
                    partIdx++;
                }
                break;
            }
        }
    }

    // === NOISE SANITIZER ===
    // pdfjs line reconstruction can create phantom parts (duplicate labels, label
    // misreads like 'x'). Exam parts follow a strict sequence (a, b, c, d...) within a
    // question. Enforce it: keep only labels that advance the expected sequence, in
    // order; drop everything else. Subparts likewise must be roman/digit sequences.
    for (const q of questions) {
        const cleanedParts: SkeletonPart[] = [];
        let nextLetter = 'a';
        for (const p of q.parts) {
            if (p.label === nextLetter) {
                cleanedParts.push(p);
                nextLetter = String.fromCharCode(nextLetter.charCodeAt(0) + 1);
            } else if (p.label < nextLetter && p.label >= 'a' && /^[a-h]$/.test(p.label)) {
                // An out-of-order label AFTER real parts exist = misread line — merge back
                const prev = cleanedParts[cleanedParts.length - 1];
                prev.text = (prev.text + ' ' + p.text).trim();
                for (const sp of p.sub_parts) {
                    if (/^(viii|vii|vi|iv|ix|x|v|iii|ii|i|[1-9])$/.test(sp.label)) prev.sub_parts.push(sp);
                }
                if (prev.marks === null && p.marks !== null) prev.marks = p.marks;
            } else if (cleanedParts.length > 0) {
                // A label BEYOND the expected sequence (e.g. 'e' when expecting 'b'):
                // the sequence may have been broken by a mislabeled line — accept the
                // jump only if it skips at most one letter (likely one lost part).
                const expected = nextLetter;
                const skipped = p.label.charCodeAt(0) - expected.charCodeAt(0);
                if (skipped === 1 || skipped === 0) {
                    cleanedParts.push(p);
                    nextLetter = String.fromCharCode(p.label.charCodeAt(0) + 1);
                } else {
                    const prev = cleanedParts[cleanedParts.length - 1];
                    prev.text = (prev.text + ' ' + p.text).trim();
                    for (const sp of p.sub_parts) {
                        if (/^(viii|vii|vi|iv|ix|x|v|iii|ii|i|[1-9])$/.test(sp.label)) prev.sub_parts.push(sp);
                    }
                    if (prev.marks === null && p.marks !== null) prev.marks = p.marks;
                }
            } else {
                q.stemText = (q.stemText + ' ' + p.text).trim();
            }
        }
        // Deduplicate subparts within each part (same roman label twice = misread)
        for (const p of cleanedParts) {
            const seen = new Set<string>();
            p.sub_parts = p.sub_parts.filter(sp => {
                if (!/^(viii|vii|vi|iv|ix|x|v|iii|ii|i|[1-9])$/.test(sp.label)) return false;
                if (seen.has(sp.label)) {
                    // merge duplicate subpart text into the first
                    const first = p.sub_parts.find(s => s.label === sp.label);
                    if (first) first.text = (first.text + ' ' + sp.text).trim();
                    return false;
                }
                seen.add(sp.label);
                return true;
            });
        }
        q.parts = cleanedParts;
        // Drop questions with no parts and no stem (pure noise)
    }
    const beforeDrop = questions.length;
    const keptQuestions = questions.filter(q => q.parts.length > 0 || (q.stemText && q.stemText.length > 10));
    if (keptQuestions.length !== beforeDrop) {
        console.log(`Skeleton sanitizer: dropped ${beforeDrop - keptQuestions.length} noise question(s).`);
    }
    questions.length = 0;
    questions.push(...keptQuestions);
    return {
        questions,
        answerInstructions: instructions.join('\n'),
        totalQuestions: questions.length,
        usable: true
    };
}

/** Read the PDF and build the skeleton. Returns usable:false for scanned PDFs. */
export async function buildSkeleton(pdfPath: string): Promise<PaperSkeleton> {
    try {
        const { pages, usable } = await readPages(pdfPath);
        if (!usable) {
            return { questions: [], answerInstructions: '', totalQuestions: 0, usable: false };
        }
        const skeleton = parseSkeleton(pages);
        skeleton.usable = true;
        return skeleton;
    } catch (err) {
        console.warn('buildSkeleton: text layer unavailable:', (err as Error).message);
        return { questions: [], answerInstructions: '', totalQuestions: 0, usable: false };
    }
}
