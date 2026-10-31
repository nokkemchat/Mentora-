import * as http from 'http';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as fs from 'fs/promises';
import * as path from 'path';
import { Extractor, ExtractedQuestionPart } from './extractor';
import { Cropper } from './cropper';
import { extractQuestionAnchors, collectExtractedLabels, canonicalAnchorLabels, getAnchorSubpartText } from './anchors';
import { buildSkeleton } from './skeleton';
import { processMarkingSchemeLocal } from './markingscheme';

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const openAiKey = process.env.OPENAI_API_KEY || '';

if (!supabaseUrl || !supabaseKey) {
    console.error('Missing required environment variables.');
    process.exit(1);
}

// === TEMPORARY PROVIDER OVERRIDE (Caimex gateway) ===
// When CAIMEX_API_KEY is set, all OpenAI calls are routed through the Caimex
// OpenAI-compatible gateway instead of api.openai.com — without removing the
// existing OpenAI key from the environment. When unset, behavior is unchanged.
export const CAIMEX_BASE_URL = process.env.CAIMEX_BASE_URL || 'https://caimex.econetai.co.zw:2052/v1';
export const CAIMEX_ACTIVE = !!(process.env.CAIMEX_API_KEY);
const effectiveApiKey = CAIMEX_ACTIVE ? process.env.CAIMEX_API_KEY! : openAiKey;
const effectiveBaseUrl = CAIMEX_ACTIVE ? CAIMEX_BASE_URL : 'https://api.openai.com/v1';
if (CAIMEX_ACTIVE) {
    console.log(`Provider override ACTIVE: routing OpenAI-compatible calls through the Caimex gateway (${CAIMEX_BASE_URL}).`);
}

const supabase: SupabaseClient = createClient(supabaseUrl, supabaseKey);
// Pass baseUrl ONLY when a gateway override is active — the extractor uses its
// presence to decide whether attachment-cap batching is needed (direct OpenAI has
// no 16-image limit, and single-call slicing is more reliable).
const extractor = new Extractor(effectiveApiKey, CAIMEX_ACTIVE ? effectiveBaseUrl : undefined, process.env.CAIMEX_MODEL);
const cropper = new Cropper();

const POLL_INTERVAL = 5000;

// Retry helper: OpenAI vision calls occasionally time out mid-pipeline, which would
// otherwise silently drop a question (and its assets) from the extracted paper.
async function withRetry<T>(fn: () => Promise<T>, attempts = 3, delayMs = 8000): Promise<T> {
    let lastErr: any;
    for (let i = 0; i < attempts; i++) {
        try {
            return await fn();
        } catch (err: any) {
            lastErr = err;
            console.warn(`Attempt ${i + 1}/${attempts} failed: ${err?.message || err}${i < attempts - 1 ? ` — retrying in ${delayMs / 1000}s...` : ''}`);
            if (i < attempts - 1) await new Promise(r => setTimeout(r, delayMs));
        }
    }
    throw lastErr;
}

async function checkJobs() {
    try {
        const { data: jobs, error } = await supabase
            .from('ingestion_jobs')
            .select('*, papers(*)')
            .eq('status', 'uploaded')
            .order('created_at', { ascending: true })
            .limit(1);

        if (error) {
            console.error('Error fetching jobs:', error);
            return;
        }

        if (jobs && jobs.length > 0) {
            const job = jobs[0];
            await processJob(job);
        }
    } catch (err) {
        console.error('Unexpected error checking jobs:', err);
    }
}

/** Trigger mark-scheme extraction. Uses the LOCAL extractor (no edge-function
 * compute limits) when the paper's questions are known; falls back to the edge
 * function only if the local path throws. */
async function triggerMarkingScheme(job: any, msUrl: string | null | undefined): Promise<void> {
    const url = msUrl || job?.mark_scheme_url || job?.papers?.mark_scheme_url;
    if (!url) return;
    try {
        console.log(`Extracting marking scheme locally for paper ${job.paper_id}...`);
        const { data: qs } = await supabase
            .from('past_paper_questions')
            .select('id, question_number, marks')
            .eq('paper_id', job.paper_id)
            .order('question_number', { ascending: true });
        if (!qs || qs.length === 0) {
            console.warn('No questions stored — skipping local mark-scheme extraction.');
            return;
        }
        const result = await processMarkingSchemeLocal({
            supabase,
            paperId: job.paper_id,
            markSchemeUrl: url,
            questionSummaries: qs
        });
        console.log(`Local mark-scheme extraction complete: ${result.saved}/${qs.length} rubrics saved.`);
    } catch (localErr: any) {
        console.warn('Local mark-scheme extraction failed, falling back to the edge function:', localErr?.message || localErr);
        try {
            await supabase.functions.invoke('process-marking-scheme', {
                body: { paper_id: job.paper_id, mark_scheme_url: url }
            });
            console.log(`Fallback: invoked process-marking-scheme for paper ${job.paper_id}`);
        } catch (msErr) {
            console.warn('Could not trigger process-marking-scheme:', msErr);
        }
    }
}

