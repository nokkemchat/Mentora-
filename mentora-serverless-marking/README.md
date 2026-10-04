# Mentora Serverless Open-Source Marking Pipeline

This directory contains the independent, serverless implementation for generating authentic, teacher-marked exam papers using open-source models (**SDXL** / **FLUX.1**) running on on-demand cloud GPUs (**Fal.ai** / **Replicate**).

---

## 🎯 Purpose & Why This Exists

1. **Decoupled from Existing Core Agent**:
   - The original agent algorithm in `mentora/supabase/functions/tutor-chat` remains **100% intact and untouched**.
   - You can test, benchmark, and deploy this serverless pipeline independently.

2. **Massive Cost Reduction**:
   - **OpenAI DALL-E / Image API**: ~$0.04 - $0.08 per marked script page.
   - **Serverless Open-Source GPU (SDXL Turbo / Fast SDXL)**: ~$0.002 per marked script page (**95% cheaper**).
   - 1,000 marked papers cost **~$2.00** instead of **~$60.00 - $80.00**.

3. **No 7GB Local Machine Downloads**:
   - The model runs on-demand in the cloud with sub-2-second inference.
   - Your local development machine and mobile app do not need to host or download multi-gigabyte models.

---

## 📂 Architecture & Directory Structure

```
mentora-serverless-marking/
├── README.md
├── package.json
├── src/
│   ├── types.ts                     # TypeScript data contracts & assessment structures
│   ├── providers/
│   │   ├── falProvider.ts           # Fal.ai serverless SDXL / FLUX client
│   │   └── replicateProvider.ts     # Replicate serverless SDXL client
│   ├── services/
│   │   └── markingPipeline.ts       # Unified service with automatic failover
│   └── edge-function/
│       └── serverless-tutor-chat.ts # Isolated Supabase Edge Function adapter
```

---

## 🚀 Quick Setup & Configuration

### 1. Choose a Provider
You can use either **Fal.ai** (recommended for speed and cost) or **Replicate**:

- **Fal.ai**: Sign up at [fal.ai](https://fal.ai), create an API key (`FAL_KEY`).
- **Replicate**: Sign up at [replicate.com](https://replicate.com), create a token (`REPLICATE_API_TOKEN`).

### 2. Set Environment Variables
Add to your Supabase project or local `.env`:
```bash
FAL_KEY="your-fal-api-key"
# or
REPLICATE_API_TOKEN="your-replicate-token"
```

### 3. Deploying as a Standalone Supabase Function (Optional)
To deploy this as an independent edge function without affecting `tutor-chat`:
```bash
supabase functions deploy serverless-marking --no-verify-jwt
```
