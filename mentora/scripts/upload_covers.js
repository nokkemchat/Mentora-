const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, 'ingest_papers', '.env') });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;
const adminEmail = process.env.ADMIN_EMAIL;
const adminPassword = process.env.ADMIN_PASSWORD;

const supabase = createClient(supabaseUrl, supabaseKey);

const images = [
  { name: 'math_cover.png', path: 'C:\\Users\\nokke\\.gemini\\antigravity\\brain\\20c9e67b-6931-4430-84bd-b718e9ec4805\\math_cover_1784569878573.png' },
  { name: 'science_cover.png', path: 'C:\\Users\\nokke\\.gemini\\antigravity\\brain\\20c9e67b-6931-4430-84bd-b718e9ec4805\\science_cover_1784569929772.png' },
  { name: 'languages_cover.png', path: 'C:\\Users\\nokke\\.gemini\\antigravity\\brain\\20c9e67b-6931-4430-84bd-b718e9ec4805\\languages_cover_1784569977685.png' },
  { name: 'humanities_cover.png', path: 'C:\\Users\\nokke\\.gemini\\antigravity\\brain\\20c9e67b-6931-4430-84bd-b718e9ec4805\\humanities_cover_1784569997653.png' },
  { name: 'technology_cover.png', path: 'C:\\Users\\nokke\\.gemini\\antigravity\\brain\\20c9e67b-6931-4430-84bd-b718e9ec4805\\technology_cover_1784570022468.png' },
  { name: 'agriculture_cover.png', path: 'C:\\Users\\nokke\\.gemini\\antigravity\\brain\\20c9e67b-6931-4430-84bd-b718e9ec4805\\agriculture_cover_1784570036308.png' }
];

async function main() {
  const { error: authErr } = await supabase.auth.signInWithPassword({
    email: adminEmail,
    password: adminPassword,
  });
  if (authErr) {
    console.error('Login failed:', authErr.message);
    process.exit(1);
  }

  for (const img of images) {
    const fileBuf = fs.readFileSync(img.path);
    const { data, error } = await supabase.storage
      .from('course-covers')
      .upload(img.name, fileBuf, {
        contentType: 'image/png',
        upsert: true
      });
    
    if (error) {
      console.error('Failed to upload', img.name, error.message);
    } else {
      console.log('Successfully uploaded', img.name);
    }
  }
}

main();
