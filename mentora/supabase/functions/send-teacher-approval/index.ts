import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { teacher_id, code, name } = await req.json()

    if (!teacher_id || !code) {
      return new Response(
        JSON.stringify({ error: 'Missing teacher_id or code' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // 1. Fetch the user's real email from Supabase Auth using the Service Role Key
    const supabaseAdmin = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!)
    const { data: { user }, error: userError } = await supabaseAdmin.auth.admin.getUserById(teacher_id)

    if (userError || !user?.email) {
      console.error("Could not find user email:", userError)
      return new Response(
        JSON.stringify({ error: 'Could not fetch user email' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const email = user.email

    // 2. Send the email using Resend
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: 'Mentora App <onboarding@resend.dev>', // You can only send to your own email until you verify a domain on Resend Free Tier!
        to: email,
        subject: 'You have been approved! Here is your Verification Code',
        html: `
          <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
            <h2>Welcome to Mentora, ${name || 'Educator'}!</h2>
            <p>Your educator profile has been successfully reviewed and approved by our administrators.</p>
            <p>To unlock your dashboard, please enter the following 6-digit verification code in the app:</p>
            <div style="background-color: #f4f4f5; padding: 20px; text-align: center; border-radius: 8px; margin: 24px 0;">
              <h1 style="margin: 0; letter-spacing: 8px; color: #18181b;">${code}</h1>
            </div>
            <p>We're excited to have you on board!</p>
            <p>- The Mentora Team</p>
          </div>
        `,
      }),
    })

    const data = await res.json()

    return new Response(
      JSON.stringify(data),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error("Internal Edge Function Error:", error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
