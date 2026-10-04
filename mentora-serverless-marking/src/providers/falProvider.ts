import { ServerlessMarkingRequest, ServerlessMarkingResponse } from '../types';

/**
 * Fal.ai Serverless Open-Source GPU Provider
 * Model: SDXL Turbo / Lightning Image-to-Image / Inpainting
 * Cost: ~$0.002 per page (95% cheaper than proprietary models)
 * Latency: ~1.5 - 2.5 seconds
 */
export async function generateMarkedPaperFal(
  request: ServerlessMarkingRequest,
  apiKey: string
): Promise<ServerlessMarkingResponse> {
  const startTime = Date.now();
  const { originalImageUrl, assessmentResult, denoiseStrength = 0.28 } = request;

  // Build the Cambridge/ZIMSEC authentic red-pen examiner prompt from assessment results
  const subpartNotes = (assessmentResult.subparts || [])
    .map(sp => `Part ${sp.part_label}: [${sp.marks_awarded}/${sp.max_marks}] ${sp.status === 'correct' ? '✓' : '✗'} ${sp.examiner_note || sp.feedback || ''}`)
    .join('; ');

  const prompt = (
    `Authentic Cambridge / ZIMSEC teacher grading in red ballpoint ink on examination paper. ` +
    `Crisp red checkmarks next to correct steps, red crosses next to mistakes, marks circled in red ink in margins. ` +
    `Examiner notes: "${subpartNotes || 'Total: ' + assessmentResult.total_score + '/' + assessmentResult.max_score}". ` +
    `Preserve original printed questions and student handwriting with maximum fidelity, realistic paper texture, 4k scan.`
  );

  const negativePrompt = (
    `blurry, distorted student handwriting, warped question text, cartoon, 3d, computer font, digital text, out of frame, low resolution`
  );

  // Call Fal.ai serverless REST endpoint
  const endpoint = 'https://fal.run/fal-ai/fast-sdxl/image-to-image';
  
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Authorization': `Key ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      image_url: originalImageUrl,
      prompt: prompt,
      negative_prompt: negativePrompt,
      strength: denoiseStrength,
      guidance_scale: 1.5,
      num_inference_steps: 6,
      enable_safety_checker: false,
      output_format: 'jpeg'
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Fal.ai API error (${response.status}): ${errorText}`);
  }

  const data = await response.json();
  const markedImageUrl = data.images?.[0]?.url || data.image?.url;

  if (!markedImageUrl) {
    throw new Error('Fal.ai did not return an image URL in response.');
  }

  const inferenceTimeMs = Date.now() - startTime;

  return {
    markedImageUrl,
    providerUsed: 'fal-ai (SDXL)',
    inferenceTimeMs,
    estimatedCostUsd: 0.002
  };
}