async function processJob(job: any) {
    console.log(`Processing job ${job.id} for paper ${job.paper_id}`);
    // markSchemeUrl is resolved per job (payload > paper row) and reused by both paths
    const markSchemeUrl: string | null = job?.mark_scheme_url || job?.papers?.mark_scheme_url || null;
    
    await supabase.from('ingestion_jobs').update({ status: 'processing' }).eq('id', job.id);

    let pdfPath = '';
    try {
        const paper = job.papers;
        if (!paper || !paper.pdf_url) {
            throw new Error("Paper does not have a valid PDF URL.");
        }

        pdfPath = await downloadPdf(paper.pdf_url, job.id);
        
        await supabase.from('ingestion_jobs').update({ status: 'extracting' }).eq('id', job.id);
        console.log(`Rendering PDF pages to images for ${job.id}...`);
        
        const pageImages = await cropper.renderAllPages(pdfPath, job.id);

        // Deterministic numbering guard: exam question numbers must form a contiguous
        // 1..N sequence matching the printed question count. (Defined before its use.)
        const validateNumbering = (sp: any): { ok: boolean; problems: string[] } => {
            const problems: string[] = [];
            const rawQuestions: any[] = sp?.questions || [];
            const nums = rawQuestions.map((q: any) => parseInt(String(q?.number || '').match(/\d+/)?.[0] || '0', 10)).filter((n: number) => n > 0);
            if (nums.length === 0) {
                return { ok: false, problems: ['No questions detected at all.'] };
            }
            const expectedTotal = Number(sp?.total_questions_count) || Math.max(...nums);
            const sorted = [...nums].sort((a: number, b: number) => a - b);
            const seen = new Set<number>();
            const dups = nums.filter((n: number) => seen.has(n) || (seen.add(n), false));
            if (dups.length > 0) problems.push(`Duplicate question numbers: ${dups.join(', ')}`);
            for (let i = 1; i <= Math.max(...sorted); i++) {
                if (!nums.includes(i)) problems.push(`Missing question number ${i} (gap in sequence)`);
            }
            if (sorted[sorted.length - 1] > expectedTotal) {
                problems.push(`Question number ${sorted[sorted.length - 1]} exceeds the paper's total question count (${expectedTotal}) — page numbers were likely misread as question numbers`);
            }
            if (rawQuestions.length !== expectedTotal && expectedTotal > 0) {
                problems.push(`Detected ${rawQuestions.length} questions but the paper prints ${expectedTotal} — the extra entries are likely sub-options (essay choices) or section headings over-split into separate questions`);
            }
            return { ok: problems.length === 0, problems };
        };

        // === RESTORED VISION-FIRST PIPELINE ===
        // Phase 1 (slicing) is the structure source for ALL papers — format-agnostic
        // (the model sees any layout: prose, scenario, tables, any board). The text-layer
        // skeleton is still built but used ONLY for validation/enrichment (marks
        // backfill), never as a gate. Batching handles the gateway's 16-attachment cap.
        console.log(`Phase 1: Extracting structure via OpenAI for ${job.id}...`);
        let slicedPaper = await withRetry(() => extractor.extractPaperStructureSlices(pageImages));
        {
            const check = validateNumbering(slicedPaper);
            if (!check.ok) {
                console.warn(`Phase 1 numbering check FAILED — retrying once. Problems: ${check.problems.join('; ')}`);
                const retry = await withRetry(() => extractor.extractPaperStructureSlices(pageImages));
                const retryCheck = validateNumbering(retry);
                if (retryCheck.ok || retryCheck.problems.length < check.problems.length) {
                    console.log(`Phase 1 retry numbering: ${retryCheck.ok ? 'CLEAN' : `improved (${retryCheck.problems.length} problems)`}`);
                    slicedPaper = retry;
                } else {
                    console.warn('Phase 1 retry did not improve numbering; keeping first result.');
                }
            }
        }

        // Text-layer skeleton: VALIDATION + ENRICHMENT only (never gates the pipeline).
        // Used further below to backfill printed part marks the vision pass missed.
        const earlySkeleton = await buildSkeleton(pdfPath);
        if (earlySkeleton.usable && earlySkeleton.questions.length > 0) {
            console.log(`Text-layer skeleton available for validation: ${earlySkeleton.questions.length} questions (vision result: ${(slicedPaper.questions || []).length}).`);
        }

        // === OVER-SPLIT REPAIR (deterministic) ===
        // If the model still returned MORE questions than the printed total_questions_count,
        // the extras are sub-options/essay-choices that belong to the real questions.
        // Deterministic repair: keep only the entries whose numbers form the expected
        // contiguous 1..N run (first occurrence per number, in order); merge the extra
        // entries' page_slices into the real question that shares their page span — the
        // sub-options then get extracted as PARTS of that question by Phase 2.
        {
            const printedTotal = Number(slicedPaper?.total_questions_count) || 0;
            const detected: any[] = slicedPaper?.questions || [];
            if (printedTotal > 0 && detected.length > printedTotal) {
                console.log(`Over-split repair: ${detected.length} detected vs ${printedTotal} printed questions — merging extras into their parent questions.`);
                const kept: any[] = [];
                const usedNumbers = new Set<string>();
                // First pass: keep the first entry for each expected question number 1..N
                for (let n = 1; n <= printedTotal; n++) {
                    const ns = String(n);
                    const entry = detected.find((q: any) => String(q?.number || '').trim() === ns);
                    if (entry) {
                        kept.push(entry);
                        usedNumbers.add(ns);
                    }
                }
                // Second pass: merge every remaining entry into the question that
                // shares any page with it (its sub-options belong to that question)
                const extras = detected.filter((q: any) => !usedNumbers.has(String(q?.number || '').trim()));
                for (const extra of extras) {
                    const extraPages = (extra?.page_slices || []).map((s: any) => Number(s.page_number));
                    const target = kept.find((k: any) => {
                        const kPages = (k?.page_slices || []).map((s: any) => Number(s.page_number));
                        return extraPages.some((p: number) => kPages.includes(p));
                    });
                    if (target) {
                        if (!Array.isArray(target.page_slices)) target.page_slices = [];
                        for (const sl of extra.page_slices || []) {
                            // Avoid duplicate page slices
                            const already = target.page_slices.some((s: any) => Number(s.page_number) === Number(sl.page_number));
                            if (!already) target.page_slices.push(sl);
                        }
                        if (extra.section && !target.section) target.section = extra.section;
                    }
                }
                slicedPaper.questions = kept;
                console.log(`Over-split repair complete: ${kept.length} questions (extras merged as parts).`);
            }
        }

        // === BIG-PAPER SANITIZER (deterministic, code-level) ===
        // 1. Drop pseudo-questions extracted from SECTION HEADINGS ("SECTION B: DEPTH
        //    STUDIES", "Answer one question from this section" — content is heading text,
        //    not a question).
        // 2. Drop exact duplicate content (same text extracted twice from big pages).
        const isHeadingPseudoQuestion = (q: any): boolean => {
            const num = String(q?.number || '').trim().toUpperCase();
            if (num.startsWith('SECTION') || num.startsWith('PART') || num.startsWith('ANSWER')) return true;
            // Also inspect the first slice's likely content via the question "number" field
            // misused by some models to hold the heading text itself.
            return false;
        };
        const seenContent = new Set<string>();
        const before = slicedPaper.questions.length;
        slicedPaper.questions = (slicedPaper.questions || []).filter((q: any) => {
            if (isHeadingPseudoQuestion(q)) {
                console.log(`Sanitizer: dropping section-heading pseudo-question "${String(q.number).slice(0, 50)}"`);
                return false;
            }
            return true;
        });
        if (slicedPaper.questions.length !== before) {
            console.log(`Sanitizer: ${before - slicedPaper.questions.length} pseudo-question(s) dropped, ${slicedPaper.questions.length} remain.`);
        }
        
        // Update paper metadata
        if (slicedPaper.metadata) {
            console.log("Metadata extracted by Phase 1:", slicedPaper.metadata);
            const { error: updateError } = await supabase.from('papers').update({
                curriculum: slicedPaper.metadata.curriculum || 'Unknown',
                subject: slicedPaper.metadata.subject || 'Unknown',
                grade_level: slicedPaper.metadata.grade_level || 'Unknown',
                year: slicedPaper.metadata.year || new Date().getFullYear(),
                session: slicedPaper.metadata.session || 'Unknown',
                paper_number: slicedPaper.metadata.paper_number || 1,
                variant: slicedPaper.metadata.variant || null,
                // Section-based answer rules from the cover page (e.g. "Answer all in
                // Section A and any FOUR from Section B"). Null for plain "answer all" papers.
                answer_rules: slicedPaper.answer_rules && slicedPaper.answer_rules.sections && slicedPaper.answer_rules.sections.length > 0
                    ? slicedPaper.answer_rules
                    : (slicedPaper.answer_rules && slicedPaper.answer_rules.default_rule === 'any'
                        ? slicedPaper.answer_rules
                        : null)
            }).eq('id', job.paper_id);

            if (updateError) {
                console.error("Failed to update paper metadata in database:", updateError);
                if ((updateError.message || '').includes('answer_rules')) {
                    console.warn('answer_rules column missing — saving paper without answer rules.');
                }
            } else {
                console.log("Successfully updated paper metadata in database.");
                if (slicedPaper.answer_instructions) {
                    console.log(`Answer instructions: "${slicedPaper.answer_instructions}"`);
                }
            }
        } else {
            console.warn("Phase 1 did not return metadata!");
        }

        let syllabusHierarchy: Record<string, string[]> | null = null;
        if (slicedPaper.metadata) {
            console.log("Cross-referencing syllabus for:", slicedPaper.metadata);
            const subjectQuery = (slicedPaper.metadata.subject || '').trim();
            const boardQuery = (slicedPaper.metadata.curriculum || '').trim();
            const levelQuery = (slicedPaper.metadata.grade_level || '').trim();
            
            const { data: matchedCourses, error: courseError } = await supabase
                .from('courses')
                .select('id, title, board, level')
                .ilike('title', `%${subjectQuery}%`)
                .ilike('board', `%${boardQuery}%`)
                .ilike('level', `%${levelQuery}%`)
                .limit(1);

            if (courseError) {
                console.error("Error querying courses:", courseError);
            } else if (matchedCourses && matchedCourses.length > 0) {
                const courseId = matchedCourses[0].id;
                console.log(`Found matching syllabus (ID: ${courseId}). Fetching topics and subtopics...`);
                
                const { data: topicsData, error: topicsError } = await supabase
                    .from('topics')
                    .select('id, title')
                    .eq('course_id', courseId);
                    
                if (topicsError) {
                    console.error("Error fetching topics:", topicsError);
                } else if (topicsData && topicsData.length > 0) {
                    const topicIds = topicsData.map(t => t.id);
                    const { data: subtopicsData } = await supabase
                        .from('subtopics')
                        .select('topic_id, title')
                        .in('topic_id', topicIds);
                    
                    syllabusHierarchy = {};
                    for (const topic of topicsData) {
                        const subs = subtopicsData?.filter(s => s.topic_id === topic.id).map(s => s.title) || [];
                        syllabusHierarchy[topic.title] = subs;
                    }
                    console.log(`Successfully loaded ${Object.keys(syllabusHierarchy).length} syllabus topics with their subtopics!`);
                } else {
                    console.log("No topics found for the matched syllabus.");
                }
            } else {
                console.log("No matching syllabus found for this paper.");
            }
        }

        // Clean existing questions and assets to prevent duplicates
        const { data: oldQs } = await supabase.from('past_paper_questions').select('id').eq('paper_id', job.paper_id);
        if (oldQs && oldQs.length > 0) {
            const oldQIds = oldQs.map(q => q.id);
            await supabase.from('question_assets').delete().in('question_id', oldQIds);
        }
        await supabase.from('past_paper_questions').delete().eq('paper_id', job.paper_id);

        console.log(`Phase 2: Extracting detailed nested questions...`);

        // === PHASE 0: TEXT-LAYER SKELETON (deterministic, single source of truth) ===
        // When the PDF has a text layer, the skeleton defines EVERYTHING structural:
        // question numbers, sections, part labels, per-part marks, and verbatim text.
        // Vision passes then only attach page spans + diagram assets. Scanned PDFs
        // (usable=false) fall back to the legacy vision-first pipeline.
        const skeleton = await buildSkeleton(pdfPath);
        if (skeleton.usable && skeleton.questions.length > 0) {
            const totalParts = skeleton.questions.reduce((s, q) => s + q.parts.length, 0);
            const withMarks = skeleton.questions.reduce((s, q) => s + q.parts.filter(p => p.marks !== null).length, 0);
            console.log(`PHASE 0 skeleton ready (text-layer-first): ${skeleton.questions.length} questions, ${totalParts} parts, ${withMarks} with printed marks.`);
        } else {
            console.log('PHASE 0: no usable text layer — using legacy vision-first pipeline.');
        }

        // === TEXT-LAYER ANCHOR (legacy completeness check — only used in the fallback path) ===
        const anchors = skeleton.usable ? null : await extractQuestionAnchors(pdfPath);
        if (!skeleton.usable && anchors) {
            const anchoredQuestions = [...anchors.keys()];
            console.log(`Text-layer anchor ready: expected subparts known for ${anchoredQuestions.length} questions (${anchoredQuestions.slice(0, 12).map(q => `Q${q}`).join(', ')}${anchoredQuestions.length > 12 ? '…' : ''}).`);
        } else if (!skeleton.usable) {
            console.log('Text-layer anchor unavailable (scanned PDF?) — subpart completeness checks will be skipped.');
        }

        let qIndex = 1;

        // === VISION-FIRST PER-QUESTION EXTRACTION (restored primary path) ===
        // Every question goes through the crop-based vision pipeline: format-agnostic,
        // handles prose, scenario, table layouts, any board. The text-layer skeleton
        // (when usable) ENRICHES the result afterward: printed part marks get backfilled
        // where the vision pass missed them — deterministically, from the PDF's own print.
        for (const slicedQ of slicedPaper.questions) {
            try {
                const qNumberStr = slicedQ.number || String(qIndex);
                
                // MULTI-SLICE CROP
                const croppedImagesBase64: string[] = [];
                const slicePaths: string[] = [];
                // It's possible Phase 1 returned 'page_slices' or older schema? We handle if it missed it.
                const slices = slicedQ.page_slices || []; 
                if (slices.length === 0) {
                    console.log(`Question ${qNumberStr} has no page slices, skipping.`);
                    continue;
                }

                // If question spans across 2 pages, we crop 2 images.
                let gridSlicePaths: string[] = [];
                for (let s = 0; s < slices.length; s++) {
                    const slice = slices[s];
                    const qImagePath = await cropper.cropAsset(pdfPath, slice.page_number, slice.bounding_box, `q_${job.id}_${qNumberStr}_slice_${s}`);
                    slicePaths.push(qImagePath);

                    // Add grid for the LLM
                    const gridPath = await cropper.addGridToImage(qImagePath, qImagePath.replace('.png', '_grid.png'));
                    gridSlicePaths.push(gridPath);

                    // Send grid-overlay image to LLM so it can read exact coordinates from red/blue axes
                    const gridImageBuffer = await fs.readFile(gridPath);
                    croppedImagesBase64.push(gridImageBuffer.toString('base64'));
                }

                // Detail extraction using ALL cropped pieces — with the SUBPART COMPLETENESS
                // LADDER: (1) extract; (2) if expected subparts are missing, retry ONCE on the
                // SAME crops with a pointed report (coordinate system unchanged — diagrams
                // unaffected); (3) if still missing, escalate to the FULL PAGES and replace
                // wholesale (never merge) — fixing bad-crop truncation; (4) accept-or-keep:
                // only replace if the escalation captures more expected subparts.
                console.log(`Extracting details for Question ${qNumberStr} (${slices.length} parts)...`);
                let detailedQ = await withRetry(() => extractor.extractQuestionDetail(croppedImagesBase64, syllabusHierarchy));

                const expectedLabels = anchors?.get(qNumberStr) || anchors?.get(String(parseInt(qNumberStr, 10))) || null;
                if (expectedLabels && expectedLabels.length > 0) {
                    const expectedSet = canonicalAnchorLabels(expectedLabels);

                    // PLACEHOLDER-AWARE COVERAGE: a subpart whose text is the escape hatch
                    // "not visible on provided images" is NOT extracted — it must not count
                    // toward coverage, otherwise the escalation is fooled into stopping early
                    // while the data still carries placeholder garbage.
                    const isPlaceholder = (text: any): boolean => {
                        const t = String(text || '').toLowerCase().trim();
                        return t === 'not visible on provided images' || t.startsWith('not visible on provided');
                    };
                    const stripPlaceholders = (dq: any): void => {
                        const walk = (parts: any[]) => {
                            for (const p of parts || []) {
                                if (isPlaceholder(p?.text)) {
                                    p.text = '';
                                    p.flagged_for_review = true;
                                }
                                if (Array.isArray(p?.sub_parts)) walk(p.sub_parts);
                            }
                        };
                        walk(dq?.parts || []);
                    };
                    const coverageOf = (dq: any): number => {
                        const got = collectExtractedLabels(dq);
                        let hit = 0;
                        // Count a label as covered ONLY when it carries real text.
                        const partsWithText = new Set<string>();
                        const walk = (parts: any[]) => {
                            for (const p of parts || []) {
                                const label = String(p?.label || '').trim();
                                if (label && !isPlaceholder(p?.text)) {
                                    partsWithText.add(require$$canonical(label));
                                }
                                if (Array.isArray(p?.sub_parts)) walk(p.sub_parts);
                            }
                        };
                        // canonical label helper
                        function require$$canonical(lbl: string): string {
                            return lbl.replace(/\(/g, '.').replace(/\)/g, '').replace(/\s+/g, '').replace(/^\.+/, '').replace(/\.+$/, '').toLowerCase();
                        }
                        walk(dq?.parts || []);
                        expectedSet.forEach(l => { if (partsWithText.has(l)) hit++; });
                        return hit;
                    };
                    const expectedCount = expectedSet.size;
                    const firstCoverage = coverageOf(detailedQ);
                    const missing = [...expectedSet].filter(l => !collectExtractedLabels(detailedQ).has(l));

                    if (firstCoverage < expectedCount && missing.length > 0) {
                        console.log(`Completeness check Q${qNumberStr}: extracted ${firstCoverage}/${expectedCount} expected subparts — missing ${missing.map(l => `(${l.replace(/\./g, ')(')})`).join(', ')}. Retrying once on the same crops...`);

                        // Real printed text of each missing subpart (from the text-layer anchor)
                        const missingWithText = missing.map(l => ({
                            label: l,
                            text: getAnchorSubpartText(qNumberStr, l) || ''
                        })).filter(m => m.text.length > 0);

                        // STEP 2: retry on the SAME crops with a pointed report
                        const retryQ = await withRetry(() =>
                            extractor.extractQuestionDetail(croppedImagesBase64, syllabusHierarchy, {
                                missingSubparts: missing,
                                expectedTotal: expectedCount,
                                missingSubpartTexts: missingWithText
                            })
                        );
                        const retryCoverage = coverageOf(retryQ);
                        if (retryCoverage > firstCoverage) {
                            console.log(`Completeness retry Q${qNumberStr}: improved to ${retryCoverage}/${expectedCount}.`);
                            detailedQ = retryQ;
                        } else {
                            // STEP 3: escalate to the FULL PAGES — the crop is likely truncating
                            // the question. Wholesale replacement only (never merge coordinates).
                            console.log(`Completeness retry Q${qNumberStr} did not improve — the crop may be truncated. Escalating to full-page extraction...`);
                            try {
                                const fullPageImages: string[] = [];
                                for (const slice of slices) {
                                    const fpPath = await cropper.cropAsset(pdfPath, slice.page_number, { ymin: 0, xmin: 0, ymax: 1, xmax: 1 }, `q_${job.id}_${qNumberStr}_fullpage_${slice.page_number}`);
                                    const fpGrid = await cropper.addGridToImage(fpPath, fpPath.replace('.png', '_grid.png'));
                                    const fpBuf = await fs.readFile(fpGrid);
                                    fullPageImages.push(fpBuf.toString('base64'));
                                }
                                const escalatedQ = await withRetry(() =>
                                    extractor.extractQuestionDetail(fullPageImages, syllabusHierarchy, {
                                        missingSubparts: missing,
                                        expectedTotal: expectedCount,
                                        targetQuestionNumber: qNumberStr,
                                        fullPageMode: true,
                                        missingSubpartTexts: missing.map(l => ({
                                            label: l,
                                            text: getAnchorSubpartText(qNumberStr, l) || ''
                                        })).filter(m => m.text.length > 0)
                                    })
                                );
                                const escalatedCoverage = coverageOf(escalatedQ);
                                const gotAssets = (dq: any): number =>
                                    ((dq?.parts || []).reduce((n: number, p: any) => n + ((p?.visual_assets || []).length), 0) + (dq?.visual_assets || []).length);
                                // ACCEPT-OR-KEEP: replace only if it captures MORE expected
                                // subparts AND does not lose the question's diagrams.
                                if (escalatedCoverage > coverageOf(detailedQ) && gotAssets(escalatedQ) >= gotAssets(detailedQ)) {
                                    console.log(`Full-page escalation Q${qNumberStr}: accepted (${escalatedCoverage}/${expectedCount} subparts, ${gotAssets(escalatedQ)} assets).`);
                                    detailedQ = escalatedQ;
                                } else {
                                    console.warn(`Full-page escalation Q${qNumberStr}: kept original (escalation ${escalatedCoverage}/${expectedCount} vs ${coverageOf(detailedQ)}; assets ${gotAssets(escalatedQ)} vs ${gotAssets(detailedQ)}).`);
                                }
                            } catch (escErr) {
                                console.warn(`Full-page escalation Q${qNumberStr} failed:`, (escErr as Error).message);
                            }
                        }

                        // STEP 4: final status — never silent
                        const finalCoverage = coverageOf(detailedQ);
                        if (finalCoverage < expectedCount) {
                            console.warn(`Completeness: Q${qNumberStr} finished with ${finalCoverage}/${expectedCount} expected subparts after escalation — flagged for review.`);
                        } else {
                            console.log(`Completeness: Q${qNumberStr} complete — all ${expectedCount} expected subparts extracted.`);
                        }
                    }
                    // Never store the "not visible on provided images" escape hatch as content:
                    // strip placeholders to empty text + flagged_for_review marker.
                    stripPlaceholders(detailedQ);

                    // === TEXT-LAYER-FIRST BACKFILL (Fix 3) ===
                    // After the ladder, any still-missing subpart gets its VERBATIM text
                    // injected directly from the PDF's text layer (character-perfect — the
                    // PDF's own text, not model transcription). The vision pass remains
                    // the source for everything visible; this only fills genuine gaps.
                    if (expectedLabels && expectedLabels.length > 0) {
                        const gotLabels = collectExtractedLabels(detailedQ);
                        const realTextLabels = new Set<string>();
                        const walkReal = (parts: any[]) => {
                            for (const p of parts || []) {
                                const lbl = String(p?.label || '').trim();
                                const canon = lbl.replace(/\(/g, '.').replace(/\)/g, '').replace(/\s+/g, '').replace(/^\.+/, '').replace(/\.+$/, '').toLowerCase();
                                if (lbl && !isPlaceholder(p?.text)) realTextLabels.add(canon);
                                if (Array.isArray(p?.sub_parts)) walkReal(p.sub_parts);
                            }
                        };
                        walkReal(detailedQ?.parts || []);

                        const backfilled: string[] = [];
                        for (const l of expectedSet) {
                            if (!realTextLabels.has(l)) {
                                const text = getAnchorSubpartText(qNumberStr, l);
                                if (text && text.length > 0) {
                                    const rawLabel = `(${l.replace(/\./g, ')(')})`;
                                    if (!Array.isArray(detailedQ.parts)) detailedQ.parts = [];
                                    detailedQ.parts.push({
                                        label: rawLabel,
                                        text,
                                        marks: null,
                                        visual_assets: [],
                                        sub_parts: [],
                                        source: 'text-layer'
                                    } as any);
                                    backfilled.push(rawLabel);
                                }
                            }
                        }
                        if (backfilled.length > 0) {
                            console.log(`Text-layer backfill Q${qNumberStr}: injected ${backfilled.length} missing subpart(s) from the PDF text layer: ${backfilled.join(', ')}.`);
                        }
                    }
                }

                // Save structured data to DB — with retry, because transient network
                // "fetch failed" errors on inserts were silently dropping questions.
                // QUESTION NUMBER: always use the Phase 1 slicing number (qNumberStr).
                // Phase 2's detailedQ.number is read from the CROP IMAGE and is often a
                // PAGE NUMBER / subpart label / content number (e.g. "Q16" on an 8-question,
                // 16-page paper) — it must NEVER override the validated slicing number.
                // QUESTION MARKS: computed deterministically by summing the marks of all
                // parts and sub_parts (breadth-first). Most papers print a question total,
                // but IGCSE-style papers only print per-part brackets — the sum is the only
                // reliable total for every format.
                const sumPartMarks = (partsList: any[]): number => {
                    let total = 0;
                    for (const p of partsList || []) {
                        if (Array.isArray(p?.sub_parts) && p.sub_parts.length > 0) {
                            const subTotal = sumPartMarks(p.sub_parts);
                            if (subTotal > 0) {
                                total += subTotal;
                            } else {
                                const m = Number(p?.marks);
                                if (Number.isFinite(m) && m > 0) total += m;
                            }
                        } else {
                            const m = Number(p?.marks);
                            if (Number.isFinite(m) && m > 0) total += m;
                        }
                    }
                    return total;
                };
                const computedMarks = sumPartMarks(detailedQ.parts);
                const finalMarks = computedMarks > 0
                    ? computedMarks
                    : (Number(detailedQ.marks) > 0 ? Number(detailedQ.marks) : null);

                // Duplicate-content guard: big papers sometimes get the same question
                // extracted twice (overlapping page slices). Skip inserts whose content
                // already exists for this paper.
                const contentKey = (detailedQ.text || detailedQ.parts?.[0]?.text || '').toLowerCase().replace(/\s+/g, ' ').trim().slice(0, 200);
                if (contentKey && seenContent.has(contentKey)) {
                    console.log(`Duplicate content for Question ${qNumberStr} — skipping (already extracted).`);
                    continue;
                }
                if (contentKey) seenContent.add(contentKey);

                let qData: any = null;
                let qError: any = null;
                for (let insertAttempt = 0; insertAttempt < 3; insertAttempt++) {
                    const res = await supabase.from('past_paper_questions').insert({
                        paper_id: job.paper_id,
                        question_number: qNumberStr,
                        // Section label (A/B/C) when the paper is sectioned, from Phase 1 slicing
                        section: slicedQ.section || null,
                        // IGCSE-style papers have NO stem text — the question starts directly
                        // at part (a). Fall back to the first part's verbatim text so the
                        // question is never stored as "No text provided".
                        content_text: detailedQ.text && detailedQ.text.trim().length > 0
                            ? detailedQ.text
                            : (detailedQ.parts?.[0]?.text && detailedQ.parts[0].text.trim().length > 0
                                ? detailedQ.parts[0].text
                                : "No text provided"),
                        marks: finalMarks,
                        difficulty: detailedQ.difficulty || "Medium",
                        skills: detailedQ.skills || [],
                        topic: detailedQ.topics?.[0] || null,
                        subtopic: detailedQ.subtopics?.[0] || null
                    }).select('id').single();
                    qData = res.data;
                    qError = res.error;
                    if (!qError) break;
                    // Foreign-key violations are permanent (e.g. paper deleted) — don't retry those.
                    const isPermanent = (qError.message || '').includes('foreign key');
                    console.warn(`Question ${qNumberStr} insert attempt ${insertAttempt + 1}/3 failed: ${qError.message}${isPermanent ? ' (permanent — not retrying)' : ' — retrying...'}`);
                    if (isPermanent) break;
                    if (insertAttempt < 2) await new Promise(r => setTimeout(r, 5000));
                }

                if (qError) throw new Error(`Failed to insert question: ${qError.message}`);
                
                const questionId = qData.id;

                // Visual asset placement: assets stay EXACTLY where the extraction placed them.
                // Part-referenced diagrams/tables (pie chart in (a), timetable in (b), etc.) must
                // remain attached to their subpart — the previous "stem hoisting" heuristic
                // (rootText.length > 30) moved nearly every part asset to the question start,
                // which misplaces diagrams away from the sub-questions that require them.
                // Only assets the model itself placed at the root (physically before part (a))
                // are treated as stem assets below.

                // Process parts recursively
                await insertParts(detailedQ.parts, questionId, null, slicePaths, job.paper_id, qNumberStr, pdfPath, slices);

                // Process visual assets for question
                if (detailedQ.visual_assets && detailedQ.visual_assets.length > 0) {
                    for (let i = 0; i < detailedQ.visual_assets.length; i++) {
                        const asset = detailedQ.visual_assets[i];
                        const sliceIdx = (asset.page_number || 1) - 1;
                        const targetImagePath = slicePaths[sliceIdx] || slicePaths[0];
                        const targetPageNumber = slices[sliceIdx]?.page_number || slices[0]?.page_number;
                        await processSubAsset(targetImagePath, job.paper_id, questionId, null, asset, `${qNumberStr}_img${i}`, pdfPath, targetPageNumber);
                    }
                }
            } catch (e) {
                console.error(`Error processing question ${slicedQ.number}:`, e);
            }
            qIndex++;
        }

        // === SKELETON MARKS ENRICHMENT (deterministic backfill) ===
        // After vision extraction, backfill printed part marks + question totals from
        // the PDF text layer wherever the vision pass left them null. This fixes the
        // "no marks extracted" class of failure deterministically (the PDF's own print
        // is the ground truth) without overriding anything vision got right.
        if (skeleton.usable && skeleton.questions.length > 0) {
            try {
                const { data: storedQs } = await supabase
                    .from('past_paper_questions')
                    .select('id, question_number, marks')
                    .eq('paper_id', job.paper_id);
                let backfilled = 0;
                for (const skQ of skeleton.questions) {
                    const stored = (storedQs || []).find((q: any) => String(q.question_number) === String(skQ.number));
                    if (!stored) continue;
                    // Question-level marks: vision null → use skeleton's printed total
                    if (stored.marks === null || stored.marks === undefined) {
                        const partSum = skQ.parts.reduce((s: number, p: any) => {
                            const subSum = (p.sub_parts || []).reduce((s2: number, sp: any) => s2 + (sp.marks || 0), 0);
                            return s + (subSum > 0 ? subSum : (p.marks || 0));
                        }, 0);
                        if (partSum > 0) {
                            await supabase.from('past_paper_questions').update({ marks: partSum }).eq('id', stored.id);
                            console.log(`Marks backfill: Q${skQ.number} total set to ${partSum} (from PDF print).`);
                            backfilled++;
                        }
                    }
                    // Part-level marks: fetch stored parts, patch nulls from the skeleton
                    const { data: storedParts } = await supabase
                        .from('question_parts')
                        .select('id, part_label, marks')
                        .eq('question_id', stored.id);
                    for (const skP of skQ.parts) {
                        const sp = (storedParts || []).find((x: any) =>
                            String(x.part_label).toLowerCase().replace(/[^a-z0-9]/g, '') === String(skP.label).toLowerCase().replace(/[^a-z0-9]/g, ''));
                        if (sp && (sp.marks === null || sp.marks === undefined) && skP.marks !== null) {
                            await supabase.from('question_parts').update({ marks: skP.marks }).eq('id', sp.id);
                            backfilled++;
                        }
                    }
                }
                console.log(`Skeleton marks enrichment complete: ${backfilled} mark value(s) backfilled from the PDF text layer.`);
            } catch (enrichErr) {
                console.warn('Marks enrichment failed (non-fatal):', (enrichErr as Error).message);
            }
        }

        await supabase.from('ingestion_jobs').update({ status: 'completed' }).eq('id', job.id);
        console.log(`Job ${job.id} completed successfully.`);

        // Trigger process-marking-scheme if mark_scheme_url exists
        await triggerMarkingScheme(job, markSchemeUrl || paper.mark_scheme_url);

    } catch (error: any) {
        console.error(`Job ${job.id} failed:`, error);
        await supabase.from('ingestion_jobs').update({ 
            status: 'failed', 
            error_details: { message: error.message, stack: error.stack } 
        }).eq('id', job.id);
    } finally {
        if (pdfPath) {
            try {
                const tempDir = path.join(__dirname, '..', 'temp');
                const files = await fs.readdir(tempDir);
                for (const file of files) {
                    if (file.includes(job.id)) {
                        await fs.unlink(path.join(tempDir, file));
                    }
                }
            } catch(e) {}
        }
    }
}


