import OpenAI from 'openai';
import * as fs from 'fs/promises';

export interface SlicedQuestion {
    number: string;
    section?: string | null;
    page_slices: { 
        page_number: number; 
        bounding_box: { ymin: number; xmin: number; ymax: number; xmax: number };
    }[];
}

export interface AnswerRuleSection {
    label: string;
    requirement: 'all' | 'any';
    count?: number;
}

export interface AnswerRules {
    sections: AnswerRuleSection[];
    default_rule: 'all' | 'any';
    default_count?: number;
}

export interface SlicedPaper {
    metadata: {
        curriculum: string;
        subject: string;
        grade_level: string;
        year: number;
        session: string;
        paper_number: number;
        variant: string;
    };
    answer_instructions?: string;
    total_questions_count?: number;
    answer_rules?: AnswerRules;
    questions: SlicedQuestion[];
}

export interface ExtractedQuestionPart {
    label: string; 
    text: string;
    marks: number | null;
    sub_parts: ExtractedQuestionPart[];
    visual_assets: ExtractedVisualAsset[];
}

export interface ExtractedVisualAsset {
    type: 'image' | 'diagram' | 'graph' | 'table' | 'structure';
    description: string;
    page_number: number;
    bounding_box: {
        ymin: number;
        xmin: number;
        ymax: number;
        xmax: number;
    } | null;
}

export interface ExtractedQuestion {
    number: string;
    text: string;
    marks: number | null;
    topics: string[];
    subtopics: string[];
    difficulty: 'Easy' | 'Medium' | 'Hard';
    skills: string[];
    parts: ExtractedQuestionPart[];
    visual_assets: ExtractedVisualAsset[];
}

export class Extractor {
    private openai: OpenAI;
    private modelOverride?: string;
    /** True when routing through a gateway/baseURL override (attachment caps apply). */
    readonly baseUrlOverride?: boolean;

    constructor(apiKey: string, baseUrl?: string, modelOverride?: string) {
        // Optional gateway routing (e.g. Caimex OpenAI-compatible endpoint). When
        // baseUrl is undefined, the standard api.openai.com endpoint is used.
        this.openai = new OpenAI({
            apiKey,
            ...(baseUrl ? { baseURL: baseUrl } : {})
        });
        this.baseUrlOverride = !!baseUrl;
        this.modelOverride = modelOverride;
    }


    /** Reasoning-style models (gpt-6*, o1/o3/o4) reject custom temperature —
     *  return undefined so the field is omitted entirely for them. */
    private temperatureFor(model: string, fallback: number): number | undefined {
        if (model.startsWith('gpt-6') || model.startsWith('o1') || model.startsWith('o3') || model.startsWith('o4')) {
            return undefined;
        }
        return fallback;
    }

    /** Resolve the model id for this deployment: explicit override, else the default. */
    private resolveModel(defaultModel: string): string {
        return this.modelOverride || defaultModel;
    }

