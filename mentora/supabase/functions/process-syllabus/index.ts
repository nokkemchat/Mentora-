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

  try {
    const { course_id, file_url } = await req.json();

    if (!course_id || !file_url) {
      throw new Error("Missing course_id or file_url");
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // 1. Download the PDF
    const pdfResponse = await fetch(file_url);
    if (!pdfResponse.ok) {
      throw new Error(`Failed to fetch PDF: ${pdfResponse.statusText}`);
    }
    const pdfArrayBuffer = await pdfResponse.arrayBuffer();
    
    // 2. Extract text using unpdf (Edge-compatible PDF parser!)
    const pdf = await getDocumentProxy(new Uint8Array(pdfArrayBuffer));
    const { text: extractedText } = await extractText(pdf, { mergePages: true });

    if (!extractedText || extractedText.trim().length === 0) {
      throw new Error("No text could be extracted from the PDF.");
    }

    // 3. Call Groq to process the extracted text
    const groqKey = Deno.env.get('GROQ_API_KEY');
    if (!groqKey) {
      throw new Error("GROQ_API_KEY is not set in edge function secrets.");
    }

    const systemPrompt = `
You are an expert curriculum designer extracting a course syllabus PDF.
CRITICAL INSTRUCTIONS:
1. Find the "Content overview" section in the syllabus. This section is your definitive guide for structuring the output.
2. Use the major Paper or Unit headings from the Content overview (e.g., "Pure Mathematics 1", "Mechanics") as the "Topic" titles.
3. Use the specific topic names listed under each Paper/Unit in the Content overview (e.g., "Algebra", "Quadratics", "Kinematics") as the "Subtopics".
4. Do NOT extract the highly detailed sub-bullet points (like "Completing the square"). Keep the subtopics at the level shown in the Content overview page.
5. IGNORE all other administrative text, aims, and assessment details.

Your response must be ONLY a valid JSON object matching this exact structure:
{
  "topics": [
    {
      "title": "string (e.g. 'Pure Mathematics 1 (for Paper 1)')",
      "subtopics": [
        {
          "title": "string (e.g. 'Quadratics')",
          "difficulty": "Easy" | "Medium" | "Hard",
          "estimated_time": "string (e.g. 45 mins)"
        }
      ]
    }
  ]
}
Return only the raw JSON. Do not use markdown blocks or formatting.`;

    let startIndex = extractedText.toLowerCase().indexOf("content overview");
    if (startIndex === -1) startIndex = 0;
    const textToProcess = extractedText.substring(startIndex, startIndex + 40000);
    const cleanedText = textToProcess.replace(/\s+/g, ' ');

    const groqResponse = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${groqKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Here is the syllabus text:\n\n${cleanedText}` }
        ],
        response_format: { type: "json_object" }
      })
    });

    if (!groqResponse.ok) {
      const errTxt = await groqResponse.text();
      throw new Error(`Groq API error: ${errTxt}`);
    }

    const aiData = await groqResponse.json();
    let jsonText = aiData.choices[0].message.content;
    
    // Clean json if there are markdown tags just in case
    jsonText = jsonText.replace(/```json/g, '').replace(/```/g, '').trim();
    
    const parsedData = JSON.parse(jsonText);

    if (!parsedData.topics || !Array.isArray(parsedData.topics)) {
      throw new Error("AI did not return valid topics array.");
    }

    // 4. Insert into Supabase
    // To prevent duplicates, delete existing topics for this course first
    await supabaseAdmin.from('topics').delete().eq('course_id', course_id);

    let topicIndex = 1;
    for (const topic of parsedData.topics) {
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
          difficulty: sub.difficulty || 'Medium',
          estimated_time: sub.estimated_time || '45 mins'
        }));

        const { error: subError } = await supabaseAdmin
          .from('subtopics')
          .insert(subtopicInserts);

        if (subError) throw subError;
      }
    }

    return new Response(JSON.stringify({ success: true, message: "Syllabus processed and topics updated via Groq." }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });

  } catch (error: any) {
    console.error("Error processing syllabus:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })
  }
})
