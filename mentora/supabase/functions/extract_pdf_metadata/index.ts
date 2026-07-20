import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { filename, text } = await req.json();

    if (!text && !filename) {
      return new Response(JSON.stringify({ error: "Missing text or filename" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      });
    }

    const systemPrompt = `
You are an expert at parsing metadata from exam paper cover pages and filenames.
You will receive the filename and the text extracted from the first page of the PDF.
Extract the following fields and return them as a strict JSON object:
- curriculum: "ZIMSEC" or "Cambridge" or "Unknown"
- subject: The name of the subject (e.g., "Physics", "Accounting", "Mathematics", "Biology").
- grade_level: "O-Level" or "A-Level" or "IGCSE" or "AS-Level" or "Unknown"
- year: The 4-digit year (e.g., "2024", "2023"). If missing, guess from the filename or text.
- session: "June", "November", "March", "Specimen" or "Unknown"
- paper_number: The paper number (e.g., "1", "2", "3", "4", "5", "6").
- variant: The paper variant (e.g., "1", "2", "3", "41", "42"). If not applicable, return an empty string "".
- type: "qp" (for question paper) or "ms" (for marking scheme). Guess from the filename (e.g. if it has 'ms' or 'mark scheme') or the text content.

Use both the filename and the text context to make the best possible guess.
Do not wrap your response in markdown blocks. Return ONLY valid JSON.
`;

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${Deno.env.get("GEMINI_API_KEY")}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        contents: [{
          parts: [{ text: `Filename: ${filename}\n\nPDF First Page Text:\n${text}` }]
        }],
        systemInstruction: {
          parts: [{ text: systemPrompt }]
        },
        generationConfig: {
          responseMimeType: "application/json",
          temperature: 0.1
        }
      }),
    });

    const geminiData = await response.json();
    
    if (geminiData.error) {
       throw new Error(geminiData.error.message);
    }

    const textContent = geminiData.candidates[0].content.parts[0].text;
    const parsedJson = JSON.parse(textContent);

    return new Response(JSON.stringify(parsedJson), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