    async extractPaperStructureSlices(pageImages: string[]): Promise<SlicedPaper> {
        console.log(`Phase 1: Sending ${pageImages.length} pages to OpenAI for structure slicing...`);

        const systemInstruction = `You are an expert educational content ingestion agent.
You are given images of pages from an examination paper. The first page is usually the cover page.
Extract the paper metadata and identify every major question (1, 2, 3).
CRITICAL: A single major question might start on one page and continue onto the next page!
Because of this, for each major question, provide an array of \`page_slices\`. 
If a question spans across page 4 and page 5, output TWO objects in the \`page_slices\` array (one for page 4, one for page 5).
For each slice, provide the page_number (1-indexed based on the images provided), and the approximate bounding_box [ymin, xmin, ymax, xmax] relative to that specific page (0.0 to 1.0) covering ONLY that question's content on that page.

PAGE NUMBER vs QUESTION NUMBER (CRITICAL — READ CAREFULLY):
- Many exam papers (especially Cambridge IGCSE) print a LARGE STANDALONE PAGE NUMBER at the top or bottom of every page (e.g. "2", "4", "16"). That number is the PAGE NUMBER — it is NEVER a question number. Do NOT use it to number questions.
- Questions are identified by the pattern "N (a)", "N (b)" in the question text (e.g. "1 (a) The cost of a cinema ticket has..."), or by a major question number printed inline with its first line of question text.
- Sub-part labels like "(a)", "(b)(i)", "(ii)" belong to their parent question — they are NOT question numbers.
- Mid-content numbers (clock times like "11", table values like "0", mark totals like "[3]") are NEVER question numbers.
- Number the questions with a CONTIGUOUS sequence starting at 1: 1, 2, 3, 4, ... N in reading order. If the numbering you detect has gaps, duplicates, or a value larger than the total number of questions in the paper (e.g. you detect "Q16" but the paper has only 8 questions), you have misread a page number — re-examine and correct it.

ANSWER INSTRUCTIONS & SECTIONS (read from the cover page / front matter):
- The cover page usually tells students HOW MANY questions to answer, e.g. "Answer ALL questions in Section A and any FOUR questions from Section B", or "Answer any five questions", or "Answer all questions".
- Capture the instruction text verbatim in "answer_instructions".
- Derive structured "answer_rules": {"sections": [{"label": "A", "requirement": "all"} | {"label": "B", "requirement": "any", "count": 4}], "default_rule": "all"}. If the paper has no sections and says "answer all questions", use {"sections": [], "default_rule": "all"}. If it says "answer any N questions" with no sections, use {"sections": [], "default_rule": "any", "default_count": N}.
- If the paper is divided into sections (A, B, C...), assign each question its "section" label. If there are no sections, omit "section" (or use null).
- If no instruction is found, set "answer_instructions" to "" and use the default "answer all" rule.

BIG/SECTIONED PAPERS (CRITICAL — HISTORY, GEOGRAPHY, ENGLISH LITERATURE STYLE):
- Some papers have VERY LARGE questions: one major question can occupy an ENTIRE PAGE or more, containing multiple essay options as internal sub-parts like (a), (b), (c). Each such major question is ONE question — its internal (a)/(b)/(c) options are PARTS of that question, NOT separate questions.
- NEVER create a "question" from a SECTION HEADING. Lines like "SECTION A: CORE CONTENT", "SECTION B: DEPTH STUDIES", "Answer one question from this section" are headers/instructions, NOT questions. A question starts with a number and question content (e.g. "1 In 1848 revolutions swept across Europe.").
- Keep major question numbering as printed in the paper (1, 2, 3...). If the paper's questions are numbered 1-7, you MUST output exactly 7 questions — even if each spans a full page.
- Before finalizing, VERIFY: (1) your question count matches the count of question numbers printed in the paper, (2) no question is a section heading, (3) no question number is duplicated, (4) every question's content starts with actual question text.

CRITICAL COMPLETENESS CHECK: You MUST scan every single page until the very end of the document. Do NOT skip the last question. To ensure you do not miss any, first count the total number of major questions in the paper and output it as \`total_questions_count\`.

Ensure your response is valid JSON matching this schema exactly:
{
  "metadata": { "curriculum": "Strictly 'Cambridge' or 'ZIMSEC'", "subject": "string", "grade_level": "string", "year": "number", "session": "string", "paper_number": "number", "variant": "string" },
  "answer_instructions": "string (verbatim from cover page, empty string if none)",
  "answer_rules": { "sections": [{"label": "string", "requirement": "'all' or 'any'", "count": "number (only when requirement is 'any')"}], "default_rule": "'all' or 'any'", "default_count": "number (only when default_rule is 'any')" },
  "total_questions_count": 0,
  "questions": [
    { 
      "number": "string", 
      "section": "string or null (section label e.g. 'A'/'B' when the paper is sectioned)",
      "page_slices": [
        { "page_number": "number", "bounding_box": { "ymin": "number", "xmin": "number", "ymax": "number", "xmax": "number" } }
      ]
    }
  ]
}`;

        const content: any[] = [{ type: "text", text: "Extract the metadata and question slices as JSON." }];

        // === ATTACHMENT-CAP BATCHING (gateway override only) ===
        // Gateways cap a single message's image attachments (Caimex: 16). When routing
        // through the standard OpenAI API there is NO such limit — a single call with
        // ALL pages is more reliable (the model sees the whole paper at once), so
        // batching is only used when a provider override is active.
        const MAX_ATTACHMENTS = this.baseUrlOverride ? 16 : 999; // 999 = effectively no cap on direct OpenAI
        const OVERLAP_PAGES = 2;         // overlap so questions spanning batch edges are seen whole
        const totalPages = pageImages.length;

        if (totalPages <= MAX_ATTACHMENTS) {
            for (const imagePath of pageImages) {
                const imageBuffer = await fs.readFile(imagePath);
                const base64Image = imageBuffer.toString('base64');
                content.push({
                    type: "image_url",
                    image_url: { url: `data:image/png;base64,${base64Image}`, detail: "high" }
                });
            }
            const m0 = this.resolveModel("gpt-6-luna");
            const response = await this.openai.chat.completions.create({
                model: m0,
                messages: [{ role: "system", content: systemInstruction }, { role: "user", content }],
                response_format: { type: "json_object" },
                ...(this.temperatureFor(m0, 0.1) !== undefined ? { temperature: this.temperatureFor(m0, 0.1) } : {}),
            });
            const textContent = response.choices[0].message.content || "{}";
            try {
                return JSON.parse(textContent) as SlicedPaper;
            } catch (err) {
                console.error("Failed to parse Slicer JSON:", textContent);
                throw new Error("Invalid JSON from Slicer.");
            }
        }

        // ---- Batched path for papers with more pages than the attachment cap ----
        console.log(`Slicing in batches: ${totalPages} pages, cap ${MAX_ATTACHMENTS}, overlap ${OVERLAP_PAGES}.`);
        const batches: { startIdx: number; images: string[] }[] = [];
        for (let start = 0; start < totalPages; start += (MAX_ATTACHMENTS - OVERLAP_PAGES)) {
            const end = Math.min(start + MAX_ATTACHMENTS, totalPages);
            const images: string[] = [];
            for (let i = start; i < end; i++) {
                const buf = await fs.readFile(pageImages[i]);
                images.push(buf.toString('base64'));
            }
            batches.push({ startIdx: start, images });
            if (end >= totalPages) break;
        }

        let merged: SlicedPaper | null = null;
        const seenQuestions = new Map<string, any>();

        for (let b = 0; b < batches.length; b++) {
            const batch = batches[b];
            const firstAbsPage = batch.startIdx + 1; // 1-indexed absolute page number
            const batchInstruction = `${systemInstruction}

You are shown BATCH ${b + 1} of ${batches.length} of this examination paper.
These images are ABSOLUTE pages ${firstAbsPage} to ${firstAbsPage + batch.images.length - 1} of the full paper (the first image is page ${firstAbsPage}, the last is page ${firstAbsPage + batch.images.length - 1}).
- Report ONLY the questions that START within these pages (a question whose start lies in an earlier batch is omitted here — it will come from that batch).
- Use ABSOLUTE page numbers (${firstAbsPage}–${firstAbsPage + batch.images.length - 1}) in page_slices.
- Metadata/answer_instructions: ${b === 0 ? 'extract them from these pages (the cover page is included).' : 'return the same metadata object structure with empty/placeholder values — the first batch owns it.'}`;

            const batchContent: any[] = [{ type: "text", text: "Extract the metadata and question slices as JSON." }];
            for (const b64 of batch.images) {
                batchContent.push({
                    type: "image_url",
                    image_url: { url: `data:image/png;base64,${b64}`, detail: "high" }
                });
            }

            const mB = this.resolveModel("gpt-6-luna");
            const response = await this.openai.chat.completions.create({
                model: mB,
                messages: [{ role: "system", content: batchInstruction }, { role: "user", content: batchContent }],
                response_format: { type: "json_object" },
                ...(this.temperatureFor(mB, 0.1) !== undefined ? { temperature: this.temperatureFor(mB, 0.1) } : {}),
            });

            const textContent = response.choices[0].message.content || "{}";
            let parsed: SlicedPaper;
            try {
                parsed = JSON.parse(textContent);
            } catch (err) {
                console.error(`Failed to parse Slicer JSON for batch ${b + 1}:`, textContent.substring(0, 200));
                continue; // skip failed batch — others may cover most questions
            }

            if (!merged) {
                merged = parsed; // first batch owns metadata + answer rules
                merged.questions = [];
            }
            for (const q of parsed.questions || []) {
                const key = String(q?.number || '').trim();
                if (!key || seenQuestions.has(key)) continue;
                seenQuestions.set(key, q);
                merged.questions.push(q);
            }
            console.log(`Batch ${b + 1}/${batches.length}: ${((parsed.questions || []).length)} questions (merged total: ${merged.questions.length}).`);
        }

        if (!merged || merged.questions.length === 0) {
            throw new Error('Slicing produced no questions across all batches.');
        }
        // Re-sort questions numerically for stable downstream processing
        merged.questions.sort((a, b2) => {
            const na = parseInt(String(a?.number || '').match(/\d+/)?.[0] || '0', 10);
            const nb = parseInt(String(b2?.number || '').match(/\d+/)?.[0] || '0', 10);
            return na - nb;
        });
        return merged;
    }

