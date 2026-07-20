import { crawlDirectory } from './crawler';
import { parseFilename } from './parser';
import { loginToSupabase, uploadAndInsertPaper } from './uploader';

const args = process.argv.slice(2);
const TARGET_URL = args.find(arg => !arg.startsWith('--'));
const INDEX_ONLY = args.includes('--index-only');
const DELAY_MS = 2000; // 2 seconds between uploads to avoid rate limits

async function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
  if (!TARGET_URL) {
    console.error('Please provide a target URL to scrape.');
    console.error('Usage: npm run ingest <URL> [--index-only]');
    process.exit(1);
  }

  console.log('Logging into Supabase...');
  await loginToSupabase();

  console.log(`Starting crawl at: ${TARGET_URL}`);
  if (INDEX_ONLY) console.log('Mode: Index Only (Skipping Storage Uploads)');

  const pdfLinks = await crawlDirectory(TARGET_URL);

  console.log(`Found ${pdfLinks.length} PDF files. Starting ingestion...`);

  for (let i = 0; i < pdfLinks.length; i++) {
    const url = pdfLinks[i];
    const filename = url.split('/').pop() || '';
    
    // Attempt to parse the filename
    const metadata = parseFilename(filename);

    if (!metadata) {
      console.log(`Skipping ${filename} (Not a standard QP or MS format)`);
      continue;
    }

    console.log(`[${i + 1}/${pdfLinks.length}] Processing ${filename}...`);
    await uploadAndInsertPaper(url, metadata, INDEX_ONLY);

    // Rate limiting delay
    if (i < pdfLinks.length - 1) {
      await delay(DELAY_MS);
    }
  }

  console.log('Ingestion complete!');
}

main().catch(console.error);
