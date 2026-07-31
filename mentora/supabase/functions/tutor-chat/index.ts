import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Define Tools for the Orchestrator
const tools = [
  {
    type: "function",
    function: {
      name: "retrieve_question",
      description: "Retrieve a specific past paper question",
      parameters: {
        type: "object",
        properties: {
          paper_id: { type: "string" },
          question_number: { type: "string" }
        },
        required: ["paper_id", "question_number"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "retrieve_mark_scheme",
      description: "Retrieve the official marking criteria for a question",
      parameters: {
        type: "object",
        properties: {
          question_id: { type: "string" }
        },
        required: ["question_id"]
      }
    }
  }
];

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { message, context, sessionId } = await req.json();

    if (!message || !sessionId) {
      return new Response(JSON.stringify({ error: "Missing required fields" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      });
    }

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? ""
    );

    // 1. Fetch Session History
    const { data: sessionData } = await supabaseClient
      .from("learning_sessions")
      .select("chat_history")
      .eq("id", sessionId)
      .single();

    const chatHistory = sessionData?.chat_history || [];

    // 2. Orchestrator Logic
    const systemPrompt = `You are the Mentora AI Tutor Orchestrator. 
Your goal is to help the student learn effectively.
Always use tools to fetch accurate data. Do not guess.
If the student asks to learn, ask them HOW they want to learn (e.g. hints, similar examples, attempt first).`;

    const messages = [
      { role: "system", content: systemPrompt },
      ...chatHistory,
      { role: "user", content: message }
    ];

    // Call OpenAI
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${Deno.env.get("OPENAI_API_KEY")}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages,
        tools,
        tool_choice: "auto",
      }),
    });

    const openAiData = await response.json();
    
    if (openAiData.error) {
      throw new Error(`OpenAI API Error: ${openAiData.error.message || JSON.stringify(openAiData.error)}`);
    }
    
    let currentResponse = openAiData.choices[0].message;
    let allMessages = [...messages, currentResponse];

    // Handle Tool Calls Loop
    while (currentResponse.tool_calls) {
      for (const toolCall of currentResponse.tool_calls) {
        const functionName = toolCall.function.name;
        const args = JSON.parse(toolCall.function.arguments);
        let toolResult = "";

        try {
          if (functionName === "retrieve_question") {
            const { data, error } = await supabaseClient
              .from('past_paper_questions')
              .select('*')
              .eq('paper_id', args.paper_id)
              .eq('question_number', args.question_number)
              .single();
            toolResult = error ? `Error: ${error.message}` : JSON.stringify(data);
          } 
          else if (functionName === "retrieve_mark_scheme") {
            const { data, error } = await supabaseClient
              .from('past_paper_solutions')
              .select('*')
              .eq('question_id', args.question_id)
              .single();
            toolResult = error ? `Error: ${error.message}` : JSON.stringify(data);
          }
        } catch (err) {
          toolResult = `Error executing tool: ${err.message}`;
        }

        allMessages.push({
          role: "tool",
          tool_call_id: toolCall.id,
          name: functionName,
          content: toolResult
        });
      }

      // Re-query OpenAI with tool results
      const nextResponse = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${Deno.env.get("OPENAI_API_KEY")}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages: allMessages,
          tools,
        }),
      });

      const nextData = await nextResponse.json();
      currentResponse = nextData.choices[0].message;
      allMessages.push(currentResponse);
    }

    // 3. Save State
    await supabaseClient
      .from("learning_sessions")
      .update({ chat_history: allMessages })
      .eq("id", sessionId);

    return new Response(JSON.stringify({ reply: currentResponse.content }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
