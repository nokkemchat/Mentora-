import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { Paynow } from "npm:paynow"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { course_id, phone_number, amount } = await req.json()

    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing Authorization header' }), { 
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      })
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    )

    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { 
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      })
    }

    // Initialize Paynow
    // Set PAYNOW_INTEGRATION_ID and PAYNOW_INTEGRATION_KEY in Supabase Vault
    const integrationId = Deno.env.get('PAYNOW_INTEGRATION_ID') || '11111'
    const integrationKey = Deno.env.get('PAYNOW_INTEGRATION_KEY') || '00000000-0000-0000-0000-000000000000'
    
    // Result URL (Webhook)
    const resultUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/paynow-webhook`
    const returnUrl = `${Deno.env.get('SUPABASE_URL')}`

    const paynow = new Paynow(integrationId, integrationKey, resultUrl, returnUrl)

    const reference = `mentora-${user.id.split('-')[0]}-${Date.now()}`
    const payment = paynow.createPayment(reference, user.email || 'student@mentora.com')
    payment.add(`Course Enrollment: ${course_id}`, amount)

    const response = await paynow.sendMobile(payment, phone_number, 'ecocash')

    if (response.success) {
      const { error: dbError } = await supabase
        .from('payments')
        .insert({
          user_id: user.id,
          course_id,
          amount,
          phone_number,
          paynow_reference: reference,
          paynow_poll_url: response.pollUrl,
          status: 'Pending'
        })

      if (dbError) {
        console.error("DB Insert Error", dbError)
        return new Response(JSON.stringify({ error: 'Failed to record payment' }), { 
          status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        })
      }

      return new Response(JSON.stringify({ 
        success: true, 
        message: 'EcoCash prompt sent to your phone.',
        pollUrl: response.pollUrl,
        reference 
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    } else {
      console.error("Paynow Error:", response.error)
      return new Response(JSON.stringify({ error: response.error || 'Failed to initiate payment' }), { 
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      })
    }
  } catch (error) {
    console.error("Unexpected error:", error)
    return new Response(JSON.stringify({ error: 'Internal Server Error' }), { 
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
    })
  }
})