function romanToNum(str: string): number {
    const romanMap: Record<string, number> = { i: 1, v: 5, x: 10, l: 50, c: 100 };
    let num = 0;
    const s = str.toLowerCase();
    for (let i = 0; i < s.length; i++) {
        const curr = romanMap[s[i]] || 0;
        const next = romanMap[s[i + 1]] || 0;
        if (curr < next) {
            num -= curr;
        } else {
            num += curr;
        }
    }
    return num > 0 ? num : 999;
}

function cleanPartLabel(label: string): string {
    if (!label) return '';
    return label.replace(/[()]/g, '').trim();
}

function getPartRank(label: string): number {
    if (!label) return 9999;
    const clean = cleanPartLabel(label).toLowerCase();
    
    // Roman numeral: i, ii, iii, iv, v, vi, vii, viii, ix, x
    if (/^(i|v|x|l)+$/.test(clean)) {
        return romanToNum(clean);
    }
    
    // Single letter: a, b, c, d...
    if (/^[a-z]$/.test(clean)) {
        return clean.charCodeAt(0) - 96; // a -> 1, b -> 2...
    }
    
    // Digits: 1, 2, 3...
    if (/^\d+$/.test(clean)) {
        return parseInt(clean, 10);
    }
    
    return 9999;
}

function sortParts<T extends { label?: string; part_label?: string }>(parts: T[]): T[] {
    return [...parts].sort((a, b) => {
        const rankA = getPartRank(a.label || a.part_label || '');
        const rankB = getPartRank(b.label || b.part_label || '');
        if (rankA !== rankB) return rankA - rankB;
        return (a.label || a.part_label || '').localeCompare(b.label || b.part_label || '', undefined, { numeric: true });
    });
}

