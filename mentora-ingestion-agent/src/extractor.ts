import OpenAI from 'openai';
import * as fs from 'fs/promises';

export interface SlicedQuestion {
    number: string;
    page_slices: { 
        page_number: number; 
        bounding_box: { ymin: number; xmin: number; ymax: number; xmax: number };
    }[];
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

    constructor(apiKey: string) {
        this.openai = new OpenAI({ apiKey });
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

CRITICAL COMPLETENESS CHECK: You MUST scan every single page until the very end of the document. Do NOT skip the last question. To ensure you do not miss any, first count the total number of major questions in the paper and output it as \`total_questions_count\`.

Ensure your response is valid JSON matching this schema exactly:
{
  "metadata": { "curriculum": "Strictly 'Cambridge' or 'ZIMSEC'", "subject": "string", "grade_level": "string", "year": "number", "session": "string", "paper_number": "number", "variant": "string" },
  "total_questions_count": 0,
  "questions": [
    { 
      "number": "string", 
      "page_slices": [
        { "page_number": "number", "bounding_box": { "ymin": "number", "xmin": "number", "ymax": "number", "xmax": "number" } }
      ]
    }
  ]
}`;

        const content: any[] = [{ type: "text", text: "Extract the metadata and question slices as JSON." }];

        for (const imagePath of pageImages) {
            const imageBuffer = await fs.readFile(imagePath);
            const base64Image = imageBuffer.toString('base64');
            content.push({
                type: "image_url",
                image_url: { url: `data:image/png;base64,${base64Image}`, detail: "high" }
            });
        }

        const response = await this.openai.chat.completions.create({
            model: "gpt-4o",
            messages: [{ role: "system", content: systemInstruction }, { role: "user", content }],
            response_format: { type: "json_object" },
            temperature: 0.1,
        });

        const textContent = response.choices[0].message.content || "{}";
        try {
            return JSON.parse(textContent) as SlicedPaper;
        } catch (err) {
            console.error("Failed to parse Slicer JSON:", textContent);
            throw new Error("Invalid JSON from Slicer.");
        }
    }

    async extractQuestionDetail(questionImagesBase64: string[], syllabusHierarchy?: Record<string, string[]> | null): Promise<ExtractedQuestion> {
        let syllabusInstruction = "";
        let topicsSchema = '"string"';
        let subtopicsSchema = '"string"';
        if (syllabusHierarchy && Object.keys(syllabusHierarchy).length > 0) {
            syllabusInstruction = `\n\n=== SYLLABUS TOPIC MATCHING (CRITICAL) ===\nYou are processing a question paper that belongs to a specific syllabus. The official syllabus topics and their subtopics are:\n${JSON.stringify(syllabusHierarchy, null, 2)}\n\nYou MUST select the single most relevant high-level topic (the keys of the JSON above) for the "topics" array. You MUST ALSO select the single most relevant subtopic (from the values of that key) for the "subtopics" array. DO NOT invent topics or subtopics. You MUST use the EXACT strings from the list. If you cannot decide, pick the closest ones. DO NOT output any topic or subtopic that is not in the list.`;
            topicsSchema = `"string (MUST be an exact key from the syllabus JSON)"`;
            subtopicsSchema = `"string (MUST be an exact value from the selected topic's array in the syllabus JSON)"`;
        }

        const systemInstruction = `You are an expert educational content ingestion agent.
You are given cropped images representing a SINGLE major exam question. There may be multiple images if the question spans across multiple pages.${syllabusInstruction}

Extract the deeply nested structure of the question into JSON.
Accurately capture all nested sub-questions (parts like a, b, c, and sub_parts like i, ii, iii) and their marks. 
CRITICAL: Questions can be deeply nested! Use \`sub_parts\` recursively! (e.g., \`parts\` contains \`sub_parts\`, which can contain another level of \`sub_parts\` for sub-sub-parts). DO NOT skip any text or nested question.
Identify any visual assets (images, diagrams, graphs, tables) embedded within the text and provide their type, description, page_number (1-indexed based on the order of cropped images provided here), and bounding_box [ymin, xmin, ymax, xmax] relative to the specific cropped image (0.0 to 1.0).

COORDINATE GRID SYSTEM (HIGH PRECISION):
Each input image has an overlaid coordinate grid with:
- Red horizontal lines marking Y from 0.05 to 0.95 (e.g., Y:0.10, Y:0.20, Y:0.30...)
- Blue vertical lines marking X from 0.05 to 0.95 (e.g., X:0.10, X:0.20, X:0.30...)
Use these grid markings to read the exact fractional coordinates (0.0 to 1.0) of each visual asset.

VISUAL ASSET PLACEMENT RULES:
1. QUESTION STEM APPARATUS / DIAGRAMS (Root "visual_assets"):
   - Any diagram or experimental apparatus that appears BEFORE or ABOVE sub-question (a) (e.g., Fig. 1.1 showing the experimental setup) belongs to the question STEM.
   - You MUST place it in the root "visual_assets" array of the question, NOT inside parts[0]!
2. PART-SPECIFIC VISUAL ASSETS (Inside the respective part in "parts"):
   - If a graph, diagram, circuit, or table is part of a sub-question (e.g., part (c) has "Fig. 1.2 is the speed-time graph for the falling ball"), you MUST place that visual asset in that specific part's "visual_assets" array (e.g. inside part 'c').
   - Do NOT include the sub-question label "(c)" or question prompt text inside the visual asset bounding box! The bounding box should start cleanly at the top of the diagram/graph itself (e.g. top of the y-axis or apparatus) and stop after the figure caption (e.g. "Fig. 1.2").

STRICT BOUNDING BOX RULES:
1. COMPLETE VERTICAL COVERAGE (NEVER CUT OFF APPARATUS TOPS):
   - For ymin: Must encompass the introductory figure sentence (e.g., "Fig. 1.1 shows the ball falling through the oil.") OR start cleanly above the topmost rim, meniscus, opening, or stand of the apparatus/container. Under NO circumstance start halfway down or cut off the top of a test tube, beaker, circuit, or object.
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

        const response = await this.openai.chat.completions.create({
            model: "gpt-4o",
            messages: [{ role: "system", content: systemInstruction }, { role: "user", content }],
            response_format: { type: "json_object" },
            temperature: 0.1,
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
