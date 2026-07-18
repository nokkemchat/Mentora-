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
    const { subtopic_id, file_url } = await req.json();

    if (!subtopic_id || !file_url) {
      throw new Error("Missing subtopic_id or file_url");
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
    
    // 2. Extract text using unpdf
    const pdf = await getDocumentProxy(new Uint8Array(pdfArrayBuffer));
    const { text: extractedText } = await extractText(pdf, { mergePages: true });

    if (!extractedText || extractedText.trim().length === 0) {
      throw new Error("No text could be extracted from the PDF.");
    }

    // 3. Clean and Slice Text to prevent Groq TPM errors.
    // Llama 3.3 70b has a strict TPM limit on free tiers. We must safely limit input text.
    // 25,000 characters is approximately 6,000 tokens. 
    // We want 30 output questions which might take 3,000-4,000 tokens.
    // This safely keeps us below the typical 12,000 TPM limit.
    const textToProcess = extractedText.substring(0, 25000);
    const cleanedText = textToProcess.replace(/\s+/g, ' ');

    // 4. Call Groq
    const groqKey = Deno.env.get('GROQ_API_KEY');
    if (!groqKey) {
      throw new Error("GROQ_API_KEY is not set in edge function secrets.");
    }

    const systemPrompt = `
You are an expert AI teacher generating multiple-choice quiz questions based on the provided study notes.
CRITICAL INSTRUCTIONS:
1. Generate AS MANY high-quality questions as you can based on the text provided, aiming for at least 30 questions.
2. For each question, provide exactly 4 options.
3. Indicate which option is the correct one using a zero-based index (0, 1, 2, or 3).
4. Provide a brief explanation for the correct answer.

Your response MUST be a valid JSON object matching this exact structure:
{
  "questions": [
    {
      "text": "The question text?",
      "explanation": "Explanation of the correct answer.",
      "options": [
        "First option",
        "Second option",
        "Third option",
        "Fourth option"
      ],
      "correct_index": 2
    }
  ]
}
Return ONLY the raw JSON. Do not use markdown blocks or formatting.`;

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
          { role: "user", content: `Study Notes:\n\n${cleanedText}` }
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
    
    // Clean json
    jsonText = jsonText.replace(/```json/g, '').replace(/```/g, '').trim();
    const parsedData = JSON.parse(jsonText);

    if (!parsedData.questions || !Array.isArray(parsedData.questions)) {
      throw new Error("AI did not return a valid questions array.");
    }

    // 5. Insert into Supabase
    // Note: We DO NOT delete existing questions here, as the teacher may have added manual ones.
    for (const q of parsedData.questions) {
      const questionId = crypto.randomUUID();
      
      const { error: qError } = await supabaseAdmin
        .from('questions')
        .insert({
          id: questionId,
          subtopic_id: subtopic_id,
          text: q.text,
          explanation: q.explanation || ''
        });

      if (qError) {
        console.error("Failed to insert question:", qError);
        continue;
      }

      const optionsToInsert = q.options.map((optText: string, index: number) => ({
        id: crypto.randomUUID(),
        question_id: questionId,
        text: optText,
        is_correct: index === q.correct_index
      }));

      const { error: oError } = await supabaseAdmin
        .from('options')
        .insert(optionsToInsert);

      if (oError) {
        console.error("Failed to insert options:", oError);
      }
    }

    return new Response(JSON.stringify({ 
      success: true, 
      message: `Successfully generated ${parsedData.questions.length} questions.` 
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });

  } catch (error: any) {
    console.error("Error generating quiz:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })
  }
})
