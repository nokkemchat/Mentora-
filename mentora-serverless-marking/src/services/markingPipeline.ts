import { ServerlessMarkingRequest, ServerlessMarkingResponse } from '../types';
import { generateMarkedPaperFal } from '../providers/falProvider';
import { generateMarkedPaperReplicate } from '../providers/replicateProvider';

export class ServerlessMarkingService {
  private falKey?: string;
  private replicateToken?: string;

  constructor(config?: { falKey?: string; replicateToken?: string }) {
    this.falKey = config?.falKey || process.env.FAL_KEY;
    this.replicateToken = config?.replicateToken || process.env.REPLICATE_API_TOKEN;
  }

  /**
   * Generates a realistic marked paper via serverless open-source GPU
   * with automatic fallback if the primary provider fails.
   */
  async generateMarkedImage(request: ServerlessMarkingRequest): Promise<ServerlessMarkingResponse> {
    const preferredProvider = request.provider || (this.falKey ? 'fal' : 'replicate');

    if (preferredProvider === 'fal' && this.falKey) {
      try {
        return await generateMarkedPaperFal(request, this.falKey);
      } catch (err: any) {
        console.warn('Fal.ai failed, attempting Replicate fallback...', err.message);
        if (this.replicateToken) {
          return await generateMarkedPaperReplicate(request, this.replicateToken);
        }
        throw err;
      }
    }

    if (this.replicateToken) {
      return await generateMarkedPaperReplicate(request, this.replicateToken);
    }

    throw new Error(
      'No serverless GPU credentials found. Please configure FAL_KEY or REPLICATE_API_TOKEN.'
    );
  }
}