async function insertParts(
    parts: ExtractedQuestionPart[], 
    questionId: string, 
    parentPartId: string | null, 
    slicePaths: string[], 
    paperId: string, 
    qNumberStr: string,
    pdfPath?: string,
    slices?: any[]
) {
    if (!parts || parts.length === 0) return;
    const sortedParts = sortParts(parts);
    for (const part of sortedParts) {
        const cleanedLabel = cleanPartLabel(part.label);
        const { data: pData, error: pError } = await supabase.from('question_parts').insert({
            question_id: questionId,
            parent_part_id: parentPartId,
            part_label: cleanedLabel,
            content_text: part.text,
            marks: part.marks
        }).select('id').single();
        
        if (pError) throw new Error(`Failed to insert question part: ${pError.message}`);

        const partId = pData.id;

        // Process part visual assets
        if (part.visual_assets && part.visual_assets.length > 0) {
            for (let i = 0; i < part.visual_assets.length; i++) {
                const asset = part.visual_assets[i];
                const sliceIdx = (asset.page_number || 1) - 1;
                const targetImagePath = slicePaths[sliceIdx] || slicePaths[0];
                const targetPageNumber = slices?.[sliceIdx]?.page_number || slices?.[0]?.page_number;
                await processSubAsset(targetImagePath, paperId, questionId, partId, asset, `${qNumberStr}_part_${cleanedLabel}_img${i}`, pdfPath, targetPageNumber);
            }
        }

        // Recursive call to insert sub_parts (and sub_sub_parts!)
        if (part.sub_parts && part.sub_parts.length > 0) {
            await insertParts(part.sub_parts, questionId, partId, slicePaths, paperId, qNumberStr, pdfPath, slices);
        }
    }
}

