import fs from 'fs/promises';
import path from 'path';
import https from 'https';
import AdmZip from 'adm-zip';

const POPPLER_URL = "https://github.com/oschwartz10612/poppler-windows/releases/download/v24.02.0-0/Release-24.02.0-0.zip";
const VENDOR_DIR = path.join(__dirname, '..', 'vendor');
const ZIP_PATH = path.join(VENDOR_DIR, 'poppler.zip');
const POPPLER_EXTRACT_DIR = path.join(VENDOR_DIR, 'poppler');

async function downloadFile(url: string, dest: string): Promise<void> {
    return new Promise((resolve, reject) => {
        // Handle redirects
        https.get(url, (response) => {
            if (response.statusCode === 301 || response.statusCode === 302) {
                return downloadFile(response.headers.location as string, dest).then(resolve).catch(reject);
            }
            if (response.statusCode !== 200) {
                return reject(new Error(`Failed to get '${url}' (${response.statusCode})`));
            }
            
            const file = require('fs').createWriteStream(dest);
            response.pipe(file);
            file.on('finish', () => {
                file.close();
                resolve();
            });
        }).on('error', (err) => {
            require('fs').unlink(dest, () => reject(err));
        });
    });
}

async function main() {
    try {
        console.log("Ensuring vendor directory exists...");
        await fs.mkdir(VENDOR_DIR, { recursive: true });
        
        console.log("Downloading portable Poppler for Windows...");
        await downloadFile(POPPLER_URL, ZIP_PATH);
        
        console.log("Extracting Poppler...");
        const zip = new AdmZip(ZIP_PATH);
        zip.extractAllTo(POPPLER_EXTRACT_DIR, true);
        
        console.log("Cleaning up ZIP file...");
        await fs.unlink(ZIP_PATH);
        
        console.log("Portable Poppler downloaded and extracted successfully!");
        
        // Verify executable exists
        const binPath = path.join(POPPLER_EXTRACT_DIR, 'poppler-24.02.0', 'Library', 'bin', 'pdftocairo.exe');
        try {
            await fs.access(binPath);
            console.log("pdftocairo.exe found at:", binPath);
        } catch (e) {
            console.error("Executable NOT found at expected path:", binPath);
            // Let's print out what we did extract to help debugging
            const files = await fs.readdir(POPPLER_EXTRACT_DIR);
            console.log("Extracted root files:", files);
        }
        
    } catch (e) {
        console.error("Installation failed:", e);
        process.exit(1);
    }
}

main();
