import * as fs from 'fs/promises';

/**
 * Text-layer anchor: extracts the EXPECTED part labels per question directly from
 * the question paper PDF's text layer. This gives a ground-truth checklist of
 * subparts (e.g. Q4 -> ['(a)', '(b)(i)', '(b)(ii)', '(c)']) that does NOT depend on
 * the vision model — used to validate Phase 2's per-question extraction.
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

export interface QuestionAnchor {
    number: string;
    partLabels: string[];
    totalPages: number;
}

/** Clean a label like '(b)(i)' or 'a' to a canonical bare form 'b.i' */
function canonicalLabel(label: string): string {
    return label
        .replace(/\(/g, '.')
        .replace(/\)/g, '')
        .replace(/\s+/g, '')
        .replace(/^\.+/, '')
        .replace(/\.+$/, '')
        .toLowerCase();
}

/** Parse 'N (a) text...' / 'N(a)(i) ...' patterns out of raw page text. */
function extractLabelsFromText(raw: string): Map<string, Map<string, string>> {
    const byQuestion = new Map<string, Map<string, string>>();
    const text = raw.replace(/\r/g, '');

    for (const line of text.split('\n')) {
        // Major question start: '4 (a) ...' or '4 In 1848 ...'
        const qStart = line.match(/^\s*(\d{1,2})\s+(?=\(|[A-Z\u2018\u2019"])/);
        if (qStart) {
            const qn = qStart[1];
            if (!byQuestion.has(qn)) byQuestion.set(qn, new Map());
        }

        // Part labels with their text: '(a) What changes were introduced...' /
        // '(b)(i) Work out the total cost...'
        const partMatches = [...line.matchAll(/\((\s*[a-h]\s*(?:\)\s*\(\s*[ivx]+\s*)?)\)\s*(.*)/g)];
        for (const m of partMatches) {
            const qn = findOwningQuestion(text, line);
            if (!qn) continue;
            if (!byQuestion.has(qn)) byQuestion.set(qn, new Map());
            const label = m[1].replace(/\s+/g, '');
            const partText = (m[2] || '').trim();
            const existing = byQuestion.get(qn)!;
            // Keep the longest text seen for this label (some lines split mid-part)
            if (!existing.has(label) || partText.length > existing.get(label)!.length) {
                existing.set(label, partText.slice(0, 300));
            }
        }
    }
    return byQuestion;
}

function findOwningQuestion(fullText: string, line: string, byQuestion?: Map<string, any>): string | null {
    // Determine the question by scanning backwards from this line's position for
    // the last 'N (a)' or 'N <Capital>' question-start marker.
    const idx = fullText.indexOf(line);
    if (idx === -1) return null;
    const before = fullText.slice(0, idx);
    const markers = [...before.matchAll(/(?:^|\n)\s*(\d{1,2})\s+(?=\(|[A-Z\u2018\u2019"])/g)];
    if (markers.length === 0) return null;
    const last = markers[markers.length - 1];
    const qn = last[1];
    if (byQuestion && !byQuestion.has(qn)) byQuestion.set(qn, new Map());
    return qn;
}

/**
 * Extract expected part labels per question from the PDF text layer.
 * Returns null when the PDF has no usable text layer (scanned PDFs) — the caller
 * must treat this as "no anchor available" and skip the completeness check.
 */
export async function extractQuestionAnchors(pdfPath: string): Promise<Map<string, string[]> | null> {
    try {
        const pdfjs = await getPdfjs();
        const data = new Uint8Array(await fs.readFile(pdfPath));
        const doc = await pdfjs.getDocument({ data, useSystemFonts: true }).promise;
        const totalPages = doc.numPages;

        const byQuestion = new Map<string, Map<string, string>>();
        let totalTextLength = 0;

        for (let p = 1; p <= totalPages; p++) {
            const page = await doc.getPage(p);
            const content = await page.getTextContent();
            // Reconstruct lines using y-coordinates (items are roughly line-ordered already)
            let raw = '';
            let lastY: number | null = null;
            for (const item of content.items as any[]) {
                if (!item.str) continue;
                const y = Math.round(item.transform[5]);
                if (lastY !== null && Math.abs(y - lastY) > 2) {
                    raw += '\n';
                }
                raw += item.str;
                if (item.hasEOL) raw += '\n';
                lastY = y;
            }
            totalTextLength += raw.length;
            const labels = extractLabelsFromText(raw);
            for (const [qn, inner] of labels) {
                if (!byQuestion.has(qn)) byQuestion.set(qn, new Map());
                inner.forEach((txt: string, label: string) => {
                    const existing = byQuestion.get(qn)!;
                    if (!existing.has(label) || txt.length > existing.get(label)!.length) {
                        existing.set(label, txt.slice(0, 300));
                    }
                });
            }
        }

        // Scanned PDF guard: no meaningful text layer
        if (totalTextLength < 200) return null;

        const result = new Map<string, string[]>();
        for (const [qn, inner] of byQuestion) {
            result.set(qn, [...inner.keys()]);
        }
        // Side-channel: the actual printed TEXT of each subpart, keyed 'qn|||label',
        // used by the escalation to search for the real content on full pages.
        const textMap = new Map<string, string>();
        for (const [qn, inner] of byQuestion) {
            inner.forEach((txt: string, label: string) => {
                textMap.set(`${qn}|||${label}`, txt);
            });
        }
        // Attach via a module-level export so callers can look up subpart text
        lastAnchorTexts = textMap;
        return result;
    } catch (err) {
        console.warn('extractQuestionAnchors: text layer unavailable:', (err as Error).message);
        return null;
    }
}

/** Printed text per subpart (keyed 'questionNumber|||label') from the last anchor extraction. */
export let lastAnchorTexts = new Map<string, string>();

/** Look up the printed text for a question's subpart label (e.g. '4' + 'a' -> text). */
export function getAnchorSubpartText(questionNumber: string, canonicalLabel: string): string | null {
    // The anchor keys labels in raw form ('a', 'b(i)'); canonical form uses dots.
    // Try the canonical key first, then common raw variants.
    for (const [key, txt] of lastAnchorTexts.entries()) {
        const [qn, label] = key.split('|||');
        if (qn === questionNumber) {
            const canon = label.replace(/\(/g, '.').replace(/\)/g, '').replace(/\s+/g, '').toLowerCase();
            if (canon === canonicalLabel) return txt;
        }
    }
    return null;
}

/** Recursively collect all part labels present in a Phase 2 extraction. */
export function collectExtractedLabels(detailedQ: any): Set<string> {
    const found = new Set<string>();
    const walk = (parts: any[]) => {
        for (const p of parts || []) {
            const label = String(p?.label || '').trim();
            if (label) found.add(canonicalLabel(label));
            if (Array.isArray(p?.sub_parts) && p.sub_parts.length > 0) walk(p.sub_parts);
        }
    };
    walk(detailedQ?.parts || []);
    return found;
}

/** Canonicalise the anchor labels for comparison with extracted labels. */
export function canonicalAnchorLabels(labels: string[]): Set<string> {
    const set = new Set<string>();
    for (const l of labels) set.add(canonicalLabel(l));
    return set;
}