async function processSubAsset(
    sourceImagePath: string, 
    paperId: string, 
    questionId: string | null, 
    partId: string | null, 
    asset: any, 
    assetSuffix: string,
    pdfPath?: string,
    pageNumber?: number
) {
    if (!asset.bounding_box) return;
    try {
        const croppedPath = await cropper.cropAssetFromImage(
            sourceImagePath, 
            asset.bounding_box, 
            assetSuffix,
            pdfPath,
            pageNumber,
            asset.description
        );
        
        const fileData = await fs.readFile(croppedPath);
        
        const safeSuffix = assetSuffix.replace(/[^a-zA-Z0-9_-]/g, '_');
        const fileName = `${paperId}/${questionId}/${Date.now()}_${safeSuffix}.png`;
        const { data: uploadData, error: uploadError } = await supabase.storage.from('papers').upload(`assets/${fileName}`, fileData, { contentType: 'image/png' });
        
        if (uploadError) {
            console.error('Failed to upload asset:', uploadError.message);
            return;
        }

        const { data: publicUrlData } = supabase.storage.from('papers').getPublicUrl(`assets/${fileName}`);

        await supabase.from('question_assets').insert({
            question_id: questionId,
            part_id: partId,
            asset_type: asset.type,
            storage_path: publicUrlData.publicUrl,
            ai_description: asset.description,
            original_page_number: asset.page_number
        });

        if (questionId && !partId) {
            const { data: qCurr } = await supabase.from('past_paper_questions').select('content_images').eq('id', questionId).single();
            const currentImages = qCurr?.content_images || [];
            await supabase.from('past_paper_questions').update({
                content_images: Array.from(new Set([...currentImages, publicUrlData.publicUrl]))
            }).eq('id', questionId);
        }

        await fs.unlink(croppedPath);
    } catch (e) {
        console.error("Failed to process sub-asset", e);
    }
}

