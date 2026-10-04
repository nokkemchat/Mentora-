import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.48.1"
import { extractText, getDocumentProxy } from 'npm:unpdf';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Convert any string to clean Title Case with proper hyphen handling
function toTitleCase(str: string): string {
  if (!str) return '';
  const minorWords = new Set(['and', 'or', 'of', 'in', 'the', 'for', 'on', 'with', 'at', 'by', 'to', 'a', 'an']);
  return str
    .toLowerCase()
    .split(' ')
    .map((word, index) => {
      if (word.includes('-')) {
        return word.split('-').map((part, pIdx) => {
          if (pIdx > 0 && minorWords.has(part)) return part;
          return part.charAt(0).toUpperCase() + part.slice(1);
        }).join('-');
      }
      if (index > 0 && minorWords.has(word)) return word;
      return word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join(' ')
    .trim();
}

// Clean and normalize topic / subtopic titles
function cleanTitle(title: string): string {
  if (!title) return '';
  const stripped = title
    .replace(/^(\d+\.)+\d*\s*/, '') // remove section numbering like "8.1.1 " or "7.2.0 "
    .replace(/^topic\s*\d*[:.-]?\s*/i, '') // remove "Topic 1: "
    .replace(/^[•\-\*]\s*/, '') // remove leading bullet chars
    .replace(/\s+/g, ' ')
    .trim();
  const titled = toTitleCase(stripped);
  // Normalize known sub-phrasings that might be extracted as parent topics
  if (/^Periodic Trends$/i.test(titled)) return 'Periodic Table';
  if (/^Rates? of Reactions?$/i.test(titled)) return 'Reaction Kinetics';
  return titled;
}

// Normalize title for lookup & deduplication keys
function normalizeTitle(name: string): string {
  return cleanTitle(name).toLowerCase().replace(/[^a-z0-9]/g, '');
}

// Intelligent boundary-aware chunk splitting
function splitSyllabusIntoChunks(text: string, targetSize = 9000, minOverlap = 2200): string[] {
  const chunks: string[] = [];
  let start = 0;
  while (start < text.length) {
    let end = start + targetSize;
    if (end >= text.length) {
      chunks.push(text.substring(start));
      break;
    }
    // Find nearest section header (e.g. 8.X) or double newline before end
    const searchZone = text.substring(Math.max(start, end - 1800), end);
    const headerMatch = searchZone.search(/\n(?=[1-9]\.\d+)/);
    if (headerMatch !== -1) {
      end = (end - 1800) + headerMatch;
    } else {
      const nlMatch = searchZone.lastIndexOf("\n\n");
      if (nlMatch !== -1) {
        end = (end - 1800) + nlMatch;
      }
    }
    chunks.push(text.substring(start, end));
    start = Math.max(start + 1, end - minOverlap);
  }
  return chunks;
}

// Filter out broad discipline macro-domains (e.g. "Physical Chemistry", "Inorganic Chemistry")
function isMacroDomain(title: string, subjectTitle?: string): boolean {
  const t = cleanTitle(title).toLowerCase();
  const s = subjectTitle ? cleanTitle(subjectTitle).toLowerCase() : '';
  if (!t) return false;

  if (s && s.length > 3 && t.endsWith(s) && t !== s) {
    return true;
  }

  if (/\b(macro\s*topic|domain|broad\s*field|pure\s*mathematics|applied\s*mathematics|world\s*history|general\s*geography)\b/i.test(t)) {
    return true;
  }

  return false;
}

// Prune single-topic items whose sole subtopic is already part of an established multi-subtopic topic
function pruneRedundantPromotedTopics(topics: any[]): any[] {
  const establishedSubtopics = new Set<string>();
  for (const t of topics) {
    if (t.subtopics.length > 1) {
      for (const s of t.subtopics) {
        establishedSubtopics.add(normalizeTitle(s.title));
      }
    }
  }

  return topics.filter(t => {
    if (t.subtopics.length === 1) {
      const tNorm = normalizeTitle(t.title);
      const sNorm = normalizeTitle(t.subtopics[0].title);
      if (establishedSubtopics.has(tNorm) || establishedSubtopics.has(sNorm)) {
        return false;
      }
    }
    return true;
  });
}

// Helper to merge chunk outputs in sequential order without losing subtopics
function mergeExtractedTopics(chunkOutputs: any[], subjectTitle?: string): any[] {
  const merged: any[] = [];
  const topicMap = new Map<string, any>();

  for (const chunk of chunkOutputs) {
    const topics = Array.isArray(chunk.topics) ? chunk.topics : [];
    for (const t of topics) {
      const tTitle = cleanTitle(t.title || t.topic || '');
      if (!tTitle || isMacroDomain(tTitle, subjectTitle)) continue;
      const tNorm = normalizeTitle(tTitle);

      let existingTopic = topicMap.get(tNorm);
      if (!existingTopic) {
        existingTopic = {
          title: tTitle,
          subtopics: [],
          _subSet: new Set<string>()
        };
        topicMap.set(tNorm, existingTopic);
        merged.push(existingTopic);
      }

      const rawSubs = Array.isArray(t.subtopics) ? t.subtopics : [];
      for (const s of rawSubs) {
        const sTitle = cleanTitle(typeof s === 'string' ? s : (s.title || s.name || ''));
        if (!sTitle) continue;
        const sNorm = normalizeTitle(sTitle);
        // Filter out cross-section contamination (e.g. Water Purification mistakenly under Laboratory Techniques)
        if (tNorm.includes('laboratory') && sNorm.includes('waterpurification')) continue;

        if (existingTopic._subSet.has(sNorm)) {
          // Merge learning context if already present from an overlapping chunk
          const existingSub = existingTopic.subtopics.find((sub: any) => normalizeTitle(sub.title) === sNorm);
          if (existingSub && s.extracted_context) {
            ['core_learning_outcomes', 'content_knowledge', 'suggested_activities', 'suggested_resources'].forEach(k => {
              if (Array.isArray(s.extracted_context[k])) {
                existingSub.extracted_context[k] = Array.from(new Set([...(existingSub.extracted_context[k] || []), ...s.extracted_context[k]]));
              }
            });
          }
          continue;
        }

        existingTopic._subSet.add(sNorm);
        existingTopic.subtopics.push({
          title: sTitle,
          difficulty: s.difficulty || "Medium",
          estimated_time: s.estimated_time || null,
          extracted_context: s.extracted_context || {
            core_learning_outcomes: [],
            content_knowledge: [],
            suggested_activities: [],
            suggested_resources: []
          }
        });
      }
    }
  }

  const baseMerged = merged.map(({ _subSet, ...rest }) => rest).filter(t => t.subtopics.length > 0);
  return pruneRedundantPromotedTopics(baseMerged);
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

    // 1. Download PDF
    await updateProgress("Downloading PDF...", 10);
    const pdfResponse = await fetch(file_url);
    if (!pdfResponse.ok) {
      throw new Error(`Failed to fetch PDF: ${pdfResponse.statusText}`);
    }
    const pdfArrayBuffer = await pdfResponse.arrayBuffer();
    
    // 2. Extract text using unpdf
    await updateProgress("Extracting text from PDF...", 25);
    const pdf = await getDocumentProxy(new Uint8Array(pdfArrayBuffer));
    const { text: extractedText } = await extractText(pdf, { mergePages: true });

    if (!extractedText || extractedText.trim().length === 0) {
      throw new Error("No text could be extracted from the PDF.");
    }

    const openaiKey = Deno.env.get('OPENAI_API_KEY');
    if (!openaiKey) {
      throw new Error("OPENAI_API_KEY is not set in edge function secrets.");
    }

    const cleanedText = extractedText.replace(/[ \t]+/g, ' ');

    // =========================================================================
    // PHASE 1: METADATA & STAGE DISCOVERY AGENT
    // =========================================================================
    await updateProgress("Phase 1: Discovering syllabus structure...", 35);
    const preambleText = cleanedText.substring(0, 3500);

    const metadataPrompt = `
You are an expert curriculum cataloger.
Analyze the syllabus document preamble and extract the course metadata and multi-form structure.

Return ONLY raw JSON:
{
  "course_metadata": {
    "title": "string (Subject name, e.g. Chemistry, Biology, Mathematics)",
    "board": "string (e.g. ZIMSEC, Cambridge, Edexcel)",
    "level": "string (e.g. O-Level, IGCSE, A-Level)",
    "syllabus_code": "string or null",
    "available_forms": ["string (e.g. 'Form 3', 'Form 4' or 'Form 1', 'Form 2', or [] if unified)"]
  }
}`;

    const metadataResponse = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${openaiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: metadataPrompt },
          { role: "user", content: preambleText }
        ],
        response_format: { type: "json_object" },
        temperature: 0.0
      })
    });

    let metadataResult: any = {};
    if (metadataResponse.ok) {
      try {
        const jsonStr = (await metadataResponse.json()).choices[0].message.content.replace(/```json/g, '').replace(/```/g, '').trim();
        metadataResult = JSON.parse(jsonStr).course_metadata || {};
      } catch (_) {}
    }

    let availableForms: string[] = Array.isArray(metadataResult.available_forms) ? metadataResult.available_forms : [];

    // Fallback detection for multi-form
    if (availableForms.length === 0) {
      const formMatches = Array.from(cleanedText.matchAll(/form\s*([1-6])/gi)).map(m => parseInt(m[1], 10));
      const uniqueForms = Array.from(new Set(formMatches)).sort((a, b) => a - b);
      if (uniqueForms.length >= 2) {
        availableForms = uniqueForms.map(f => `Form ${f}`);
      }
    }

    const isMultiForm = availableForms.length > 0;

    // Update course metadata in Supabase
    if (metadataResult.title) {
      const courseUpdate: any = {
        title: metadataResult.title,
        board: metadataResult.board || null,
        level: metadataResult.level || null,
        syllabus_code: metadataResult.syllabus_code || null,
        available_forms: availableForms
      };
      let { error: updateErr } = await supabaseAdmin.from('courses').update(courseUpdate).eq('id', course_id);
      if (updateErr) {
        delete courseUpdate.available_forms;
        await supabaseAdmin.from('courses').update(courseUpdate).eq('id', course_id);
      }
    }

    // =========================================================================
    // PHASE 2: SECTION BOUNDARIES & DEDICATED FORM SLICES
    // =========================================================================
    const postTOC = cleanedText.substring(5000);
    const assessRelIdx = postTOC.search(/(?:[89]\.0\s*ASSESSMENT|ASSESSMENT\s*OBJECTIVES|SCHEME\s*OF\s*ASSESSMENT|DETAILS\s*OF\s*THE\s*ASSESSMENT)/i);
    const endOfCompetenciesIdx = assessRelIdx !== -1 ? 5000 + assessRelIdx : cleanedText.length;

    const formTextSlices: Record<string, string> = {};
    if (isMultiForm) {
      const formPositions: { form: string; pos: number }[] = [];
      for (const formName of availableForms) {
        const formEscaped = formName.replace(/\s+/g, '\\s*');
        const pattern = new RegExp(`(?:${formEscaped}\\s*(?:SYLLABUS|COMPETENCY\\s*MATRIX|CURRICULUM)|COMPETENCY\\s*MATRIX\\s*${formEscaped}|8\\.\\d+\\.0\\s*${formEscaped})`, 'i');
        const match = cleanedText.substring(3500).search(pattern);
        if (match !== -1) {
          formPositions.push({ form: formName, pos: 3500 + match });
        } else {
          const simplePattern = new RegExp(`(?:\\n|\\r|^)\\s*(?:\\d+\\.\\d+\\s+)?${formEscaped}\\s+(?:SYLLABUS|CONTENT)`, 'i');
          const simpleMatch = cleanedText.substring(3500).search(simplePattern);
          if (simpleMatch !== -1) {
            formPositions.push({ form: formName, pos: 3500 + simpleMatch });
          }
        }
      }

      formPositions.sort((a, b) => a.pos - b.pos);

      if (formPositions.length === availableForms.length) {
        for (let i = 0; i < formPositions.length; i++) {
          const current = formPositions[i];
          const nextPos = (i + 1 < formPositions.length) ? formPositions[i + 1].pos : endOfCompetenciesIdx;
          formTextSlices[current.form] = cleanedText.substring(current.pos, nextPos);
        }
      } else {
        const startPos = formPositions.length > 0 ? formPositions[0].pos : 5000;
        const totalContent = cleanedText.substring(startPos, endOfCompetenciesIdx);
        const segmentLen = Math.floor(totalContent.length / availableForms.length);
        availableForms.forEach((f, idx) => {
          formTextSlices[f] = totalContent.substring(idx * segmentLen, (idx + 1) * segmentLen);
        });
      }
    } else {
      formTextSlices["General"] = cleanedText.substring(5000, endOfCompetenciesIdx);
    }

    // =========================================================================
    // =========================================================================
    // PHASE 3: STAGE OUTLINE DISCOVERY & FOCUSED BATCH SUB-AGENTS PER FORM
    // =========================================================================
    const formsToProcess = isMultiForm ? availableForms : ["General"];
    const finalTopics: any[] = [];

    for (let fIdx = 0; fIdx < formsToProcess.length; fIdx++) {
      const formName = formsToProcess[fIdx];
      const formSlice = formTextSlices[formName] || cleanedText;

      await updateProgress(`Phase 3: Cataloging curriculum outline for ${formName}...`, 40 + Math.floor((fIdx / formsToProcess.length) * 45));

      // 1. Stage Outline Discovery Agent: Extract ordered list of genuine parent topics for this form
      const outlinePrompt = `
You are an expert curriculum cataloger.
Analyze the syllabus content for "${formName}".
Extract the complete, ordered list of genuine Academic Parent Topics in the exact chronological order they appear in this section.

CRITICAL RULES:
1. Scan EVERY section from the beginning to the end of the text.
2. Identify genuine Academic Parent Topics / Main Subject Units (e.g. "Laboratory Techniques", "Matter", "Atoms, Elements and Compounds", "The Mole Concept", "Stoichiometry", "Acids, Bases and Salts", "Electrochemistry", "Chemical Energetics", "Equilibria", "Reaction Kinetics", "Periodic Table", "Metals and Non-Metals", "Fuels", "Classification and Nomenclature of Organic Compounds", "Hydrocarbons", "Alcohols", "Carboxylic Acids", "Polymers", "Waste Management", "Pollution", "Water Purification", "Herbs").
3. DO NOT MISS ANY TOPIC! Be exhaustive. Ensure you include:
   - "Electrochemistry"
   - "Acids, Bases and Salts"
   - "Fuels"
   - "Waste Management"
   - "Pollution"
   - "Herbs"
4. EXCLUDE macro-discipline domain headings (e.g. "Physical Chemistry", "Inorganic Chemistry", "Organic Chemistry", "Environmental Chemistry", "Pure Mathematics").
5. EXCLUDE individual subtopics (e.g. "Volumetric Analysis", "Separation Techniques", "Qualitative Analysis", "Atomic Structure", "Isomerism", "Fermentation", "Synthetic Polymers", "Processing of Diamond and Coal" are SUBTOPICS under parent topics, NOT standalone parent topics).
6. Strip section numbers (e.g. "8.1.1", "8.17.1").

Return raw JSON:
{
  "topics": ["string"]
}`;

      let discoveredTopicNames: string[] = [];
      try {
        const outlineResp = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${openaiKey}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            model: "gpt-4o-mini",
            messages: [
              { role: "system", content: outlinePrompt },
              { role: "user", content: formSlice }
            ],
            response_format: { type: "json_object" },
            temperature: 0.0
          })
        });

        if (outlineResp.ok) {
          const json = await outlineResp.json();
          const parsed = JSON.parse(json.choices[0].message.content.replace(/```json/g, '').replace(/```/g, '').trim());
          if (Array.isArray(parsed.topics)) {
            discoveredTopicNames = parsed.topics
              .map((t: string) => cleanTitle(t))
              .filter((t: string) => t && !isMacroDomain(t, metadataResult.title));
          }
        }
      } catch (err) {
        console.error(`Outline discovery error for ${formName}:`, err);
      }

      console.log(`Discovered ${discoveredTopicNames.length} outline topics for ${formName}:`, discoveredTopicNames);

      let formTopics: any[] = [];

      if (discoveredTopicNames.length > 0) {
        // 2. Focused Batch Worker Sub-Agents: Process topics in small batches of 3 to preserve all subtopics (> 2)
        const topicBatches: string[][] = [];
        for (let i = 0; i < discoveredTopicNames.length; i += 3) {
          topicBatches.push(discoveredTopicNames.slice(i, i + 3));
        }

        const batchPromises = topicBatches.map(async (batchTopics, bIdx) => {
          const batchWorkerPrompt = `
You are an expert curriculum architect.
Extract all subtopics and learning competencies for ONLY the following assigned Parent Topics in "${formName}":
${JSON.stringify(batchTopics)}

CRITICAL PARSING RULES:
1. UNDER EACH ASSIGNED PARENT TOPIC:
   - Identify every subtopic in the "SUB TOPIC" column of the Competency Matrix table from top to bottom.
   - List them in the EXACT sequential order they appear in the table.
   - DO NOT MISS ANY SUBTOPIC, especially when a topic contains multiple subtopics (> 2 subtopics, e.g. 3, 4, 5 subtopics).
     For example:
     * Under "Laboratory Techniques", you MUST include all subtopics: "Volumetric Analysis", "Separation Techniques", "Qualitative Analysis".
     * Under "Metals and Non-Metals", you MUST include all subtopics: "Composition of Mineral Ores", "Extraction of Metals", "Processing of Diamond and Coal", "Liquefaction and Fractional Distillation of Air".
     * Under "The Mole Concept", include all subtopics: "Mole" (or "Percentage Composition", "Empirical and Molecular Formulae", "Molar Gas Volume").
     * Under "Equilibria", include all subtopics: "Reversible Reactions", "Dynamic Equilibrium", "Haber Process" (or "Production of Sulfuric Acid", "Industrial Applications").
     * Under "Atoms, Elements and Compounds", include all subtopics: "Atomic Structure", "Elements", "Chemical Bonding".
   - Strip section numbers from subtopic titles (e.g. "8.17.2 Volumetric Analysis" becomes "Volumetric Analysis").
2. FOR EACH SUBTOPIC, EXTRACT:
   - "title": Clean title in Title Case
   - "difficulty": "Easy" | "Medium" | "Hard"
   - "estimated_time": string (e.g. "2 hours", "1.5 hours") or null
   - "extracted_context":
     * "core_learning_outcomes": Array of bullet points from "OBJECTIVES" / "LEARNING OBJECTIVES" ("Learners should be able to: ...")
     * "content_knowledge": Array of bullet points from "CONTENT (ATTITUDES, SKILLS AND KNOWLEDGE)"
     * "suggested_activities": Array of bullet points from "SUGGESTED NOTES AND ACTIVITIES"
     * "suggested_resources": Array of bullet points from "SUGGESTED RESOURCES"
3. DO NOT invent new parent topics. ONLY output the specified parent topics with their respective subtopics.

Return ONLY raw JSON:
{
  "topics": [
    {
      "title": "Exact Assigned Parent Topic Name",
      "subtopics": [
        {
          "title": "Subtopic Name",
          "difficulty": "Easy" | "Medium" | "Hard",
          "estimated_time": "string | null",
          "extracted_context": {
            "core_learning_outcomes": ["string"],
            "content_knowledge": ["string"],
            "suggested_activities": ["string"],
            "suggested_resources": ["string"]
          }
        }
      ]
    }
  ]
}`;

          try {
            const resp = await fetch("https://api.openai.com/v1/chat/completions", {
              method: "POST",
              headers: {
                "Authorization": `Bearer ${openaiKey}`,
                "Content-Type": "application/json"
              },
              body: JSON.stringify({
                model: "gpt-4o-mini",
                messages: [
                  { role: "system", content: batchWorkerPrompt },
                  { role: "user", content: `Here is the syllabus text for ${formName}:\n\n${formSlice}` }
                ],
                response_format: { type: "json_object" },
                temperature: 0.0,
                max_tokens: 4096
              })
            });

            if (!resp.ok) {
              console.error(`Batch ${bIdx} error for ${formName}:`, await resp.text());
              return { topics: [] };
            }

            const jsonStr = (await resp.json()).choices[0].message.content.replace(/```json/g, '').replace(/```/g, '').trim();
            return JSON.parse(jsonStr);
          } catch (err) {
            console.error(`Batch ${bIdx} failed for ${formName}:`, err);
            return { topics: [] };
          }
        });

        const batchOutputs = await Promise.all(batchPromises);
        formTopics = mergeExtractedTopics(batchOutputs, metadataResult.title);

        // Sort formTopics to strictly match the canonical discoveredTopicNames order
        const topicOrderMap = new Map<string, number>();
        discoveredTopicNames.forEach((name, idx) => topicOrderMap.set(normalizeTitle(name), idx));
        formTopics.sort((a, b) => {
          const idxA = topicOrderMap.get(normalizeTitle(a.title)) ?? 999;
          const idxB = topicOrderMap.get(normalizeTitle(b.title)) ?? 999;
          return idxA - idxB;
        });
      }

      // Fallback if outline discovery was empty
      if (formTopics.length === 0) {
        const chunks = splitSyllabusIntoChunks(formSlice, 7500, 1800);
        const fallbackWorkerPrompt = `
You are an expert curriculum architect.
Analyze this section of the Competency Matrix table for "${formName}".
Extract all academic Parent Topics, their Subtopics, and competencies in exact sequential order.
Do not miss any subtopic when a topic has > 2 subtopics.
Return ONLY raw JSON:
{
  "topics": [
    {
      "title": "Parent Topic Title",
      "subtopics": [
        {
          "title": "Subtopic Title",
          "difficulty": "Easy" | "Medium" | "Hard",
          "estimated_time": "string | null",
          "extracted_context": {
            "core_learning_outcomes": ["string"],
            "content_knowledge": ["string"],
            "suggested_activities": ["string"],
            "suggested_resources": ["string"]
          }
        }
      ]
    }
  ]
}`;

        const fallbackPromises = chunks.map(async (chunkText) => {
          try {
            const resp = await fetch("https://api.openai.com/v1/chat/completions", {
              method: "POST",
              headers: {
                "Authorization": `Bearer ${openaiKey}`,
                "Content-Type": "application/json"
              },
              body: JSON.stringify({
                model: "gpt-4o-mini",
                messages: [
                  { role: "system", content: fallbackWorkerPrompt },
                  { role: "user", content: chunkText }
                ],
                response_format: { type: "json_object" },
                temperature: 0.0,
                max_tokens: 4096
              })
            });
            if (!resp.ok) return { topics: [] };
            const jsonStr = (await resp.json()).choices[0].message.content.replace(/```json/g, '').replace(/```/g, '').trim();
            return JSON.parse(jsonStr);
          } catch (_) {
            return { topics: [] };
          }
        });

        const fallbackOutputs = await Promise.all(fallbackPromises);
        formTopics = mergeExtractedTopics(fallbackOutputs, metadataResult.title);
      }

      for (const t of formTopics) {
        finalTopics.push({
          ...t,
          form: isMultiForm ? formName : null
        });
      }
    }

    if (finalTopics.length === 0) {
      throw new Error("Failed to extract topics from syllabus. Please verify document content.");
    }

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

    // =========================================================================
    // PERSISTENCE: SAVE TOPICS & SUBTOPICS WITH EXACT ORDER_INDEX & FORM
    // =========================================================================
    await updateProgress("Saving extracted topics to database...", 90);

    // Delete existing topics for this course to prevent duplicates
    await supabaseAdmin.from('topics').delete().eq('course_id', course_id);

    let topicIndex = 1;
    for (const topic of finalTopics) {
      const topicId = crypto.randomUUID();
      const topicInsertObj: any = {
        id: topicId,
        course_id: course_id,
        title: topic.title,
        order_index: topicIndex,
        workspace_template: {
          form: topic.form || null,
          order_index: topicIndex
        }
      };
      if (topic.form) topicInsertObj.form = topic.form;
      topicIndex++;

      let { data: insertedTopic, error: topicError } = await supabaseAdmin
        .from('topics')
        .insert(topicInsertObj)
        .select('id')
        .single();

      if (topicError) {
        delete topicInsertObj.form;
        delete topicInsertObj.order_index;
        const retryRes = await supabaseAdmin
          .from('topics')
          .insert(topicInsertObj)
          .select('id')
          .single();
        if (retryRes.error) throw retryRes.error;
        insertedTopic = retryRes.data;
      }

      if (topic.subtopics && Array.isArray(topic.subtopics)) {
        const subtopicInserts = topic.subtopics.map((sub: any, sIdx: number) => ({
          id: crypto.randomUUID(),
          topic_id: topicId,
          title: sub.title,
          difficulty: sub.difficulty || null,
          estimated_time: sub.estimated_time || null,
          workspace_template: {
            order_index: sIdx + 1,
            extracted_context: sub.extracted_context || {},
            placeholders: placeholders,
            content: []
          }
        }));

        const { error: subError } = await supabaseAdmin
          .from('subtopics')
          .insert(subtopicInserts);

        if (subError) throw subError;
      }
    }

    await updateProgress("Complete!", 100, false);

    return new Response(JSON.stringify({
      success: true,
      message: `Successfully extracted ${finalTopics.length} topics across ${availableForms.length > 0 ? availableForms.join(', ') : 'single curriculum'}.`,
      topics_count: finalTopics.length
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });

  } catch (error: any) {
    console.error("Error processing syllabus:", error);
    
    // Set error state in database
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