    /**
     * Cover-page metadata extraction (single image, never hits attachment caps).
     * Used on the text-layer-first path where the skeleton owns all structure —
     * the cover page only needs to yield metadata + answer rules.
     */
    async extractCoverMetadata(coverImageBase64: string | undefined): Promise<{
        metadata: any;
        answer_instructions?: string;
        answer_rules?: any;
    }> {
        if (!coverImageBase64) throw new Error('No cover image available.');
        const imageBuffer = await fs.readFile(coverImageBase64);
        const b64 = imageBuffer.toString('base64');

        const systemInstruction = `You are an examination paper metadata reader. You are shown the COVER PAGE of an exam paper.
Extract ONLY:
1. "metadata": { "curriculum": "Cambridge" or "ZIMSEC" (judge from the board name/logo), "subject": string, "grade_level": string, "year": number, "session": string, "paper_number": number, "variant": string }
2. "answer_instructions": the verbatim text telling candidates how many questions to answer (e.g. "Answer all questions").
3. "answer_rules": {"sections": [{"label": "A", "requirement": "all"} | {"label": "B", "requirement": "any", "count": 4}], "default_rule": "all"}. If it says "answer any N questions" with no sections, use {"sections": [], "default_rule": "any", "default_count": N}.

Return ONLY raw JSON:
{ "metadata": {...}, "answer_instructions": "...", "answer_rules": {...} }`;

        const mC = this.resolveModel("gpt-6-luna");
        const response = await this.openai.chat.completions.create({
            model: mC,
            messages: [
                { role: "system", content: systemInstruction },
                { role: "user", content: [
                    { type: "text", text: "Extract the cover page metadata as JSON." },
                    { type: "image_url", image_url: { url: `data:image/png;base64,${b64}`, detail: "high" } }
                ] }
            ],
            response_format: { type: "json_object" },
            ...(this.temperatureFor(mC, 0.1) !== undefined ? { temperature: this.temperatureFor(mC, 0.1) } : {}),
        });
        const textContent = response.choices[0].message.content || "{}";
        return JSON.parse(textContent);
    }

