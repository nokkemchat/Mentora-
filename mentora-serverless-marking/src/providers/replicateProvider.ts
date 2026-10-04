import { ServerlessMarkingRequest, ServerlessMarkingResponse } from '../types';

/**
 * Replicate Serverless Open-Source GPU Provider
 * Model: SDXL Img2Img or InstructPix2Pix
 * Cost: ~$0.003 - $0.005 per page
 * Latency: ~2 - 4 seconds
 */
export async function generateMarkedPaperReplicate(
  request: ServerlessMarkingRequest,
  apiToken: string
): Promise<ServerlessMarkingResponse> {
  const startTime = Date.now();
  const { originalImageUrl, assessmentResult, denoiseStrength = 0.28 } = request;

  const prompt = (
    `Authentic teacher grading in red ballpoint ink on examination paper. ` +
    `Crisp red checkmarks next to answers, red crosses, marks circled in red in margins, ` +
    `handwritten score "${assessmentResult.total_score}/${assessmentResult.max_score}" in red ink. ` +
    `Preserve original printed text and handwriting, realistic paper scan.`
  );

  // Call Replicate Predictions API (SDXL)
  const endpoint = 'https://api.replicate.com/v1/predictions';

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiToken}`,
      'Content-Type': 'application/json',
      'Prefer': 'wait'
    },
    body: JSON.stringify({
      version: "7762fd07cf82c948538e41f63f77d685e02b063e37e496e96eefd46c929f9bdc", // SDXL
      input: {
        image: originalImageUrl,
        prompt: prompt,
        negative_prompt: "blurry, distorted text, computer font, lowres",
        prompt_strength: denoiseStrength,
        guidance_scale: 2.0,
        num_inference_steps: 20
      }
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Replicate API error (${response.status}): ${errorText}`);
  }

  const prediction = await response.json();
  let markedImageUrl = Array.isArray(prediction.output) ? prediction.output[0] : prediction.output;

  // If async polling is needed
  if (!markedImageUrl && prediction.urls?.get) {
    const pollStart = Date.now();
    while (!markedImageUrl && Date.now() - pollStart < 45000) {
      await new Promise(r => setTimeout(r, 1000));
      const pollRes = await fetch(prediction.urls.get, {
        headers: { 'Authorization': `Bearer ${apiToken}` }
      });
      const pollData = await pollRes.json();
      if (pollData.status === 'succeeded') {
        markedImageUrl = Array.isArray(pollData.output) ? pollData.output[0] : pollData.output;
        break;
      }
      if (pollData.status === 'failed') {
        throw new Error(`Replicate prediction failed: ${pollData.error}`);
      }
    }
  }

  if (!markedImageUrl) {
    throw new Error('Replicate did not return a valid marked image URL.');
  }

  const inferenceTimeMs = Date.now() - startTime;

  return {
    markedImageUrl,
    providerUsed: 'replicate (SDXL)',
    inferenceTimeMs,
    estimatedCostUsd: 0.0035
  };
}
