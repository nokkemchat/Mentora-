import { createClient } from '@supabase/supabase-js';
import axios from 'axios';
import * as dotenv from 'dotenv';
import { ParsedPaper } from './parser';
import * as path from 'path';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || '';
const adminEmail = process.env.ADMIN_EMAIL || '';
const adminPassword = process.env.ADMIN_PASSWORD || '';

if (!supabaseUrl || !supabaseKey) {
  throw new Error('Missing Supabase credentials in .env');
}

const supabase = createClient(supabaseUrl, supabaseKey);

export async function loginToSupabase() {
  if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.log('Using Service Role Key (bypassing login).');
    return;
  }

  const { data, error } = await supabase.auth.signInWithPassword({
    email: adminEmail,
    password: adminPassword,
  });

  if (error) {
    throw new Error(`Failed to log in to Supabase: ${error.message}`);
  }
  console.log('Successfully logged in as Admin.');
}

export async function uploadAndInsertPaper(url: string, metadata: ParsedPaper, indexOnly: boolean = false) {
  try {
    let publicUrl = url; // Default to the source URL

    if (!indexOnly) {
      // 1. Fetch PDF into memory
      console.log(`Downloading ${metadata.filename}...`);
      const response = await axios.get(url, {
        responseType: 'arraybuffer',
        headers: {
          'User-Agent': 'Mozilla/5.0'
        }
      });
      
      const buffer = Buffer.from(response.data, 'binary');

      // 2. Upload to Supabase Storage
      const storagePath = `CAIE/${metadata.subject}/${metadata.year}/${metadata.filename}`;
      
      console.log(`Uploading to Supabase Storage: ${storagePath}`);
      const { data: storageData, error: storageError } = await supabase.storage
        .from('past_papers')
        .upload(storagePath, buffer, {
          contentType: 'application/pdf',
          upsert: true
        });

      if (storageError) {
        throw new Error(`Storage Error: ${storageError.message}`);
      }

      const { data: publicUrlData } = supabase.storage
        .from('past_papers')
        .getPublicUrl(storagePath);
        
      publicUrl = publicUrlData.publicUrl;
    } else {
      console.log(`Indexing metadata only (skipping upload): ${metadata.filename}`);
    }

    // 3. Insert into Database
    console.log(`Inserting metadata into database...`);
    const { error: dbError } = await supabase.from('papers').insert({
      curriculum: metadata.curriculum,
      subject: metadata.subject,
      grade_level: metadata.grade_level,
      year: metadata.year,
      session: metadata.session,
      paper_number: metadata.paper_number,
      variant: metadata.variant,
      type: metadata.type,
      pdf_url: publicUrl
    });

    if (dbError) {
      throw new Error(`DB Error: ${dbError.message}`);
    }

    console.log(`✅ Successfully ingested: ${metadata.filename}`);
  } catch (error: any) {
    console.error(`❌ Failed to ingest ${metadata.filename}: ${error.message}`);
  }
}