async function downloadPdf(url: string, jobId: string): Promise<string> {
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`Failed to download PDF: ${response.statusText}`);
    }
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    
    const tempDir = path.join(__dirname, '..', 'temp');
    await fs.mkdir(tempDir, { recursive: true });
    
    const pdfPath = path.join(tempDir, `${jobId}.pdf`);
    await fs.writeFile(pdfPath, buffer);
    return pdfPath;
}

console.log('Mentora Content Ingestion Agent started.');
let isProcessing = false;
setInterval(async () => {
    if (!isProcessing) {
        isProcessing = true;
        await checkJobs();
        isProcessing = false;
    }
}, POLL_INTERVAL);
checkJobs().then(() => isProcessing = false);

// HTTP trigger server for instant processing
const server = http.createServer(async (req, res) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    if (req.method === "OPTIONS") {
        res.writeHead(200);
        res.end();
        return;
    }

    if (req.url === "/health" && req.method === "GET") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ status: "ok", isProcessing }));
        return;
    }

    if (req.url === "/process" && req.method === "POST") {
        console.log("Received instant processing request via HTTP");
        if (!isProcessing) {
            isProcessing = true;
            checkJobs().finally(() => { isProcessing = false; });
        }
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ message: "Ingestion agent triggered successfully" }));
        return;
    }

    res.writeHead(404);
    res.end();
});

const PORT = Number(process.env.PORT) || 3005;
server.listen(PORT, '0.0.0.0', () => {
    console.log("Mentora Ingestion Agent HTTP server listening on 0.0.0.0:" + PORT);
});