/**
 * Standalone Serverless Edge Function Adapter
 * 
 * Preserves the exact same Cambridge / ZIMSEC evaluation algorithm,
 * but routes the marked image generation to Serverless GPU (Fal.ai / Replicate)
 * instead of OpenAI's expensive image generation endpoint.
 */

import { generateMarkedPaperFal } from '../providers/falProvider';
import { generateMarkedPaperReplicate } from '../providers/replicateProvider';

export async function handleServerlessMarkingAction(req: Request): Promise<Response> {
  try {
    const body = await req.json();
    const { action, assessment, image_url, page_index = 0, denoise_strength = 0.28 } = body;

    if (action !== 'generate_marked_image') {
      return new Response(JSON.stringify({ error: 'Unsupported action' }), { status: 400 });
    }

    if (!image_url) {
      return new Response(JSON.stringify({ error: 'image_url is required' }), { status: 400 });
    }

    const falKey = Deno.env.get('FAL_KEY');
    const replicateToken = Deno.env.get('REPLICATE_API_TOKEN');

    let result;
    if (falKey) {
      result = await generateMarkedPaperFal({
        originalImageUrl: image_url,
        pageIndex: page_index,
        assessmentResult: assessment || { total_score: 0, max_score: 10, percentage: 0, overall_feedback: '' },
        denoiseStrength: denoise_strength
      }, falKey);
    } else if (replicateToken) {
      result = await generateMarkedPaperReplicate({
        originalImageUrl: image_url,
        pageIndex: page_index,
        assessmentResult: assessment || { total_score: 0, max_score: 10, percentage: 0, overall_feedback: '' },
        denoiseStrength: denoise_strength
      }, replicateToken);
    } else {
      return new Response(
        JSON.stringify({ error: 'Neither FAL_KEY nor REPLICATE_API_TOKEN is set in environment.' }),
        { status: 500 }
      );
    }

    return new Response(JSON.stringify({
      success: true,
      image_url: result.markedImageUrl,
      provider: result.providerUsed,
      inference_time_ms: result.inferenceTimeMs,
      estimated_cost_usd: result.estimatedCostUsd
    }), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
}