    /**
     * Rubric extraction from raw mark-scheme text (local agent path — used for
     * large MS PDFs that exceed the edge function's compute limits).
     */
    async extractRubricFromText(systemPrompt: string, msText: string): Promise<any> {
        const mR = this.resolveModel("gpt-6-luna");
        const response = await this.openai.chat.completions.create({
            model: mR,
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: `Here is the full text of the Marking Scheme PDF:\n\n${msText}` }
            ],
            response_format: { type: "json_object" },
            ...(this.temperatureFor(mR, 0) !== undefined ? { temperature: this.temperatureFor(mR, 0) } : {})
        });
        const textContent = response.choices[0].message.content || "{}";
        return JSON.parse(textContent);
    }

    /**
     * Assets-only extraction for the text-layer-first pipeline: the question text,
     * parts and marks already come from the PDF text layer — this vision pass ONLY
     * locates diagram/graph/table assets on the question's pages.
     */
    async extractQuestionAssets(
        pageImagesBase64: string[],
        questionNumber: string,
        knownPartLabels: string[]
    ): Promise<{ visual_assets: any[] }> {
        const systemInstruction = `You are a visual asset detection agent for an examination paper.
You are given FULL PAGE images containing question ${questionNumber} (its parts: ${knownPartLabels.map(l => `(${l})`).join(', ')}) possibly alongside neighboring questions.
Your ONLY job is to detect DIAGRAMS, GRAPHS, TABLES and other figures that belong to question ${questionNumber} — NOT to transcribe any text.

RULES:
1. Only report assets that are visually part of question ${questionNumber} (referenced by its parts or sitting inside its area). Ignore other questions' figures completely.
2. For each asset output: type ("image" | "diagram" | "graph" | "table" | "structure"), description (one short sentence), page_number (1-indexed by the order of images provided), and bounding_box {ymin, xmin, ymax, xmax} relative to that full page image (0.0 to 1.0).
3. COORDINATE GRID: each image has red horizontal (Y) and blue vertical (X) grid lines from 0.05 to 0.95 — use them to read exact coordinates.
4. Bounding boxes must fully cover the figure including labels/captions but exclude question text and dotted answer lines.
5. If there are no visual assets for this question, return an empty array.

Return ONLY raw JSON: { "visual_assets": [ { "type": "...", "description": "...", "page_number": 1, "bounding_box": { "ymin": 0.0, "xmin": 0.0, "ymax": 1.0, "xmax": 1.0 } } ] }`;

        const content: any[] = [{ type: "text", text: `Detect all visual assets belonging to question ${questionNumber}.` }];
        for (const b64 of pageImagesBase64) {
            content.push({ type: "image_url", image_url: { url: `data:image/png;base64,${b64}`, detail: "high" } });
        }

        const mA = this.resolveModel("gpt-6-luna");
        const response = await this.openai.chat.completions.create({
            model: mA,
            messages: [
                { role: "system", content: systemInstruction },
                { role: "user", content }
            ],
            response_format: { type: "json_object" },
            ...(this.temperatureFor(mA, 0.1) !== undefined ? { temperature: this.temperatureFor(mA, 0.1) } : {}),
        });

        const textContent = response.choices[0].message.content || "{}";
        try {
            return JSON.parse(textContent);
        } catch (err) {
            console.error("Failed to parse asset-scan JSON:", textContent.substring(0, 200));
            return { visual_assets: [] };
        }
    }

    async extractQuestionDetail(
        questionImagesBase64: string[],
        syllabusHierarchy?: Record<string, string[]> | null,
        hints?: { missingSubparts?: string[]; expectedTotal?: number; targetQuestionNumber?: string; fullPageMode?: boolean; missingSubpartTexts?: { label: string; text: string }[] }
    ): Promise<ExtractedQuestion> {
        let syllabusInstruction = "";
        let topicsSchema = '"string"';
        let subtopicsSchema = '"string"';
        if (syllabusHierarchy && Object.keys(syllabusHierarchy).length > 0) {
            syllabusInstruction = `\n\n=== SYLLABUS TOPIC MATCHING (CRITICAL) ===\nYou are processing a question paper that belongs to a specific syllabus. The official syllabus topics and their subtopics are:\n${JSON.stringify(syllabusHierarchy, null, 2)}\n\nYou MUST select the single most relevant high-level topic (the keys of the JSON above) for the "topics" array. You MUST ALSO select the single most relevant subtopic (from the values of that key) for the "subtopics" array. DO NOT invent topics or subtopics. You MUST use the EXACT strings from the list. If you cannot decide, pick the closest ones. DO NOT output any topic or subtopic that is not in the list.`;
            topicsSchema = `"string (MUST be an exact key from the syllabus JSON)"`;
            subtopicsSchema = `"string (MUST be an exact value from the selected topic's array in the syllabus JSON)"`;
        }

        // Completeness escalation hints: a previous extraction attempt MISSED printed
        // subparts. The retry must output EVERY listed subpart or explicitly explain
        // why it is absent (e.g. genuinely not printed on the provided images).
        let completenessInstruction = "";
        if (hints && (hints.missingSubparts?.length || hints.expectedTotal)) {
            const missingList = (hints.missingSubparts || []).map(l => `(${l.replace(/\./g, ')(')})`).join(', ');
            const textHints = (hints.missingSubpartTexts || [])
                .map(m => `(${m.label.replace(/\./g, ')(')}) — printed text: "${m.text}"`)
                .join('\n');
            completenessInstruction = `\n\n=== SUBPART COMPLETENESS (CRITICAL — PREVIOUS ATTEMPT FAILED) ===\nA previous extraction of this question MISSED printed subparts.\nThe paper prints these subparts for this question: ${hints.expectedTotal ?? 'multiple'} parts total.\nThe MISSING subparts you MUST now include are: ${missingList || '(see the expected total)'}.\n${textHints ? `\nTHE ACTUAL PRINTED TEXT of the missing subparts (search the images for this exact content):\n${textHints}\n` : ''}\nScan the ENTIRE image set from top to bottom. Output an entry in "parts"/"sub_parts" for EVERY printed subpart of this question.\nIf a listed subpart is genuinely NOT printed anywhere on the provided images, include it anyway with text "not visible on provided images".\nNEVER omit a subpart silently.${hints.fullPageMode ? `\n\nYou are being shown FULL PAGES (not a cropped question). Focus ONLY on the question numbered ${hints.targetQuestionNumber || 'the target question'} and its subparts — ignore other questions' content on these pages. Bounding boxes are relative to the full page image provided.` : ''}`;
        }

        const systemInstruction = `You are an expert educational content ingestion agent.
You are given cropped images representing a SINGLE major exam question. There may be multiple images if the question spans across multiple pages.${syllabusInstruction}${completenessInstruction}

Extract the deeply nested structure of the question into JSON.
Accurately capture all nested sub-questions (parts like a, b, c, and sub_parts like i, ii, iii) and their marks. 
CRITICAL: Questions can be deeply nested! Use \`sub_parts\` recursively! (e.g., \`parts\` contains \`sub_parts\`, which can contain another level of \`sub_parts\` for sub-sub-parts). DO NOT skip any text or nested question.

VERBATIM TRANSCRIPTION (ABSOLUTE RULE):
- "text" fields must contain the EXACT WORDS printed in the question paper — transcribe them character-for-character, in the printed order.
- NEVER summarise, paraphrase, generalise, describe, or reword. "Cinema-related problems involving calculations of costs, time, and wages" is a FORBIDDEN style — if the paper says "1 (a) The cost of a cinema ticket is $6.30. (i) Work out the total cost of 4 tickets.", then "text" is "The cost of a cinema ticket is $6.30." for part (a) and "Work out the total cost of 4 tickets." for sub-part (i) — the printed words only.
- The root "text" is the question stem exactly as printed (the introductory sentence(s) before part (a), if any). If there is no stem text, use "".
- Do NOT describe what the question is "about". Do NOT mention "problems involving", "questions based on", "calculations of", or any meta-description. Only the paper's own words.
- If text is handwritten-style, small, or partially unreadable, transcribe the readable portion exactly — never replace it with a description.

Identify any visual assets (images, diagrams, graphs, tables) embedded within the text and provide their type, description, page_number (1-indexed based on the order of cropped images provided here), and bounding_box [ymin, xmin, ymax, xmax] relative to the specific cropped image (0.0 to 1.0).

COORDINATE GRID SYSTEM (HIGH PRECISION):
Each input image has an overlaid coordinate grid with:
- Red horizontal lines marking Y from 0.05 to 0.95 (e.g., Y:0.10, Y:0.20, Y:0.30...)
- Blue vertical lines marking X from 0.05 to 0.95 (e.g., X:0.10, X:0.20, X:0.30...)
Use these grid markings to read the exact fractional coordinates (0.0 to 1.0) of each visual asset.

CRITICAL BOUNDING BOX EXTRACTION RULES FOR VISUAL ASSETS:
1. COMPLETE INCLUSION (DO NOT CUT OFF ANY PART OF THE DIAGRAM):
   - The bounding_box MUST completely enclose ALL components of the visual figure:
     * In reaction schemes and chemical structures: MUST include ALL reactants, atoms, bonds, displayed formulas on the far left (e.g., the complete ethene molecule C=C and all hydrogens), all reaction arrows, conditions/catalysts, all intermediate and final products on the right, and the caption below (e.g., "Fig. 4.1").
     * In apparatus/experiments: MUST include all flasks, tubes, stands, stoppers, labels, pointer arrows, and liquids from top to bottom and left to right.
     * In tables: MUST include all borders, headers, and rows.
     * In graphs: MUST include axes, axis titles, units, and curves/data points.
2. STRICT EXCLUSION OF PROMPT TEXT AND ANSWER LINES:
   - NEVER include the printed question text above the diagram (e.g., "4 (a) Fig. 4.1 shows how an organic compound, Q, is produced from ethene."). ymin must start strictly BELOW the question text sentence.
   - NEVER include sub-question labels, questions, or answer dotted lines below the diagram (e.g., "(i) Name..."). ymax must end immediately below the figure caption.

VISUAL ASSET PLACEMENT RULES:
1. QUESTION STEM APPARATUS / DIAGRAMS (Root "visual_assets"):
   - ONLY a diagram, table, or figure that appears BEFORE or ABOVE sub-question (a) AND is introduced by the question stem text belongs to the question STEM. Place it in the root "visual_assets" array.
2. PART-SPECIFIC VISUAL ASSETS (Inside the respective part in "parts") — THE DEFAULT:
   - If a graph, diagram, table, or figure is referenced by, sits beside, or is required to answer a specific sub-question (e.g., part (a) says "The pie chart shows the results", or part (b) says "Complete the clock diagram", or the timetable/stem-and-leaf table appears inside part (b)'s area), you MUST place that visual asset inside THAT part's "visual_assets" array.
   - When in doubt, attach the asset to the part that mentions it — NEVER hoist it to the question stem. Only assets physically located before part (a) with no part referencing them go to the root.
   - Do NOT include the sub-question label "(c)" or question prompt text inside the visual asset bounding box! The bounding box should start cleanly at the top of the diagram/graph itself (e.g. top of the y-axis or apparatus) and stop after the figure caption (e.g. "Fig. 1.2").

STRICT BOUNDING BOX RULES:
1. COMPLETE VERTICAL COVERAGE (NEVER CUT OFF APPARATUS TOPS):
   - For ymin: Must start cleanly above the topmost rim, meniscus, opening, atom, bond, or stand of the apparatus/container/structure, and strictly BELOW the introductory question prompt text. Under NO circumstance start halfway down or cut off the top of a test tube, beaker, circuit, molecule, or object.
   - For ymax: Must end immediately below the figure caption (e.g. "Fig. 1.1") or bottom-most label, and strictly ABOVE any sub-questions like "(i)", "(a)", or answer lines.
   - For ymax: Must include the figure caption line (e.g., "Fig. 1.1", "Fig. 3.1") located directly below the drawing.
   - STRICTLY STOP BEFORE SUBQUESTIONS: Do NOT include question text like "(a) Define acceleration", dotted answer lines, or mark numbers "[1]". The visual asset stops immediately below the "Fig. X.X" caption!
2. COMPLETE HORIZONTAL COVERAGE (NEVER CUT OFF LABELS/ARROWS):
   - It MUST include all external pointer lines, arrows, leader lines, and callout text annotations pointing into or labeling parts of the diagram (e.g., "ball", "oil", "block of ice", "water", "ammeter", "pivot", "scale", "normal", "incident ray").
   - If there is label text to the left of the diagram, your 'xmin' MUST extend far enough to the left to fully encompass the entire word(s) of that label.
   - If there is label text to the right of the diagram, your 'xmax' MUST extend far enough to the right to fully encompass the entire word(s) of that label.

Ensure your response is valid JSON matching this exact schema:
{
  "number": "string",
  "text": "string",
  "marks": "number or null",
  "topics": [${topicsSchema}],
  "subtopics": [${subtopicsSchema}],
  "difficulty": "Easy or Medium or Hard",
  "skills": ["string"],
  "parts": [
    {
      "label": "string",
      "text": "string",
      "marks": "number or null",
      "visual_assets": [{"type": "string", "description": "string", "page_number": 1, "bounding_box": {"ymin": 0.0, "xmin": 0.0, "ymax": 1.0, "xmax": 1.0}}],
      "sub_parts": [
        {
          "label": "string",
          "text": "string",
          "marks": "number or null",
          "visual_assets": [],
          "sub_parts": [
            {
               "label": "string",
               "text": "string",
               "marks": "number or null",
               "visual_assets": [],
               "sub_parts": []
            }
          ]
        }
      ]
    }
  ],
  "visual_assets": [{"type": "string", "description": "string", "page_number": 1, "bounding_box": {"ymin": 0.0, "xmin": 0.0, "ymax": 1.0, "xmax": 1.0}}]
}`;

        const content: any[] = [
            { type: "text", text: "Extract the deep question details as JSON matching the schema." }
        ];

        for (const base64Image of questionImagesBase64) {
            content.push({ type: "image_url", image_url: { url: `data:image/png;base64,${base64Image}`, detail: "high" } });
        }

        const mD = this.resolveModel("gpt-6-luna");
        const response = await this.openai.chat.completions.create({
            model: mD,
            messages: [{ role: "system", content: systemInstruction }, { role: "user", content }],
            response_format: { type: "json_object" },
            ...(this.temperatureFor(mD, 0.1) !== undefined ? { temperature: this.temperatureFor(mD, 0.1) } : {}),
        });

        const textContent = response.choices[0].message.content || "{}";
        try {
            return JSON.parse(textContent) as ExtractedQuestion;
        } catch (err) {
            console.error("Failed to parse Detail JSON:", textContent);
            throw new Error("Invalid JSON from Detailer.");
        }
    }
}
