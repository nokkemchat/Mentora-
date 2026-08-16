import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.48.1"
import { extractText, getDocumentProxy } from 'npm:unpdf';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }
  let course_id_global: string | null = null;

  try {
    const { course_id, file_url } = await req.json();
    course_id_global = course_id;

    if (!course_id || !file_url) {
      throw new Error("Missing course_id or file_url");
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const updateProgress = async (status: string, progress: number, isSyncing = true) => {
      await supabaseAdmin.from('courses').update({
        sync_status: status,
        sync_progress: progress,
        is_syncing: isSyncing
      }).eq('id', course_id);
    };

    // 1. Download the PDF
    await updateProgress("Downloading PDF...", 10);
    const pdfResponse = await fetch(file_url);
    if (!pdfResponse.ok) {
      throw new Error(`Failed to fetch PDF: ${pdfResponse.statusText}`);
    }
    const pdfArrayBuffer = await pdfResponse.arrayBuffer();
    
    // 2. Extract text using unpdf (Edge-compatible PDF parser!)
    await updateProgress("Extracting text from PDF...", 30);
    const pdf = await getDocumentProxy(new Uint8Array(pdfArrayBuffer));
    const { text: extractedText } = await extractText(pdf, { mergePages: true });

    if (!extractedText || extractedText.trim().length === 0) {
      throw new Error("No text could be extracted from the PDF.");
    }

    // 3. Call OpenAI to process the extracted text
    const openaiKey = Deno.env.get('OPENAI_API_KEY');
    if (!openaiKey) {
      throw new Error("OPENAI_API_KEY is not set in edge function secrets.");
    }

    // --- CONTEXT-AWARE CHUNKING EXTRACTION ---
    // Do NOT strip newlines, just trim standard whitespace lightly so formatting remains
    const cleanedText = extractedText.replace(/[ \t]+/g, ' ').substring(0, 100000);

    // Phase 1A: Extract Course Metadata
    await updateProgress("Phase 1A: Extracting course metadata...", 35);
    const tableOfContentsText = cleanedText.substring(0, 30000);
    
    const metadataPrompt = `
You are an expert curriculum designer. Analyze the syllabus PDF text and extract ONLY the course metadata.

CRITICAL INSTRUCTION FOR LEVEL:
If the board is Cambridge, strictly distinguish between "IGCSE" and "O-Level" based on the syllabus title or document text. Do not guess or default to O-Level. If it is IGCSE, you MUST output "IGCSE".

Return ONLY a valid JSON object matching this EXACT structure:
{
  "course_metadata": {
    "title": "string (The core subject name, e.g. Physics, Chemistry, Accounting)",
    "board": "string (e.g. Cambridge, Edexcel, ZIMSEC, IB) or null",
    "level": "string (e.g. IGCSE, O-Level, AS-Level, A-Level) or null",
    "syllabus_code": "string (e.g. 0620, 9702) or null"
  }
}
Return ONLY raw JSON. No formatting.`;

    const phase1AResponse = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${openaiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: metadataPrompt },
          { role: "user", content: `Here is the beginning of the syllabus:\n\n${tableOfContentsText}` }
        ],
        response_format: { type: "json_object" }
      })
    });

    if (!phase1AResponse.ok) {
      throw new Error(`OpenAI Phase 1A Error: ${await phase1AResponse.text()}`);
    }

    let phase1AJson = (await phase1AResponse.json()).choices[0].message.content.replace(/```json/g, '').replace(/```/g, '').trim();
    let metadata: any = {};
    try {
      metadata = JSON.parse(phase1AJson).course_metadata || {};
    } catch (e) {
      console.warn("Failed to parse Phase 1A AI response.");
    }

    // Phase 1B: Extract Official Global Themes
    await updateProgress("Phase 1B: Analyzing global syllabus structure...", 40);
    const outlinePrompt = `
You are an expert curriculum designer. Analyze the syllabus PDF text and extract ONLY the major ACADEMIC structural hierarchy (Themes, Chapters, or Sections) that contain actual learning topics.

CRITICAL INSTRUCTIONS:
1. IGNORE administrative or boilerplate sections (e.g., "Syllabus overview", "Details of the assessment", "Why choose this syllabus", "Appendix", "Introduction").
2. Find the actual academic "Subject Content" section and extract ONLY the core subject topics/themes from within it (e.g., "1. General Physics", "2. Thermal Physics", "Algebra", "Calculus").
3. DO NOT extract specific subtopics or deep context. Extract only the high-level Themes.

Return ONLY a valid JSON object matching this EXACT structure:
{
  "themes": [
    "string (The exact name of the Theme or Chapter)"
  ]
}
Return ONLY raw JSON. No formatting.`;

    const phase1BResponse = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${openaiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: outlinePrompt },
          { role: "user", content: `Here is the beginning of the syllabus:\n\n${tableOfContentsText}` }
        ],
        response_format: { type: "json_object" }
      })
    });

    if (!phase1BResponse.ok) {
      throw new Error(`OpenAI Phase 1B Error: ${await phase1BResponse.text()}`);
    }

    let phase1BJson = (await phase1BResponse.json()).choices[0].message.content.replace(/```json/g, '').replace(/```/g, '').trim();
    let officialThemes = [];
    try {
      officialThemes = JSON.parse(phase1BJson).themes || [];
    } catch (e) {
      throw new Error("Failed to parse Phase 1B AI response.");
    }

    if (officialThemes.length === 0) {
      throw new Error("AI did not extract any official themes from the syllabus.");
    }

    // Update the course with extracted metadata
    if (metadata.title) {
       await supabaseAdmin.from('courses').update({
         title: metadata.title,
         board: metadata.board || null,
         level: metadata.level || null,
         syllabus_code: metadata.syllabus_code || null
       }).eq('id', course_id);
    }

    // Phase 2: Context-Aware Chunking
    const systemPrompt = `
You are an expert curriculum designer. Analyze this chunk of the syllabus PDF and extract the structural hierarchy (Themes and Topics) ALONG with the detailed educational context ONLY for the subtopics.

CRITICAL INSTRUCTIONS:
1. The OFFICIAL Themes of this syllabus are: ${JSON.stringify(officialThemes)}.
2. You MUST strictly map any subtopics you find in this chunk to one of the Official Themes provided above. 
3. DO NOT invent new themes or chapters. If a heading in this chunk is just a subtopic (e.g. "1.5 Forces"), DO NOT make it a Theme. Nest it under its correct official Theme (e.g. "1 General Physics").
4. Extract the "educational context" (Core outcomes, Supplement outcomes, etc.) ONLY if it explicitly exists. DO NOT hallucinate.
5. If the syllabus does not explicitly state a Difficulty or Duration, return null.
6. DO NOT generate ANY system placeholders (like lesson_notes, videos, etc).

Your response must be ONLY a valid JSON object matching this EXACT structure:
{
  "topics": [
    {
      "title": "string (MUST exactly match one of the Official Themes)",
      "subtopics": [
        {
          "title": "string (The name of the Subtopic)",
          "difficulty": "Easy" | "Medium" | "Hard" | null,
          "estimated_time": "string (e.g. 45 mins) | null",
          "extracted_context": {
            "core_learning_outcomes": ["string"],
            "supplement_learning_outcomes": ["string"],
            "practicals": ["string"],
            "suggested_activities": ["string"],
            "assessments": ["string"]
          }
        }
      ]
    }
  ]
}
Return ONLY raw JSON. No formatting.`;

    const chunkSize = 25000;
    const overlap = 3000;
    const chunks = [];
    for (let i = 0; i < cleanedText.length; i += (chunkSize - overlap)) {
      chunks.push(cleanedText.substring(i, i + chunkSize));
    }

    await updateProgress(\`Phase 2: Analyzing \${chunks.length} sections with context...\`, 50);
    const chunkPromises = chunks.map(async (chunkText) => {
      const openaiResponse = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${openaiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: `Here is a section of the syllabus text:\n\n${chunkText}` }
          ],
          response_format: { type: "json_object" }
        })
      });

      if (!openaiResponse.ok) {
        console.error("OpenAI Error:", await openaiResponse.text());
        return []; 
      }
      
      let jsonText = (await openaiResponse.json()).choices[0].message.content.replace(/```json/g, '').replace(/```/g, '').trim();
      try {
        const data = JSON.parse(jsonText);
        return data.topics || [];
      } catch (e) {
        return [];
      }
    });

    const chunkResults = await Promise.all(chunkPromises);
    
    let allTopics: any[] = [];
    chunkResults.forEach(topics => {
      if (Array.isArray(topics)) {
        allTopics = allTopics.concat(topics);
      }
    });

    if (allTopics.length === 0) {
      throw new Error("AI did not extract any valid topics from the chunks.");
    }

    const mergedTopicsMap = new Map();
    for (const topic of allTopics) {
      if (!topic.title) continue;
      
      if (!mergedTopicsMap.has(topic.title)) {
        mergedTopicsMap.set(topic.title, { title: topic.title, subtopics: [] });
      }
      
      if (topic.subtopics && Array.isArray(topic.subtopics)) {
         const existingSubtopics = mergedTopicsMap.get(topic.title).subtopics;
         for (const newSub of topic.subtopics) {
           // Prevent exact duplicate subtopics from overlap regions
           if (!existingSubtopics.find((s: any) => s.title === newSub.title)) {
             existingSubtopics.push(newSub);
           }
         }
      }
    }
    
    const finalTopics = Array.from(mergedTopicsMap.values());

    // --- Programmatic Placeholders ---
    const placeholders = {
      lesson_notes: [],
      videos: [],
      presentations: [],
      pdf_resources: [],
      exercises: [],
      homework: [],
      quiz: [],
      teacher_notes: []
    };

    // 4. Insert into Supabase
    await updateProgress("Saving extracted topics to database...", 90);
    // To prevent duplicates, delete existing topics for this course first
    await supabaseAdmin.from('topics').delete().eq('course_id', course_id);

    let topicIndex = 1;
    for (const topic of finalTopics) {
      const topicId = crypto.randomUUID();
      const { data: insertedTopic, error: topicError } = await supabaseAdmin
        .from('topics')
        .insert({
          id: topicId,
          course_id: course_id,
          title: topic.title
        })
        .select('id')
        .single();

      if (topicError) throw topicError;

      if (topic.subtopics && Array.isArray(topic.subtopics)) {
        let subIndex = 1;
        const subtopicInserts = topic.subtopics.map((sub: any) => ({
          id: crypto.randomUUID(),
          topic_id: topicId,
          title: sub.title,
          difficulty: sub.difficulty || null,
          estimated_time: sub.estimated_time || null,
          workspace_template: {
            extracted_context: sub.extracted_context || {},
            placeholders: placeholders
          }
        }));

        const { error: subError } = await supabaseAdmin
          .from('subtopics')
          .insert(subtopicInserts);

        if (subError) throw subError;
      }
    }

    await updateProgress("Complete!", 100, false);

    return new Response(JSON.stringify({ success: true, message: "Syllabus processed and workspace generated via OpenAI." }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });

  } catch (error: any) {
    console.error("Error processing syllabus:", error);
    
    // Attempt to set error state
    try {
      if (course_id_global) {
        const supabaseAdmin = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');
        await supabaseAdmin.from('courses').update({ sync_status: `Error: ${error.message}`, is_syncing: false }).eq('id', course_id_global);
      }
    } catch (_) { }

    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })
  }
})
