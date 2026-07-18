import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0"

serve(async (req) => {
  try {
    // Paynow sends a POST request with form data
    const formData = await req.formData()
    const reference = formData.get('reference')
    const paynowReference = formData.get('paynowreference')
    const amount = formData.get('amount')
    const status = formData.get('status')
    const pollUrl = formData.get('pollurl')
    const hash = formData.get('hash')

    if (!reference || !status) {
      return new Response('Missing parameters', { status: 400 })
    }

    console.log(`Webhook received for ${reference} with status: ${status}`)

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '' // We need admin privileges to update tables from a webhook
    )

    // 1. Update Payment Status
    const { data: payment, error: fetchError } = await supabase
      .from('payments')
      .update({ status: status as string, updated_at: new Date().toISOString() })
      .eq('paynow_reference', reference)
      .select()
      .single()

    if (fetchError || !payment) {
      console.error('Payment not found or update error:', fetchError)
      return new Response('Payment not found', { status: 404 })
    }

    // 2. If Paid, unlock the course
    if (status === 'Paid') {
      // Create a subscription for the user
      // Expire in 30 days
      const expiresAt = new Date()
      expiresAt.setDate(expiresAt.getDate() + 30)

      const { error: subError } = await supabase
        .from('subscriptions')
        .upsert({
          user_id: payment.user_id,
          course_id: payment.course_id,
          status: 'active',
          expires_at: expiresAt.toISOString(),
        }, { onConflict: 'user_id,course_id' })

      if (subError) {
        console.error('Failed to create subscription:', subError)
        return new Response('Failed to create subscription', { status: 500 })
      }
      
      console.log(`Course ${payment.course_id} unlocked for user ${payment.user_id}`)
    }

    return new Response('OK', { status: 200 })
  } catch (error) {
    console.error("Webhook Error:", error)
    return new Response('Internal Server Error', { status: 500 })
  }
})
