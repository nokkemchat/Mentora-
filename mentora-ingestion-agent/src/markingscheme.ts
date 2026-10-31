import { Extractor } from './extractor';
import * as fs from 'fs/promises';

/**
 * LOCAL MARK-SCHEME EXTRACTION (runs in the ingestion agent, not the edge function).
 * The edge function hits Supabase's WORKER_RESOURCE_LIMIT on large mark schemes
 * (e.g. 76-page History MS PDFs); the agent has no such constraint.
 * Routes through the same provider override (Caimex/OpenAI) as the rest of the agent.
 */

// Lazy singleton: created on first use, AFTER dotenv has loaded the environment
// (module-level construction crashed the agent on startup when env vars were empty).
let extractorInstance: Extractor | null = null;
function getExtractor(): Extractor {
    if (!extractorInstance) {
        const key = process.env.CAIMEX_API_KEY || process.env.OPENAI_API_KEY || '';
        const baseUrl = process.env.CAIMEX_API_KEY
            ? (process.env.CAIMEX_BASE_URL || 'https://caimex.econetai.co.zw:2052/v1')
            : undefined;
        extractorInstance = new Extractor(
            key,
            process.env.CAIMEX_API_KEY ? baseUrl : undefined, // no baseUrl on direct OpenAI
            process.env.CAIMEX_MODEL
        );
    }
    return extractorInstance;
}

interface ExtractedSolution {
    question_number: string;
    official_mark_scheme: string;
    ai_worked_solution: string;
    common_mistakes?: string;
    examiner_tips?: string;
}

async function downloadPdf(url: string, dest: string): Promise<void> {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Failed to download mark scheme: ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    await fs.writeFile(dest, buf);
}

/** Extract MS text via the same pdfjs text-layer reader used by the skeleton. */
async function extractMsText(pdfPath: string): Promise<string> {
    const mod: any = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const lib = mod.getDocument ? mod : (mod.default || mod);
    const data = new Uint8Array(await fs.readFile(pdfPath));
    const doc = await lib.getDocument({ data, useSystemFonts: true }).promise;
    let full = '';
    for (let p = 1; p <= doc.numPages; p++) {
        const page = await doc.getPage(p);
        const content = await page.getTextContent();
        for (const item of content.items as any[]) {
            if (item.str) full += item.str + (item.hasEOL ? '\n' : ' ');
        }
        full += '\n';
    }
    return full;
}

function normalizeQNum(qStr: string): string {
    if (!qStr) return '';
    return qStr.toLowerCase().replace(/^(question|q\.?|no\.?)\s*/i, '').trim();
}

export async function processMarkingSchemeLocal(opts: {
    supabase: any;
    paperId: string;
    markSchemeUrl: string;
    questionSummaries: Array<{ id: string; question_number: string; marks: number | null }>;
}): Promise<{ saved: number; details: any[] }> {
    const { supabase, paperId, markSchemeUrl, questionSummaries } = opts;
    const tmpPath = `/tmp/ms_${paperId}.pdf`;

    await downloadPdf(markSchemeUrl, tmpPath);
    const msText = await extractMsText(tmpPath);
    if (!msText || msText.trim().length < 200) {
        throw new Error('No readable text in the mark scheme PDF.');
    }
    const trimmed = msText.length > 60000 ? msText.substring(0, 60000) : msText;

    const details: any[] = [];
    let saved = 0;

    // Per-question extraction, sequential with small delay (large MS PDFs)
    for (const q of questionSummaries) {
        const systemPrompt = `You are an expert Cambridge and ZIMSEC examination marking scheme specialist.
Extract the COMPLETE official rubric for ONE question from the marking scheme text provided.

TARGET QUESTION: Question ${q.question_number} — official total: ${q.marks || 'unknown'} marks.

"official_mark_scheme" FORMAT (one line per marking point, exactly as the official scheme prints it):
(subpart) [MARKCODE] exact criteria / allowed answer

STRICT RULES:
1. ONE LINE PER marking point of the official scheme — include EVERY point, never merge or skip.
2. Preserve the EXACT criteria text, allowed answers, and level descriptions. Do NOT summarise.
3. ESSAY SUBJECTS (History etc.): the scheme uses LEVEL TABLES (e.g. Table A for part (b), Table B for part (c)).
   For those, transcribe each level row as: "(subpart) [LEVEL] Level N: <description> — <marks range>".
   Preserve the level descriptions verbatim — examiners mark against them.
4. EXACT NUMBERS: copy every number, date, and value EXACTLY as printed — never round or reformat.
5. The marks across all rows MUST accurately sum to the question's official total as specified in the scheme.
6. "ai_worked_solution": a model full-mark answer. "common_mistakes": pitfalls. "examiner_tips": guidance.

Return ONLY raw JSON:
{ "question_number": "${q.question_number}", "official_mark_scheme": "...", "ai_worked_solution": "...", "common_mistakes": "...", "examiner_tips": "..." }`;

        try {
            // Retry: the gateway occasionally 504s on long MS prompts — transient load.
            let response: any = null;
            for (let attempt = 0; attempt < 3; attempt++) {
                try {
                    response = await getExtractor().extractRubricFromText(systemPrompt, trimmed);
                    break;
                } catch (callErr: any) {
                    const msg = String(callErr?.message || callErr);
                    const isTransient = msg.includes('504') || msg.includes('timeout') || msg.includes('Timeout') || msg.includes('fetch failed') || msg.includes('ECONNRESET');
                    console.warn(`Q${q.question_number} rubric call attempt ${attempt + 1}/3 failed: ${msg.slice(0, 80)}${isTransient && attempt < 2 ? ' — retrying in 30s...' : ''}`);
                    if (!isTransient || attempt === 2) throw callErr;
                    await new Promise(r => setTimeout(r, 30000));
                }
            }
            const sol: ExtractedSolution = response;
            const { error: upsertErr } = await opts.supabase
                .from('past_paper_solutions')
                .upsert({
                    question_id: q.id,
                    official_mark_scheme: sol.official_mark_scheme || '',
                    ai_worked_solution: sol.ai_worked_solution || '',
                    common_mistakes: sol.common_mistakes || '',
                    examiner_tips: sol.examiner_tips || ''
                }, { onConflict: 'question_id' });
            if (upsertErr) {
                console.warn(`MS upsert failed for Q${q.question_number}:`, upsertErr.message);
            } else {
                saved++;
                console.log(`Mark scheme extracted for Q${q.question_number} (${(sol.official_mark_scheme || '').split('\n').length} rows).`);
            }
        } catch (qErr: any) {
            console.warn(`Mark scheme extraction failed for Q${q.question_number}:`, qErr?.message || qErr);
        }
        await new Promise(r => setTimeout(r, 300));
    }

    await fs.unlink(tmpPath).catch(() => {});
    return { saved, details };
}
