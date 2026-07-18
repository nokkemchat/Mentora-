import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { StreamClient } from 'npm:@stream-io/node-sdk';

// Configure CORS for React Native / Web clients
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { user_id } = await req.json();

    if (!user_id) {
      return new Response(JSON.stringify({ error: 'user_id is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const apiKey = Deno.env.get('STREAM_API_KEY');
    const secret = Deno.env.get('STREAM_API_SECRET');

    if (!apiKey || !secret) {
      return new Response(JSON.stringify({ error: 'Stream credentials not configured on the server.' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Initialize Stream Client
    const client = new StreamClient(apiKey, secret);
    
    // Generate User Token
    // The token expires in 1 hour by default if no expiration is specified.
    const token = client.generateUserToken({ user_id });

    return new Response(
      JSON.stringify({ token }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      },
    )
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })
  }
})
