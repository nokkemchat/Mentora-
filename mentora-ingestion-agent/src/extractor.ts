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

CRITICAL FOR BOUNDING BOX: To help you achieve 100% millimeter-perfect accuracy, the provided images have a red and blue visual coordinate grid overlaid on them!
- Red lines represent the Y axis (0.05, 0.10, ..., 0.95).
- Blue lines represent the X axis (0.05, 0.10, ..., 0.95).
Simply read the numbers off the grid lines to determine exactly where the visual asset starts and ends!
For example, if a gas syringe diagram starts near the red line labeled Y:0.25 and ends near the red line labeled Y:0.60, your ymin is 0.25 and ymax is 0.60. Interpolate between the lines.
Ensure your bounding_box completely surrounds the ENTIRE visual asset. Include all titles, headers, axes, and labels. Be very generous and expand the box outward to ensure absolutely nothing is cut off.

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
