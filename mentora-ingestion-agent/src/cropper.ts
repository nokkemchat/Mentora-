import * as path from "path";
import * as fs from "fs/promises";
import sharp from "sharp";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

export class Cropper {
    private tempDir: string;
    private popplerBin: string;

    constructor() {
        this.tempDir = path.join(__dirname, '..', 'temp');
        this.popplerBin = path.join(__dirname, '..', 'vendor', 'poppler', 'poppler-24.02.0', 'Library', 'bin', 'pdftocairo.exe');
    }

    async renderAllPages(pdfPath: string, prefix: string): Promise<string[]> {
        await fs.mkdir(this.tempDir, { recursive: true });

        const outputPrefix = path.join(this.tempDir, `page_${prefix}`);
        
        try {
            // Extract all pages as PNG at 150 DPI
            await execAsync(`"${this.popplerBin}" -png -r 150 "${pdfPath}" "${outputPrefix}"`);
            
            // Read generated files. pdftocairo appends -<page_number>.png or -<page_number> if multiple, or .png if single? Wait, pdftocairo appends -<page_number>.png
            const files = await fs.readdir(this.tempDir);
            const generatedFiles = files
                .filter(f => f.startsWith(`page_${prefix}`) && f.endsWith('.png'))
                .map(f => path.join(this.tempDir, f));
                
            return generatedFiles;
        } catch (err) {
            console.error("Error rendering PDF to images via Poppler.", err);
            throw err;
        }
    }

    async cropAsset(
        pdfPath: string,
        pageNumber: number,
        boundingBox: { ymin: number; xmin: number; ymax: number; xmax: number },
        assetId: string
    ): Promise<string> {
        await fs.mkdir(this.tempDir, { recursive: true });

        // 1. Render single PDF page to image at 300 DPI
        const outputPrefix = path.join(this.tempDir, `asset_${assetId}_full`);
        let pageImagePath: string;
        try {
            await execAsync(`"${this.popplerBin}" -png -r 300 -f ${pageNumber} -l ${pageNumber} "${pdfPath}" "${outputPrefix}"`);
            
            const files = await fs.readdir(this.tempDir);
            const genFile = files.find(f => f.startsWith(`asset_${assetId}_full`) && f.endsWith('.png'));
            if (!genFile) throw new Error("Poppler did not generate an output file.");
            
            pageImagePath = path.join(this.tempDir, genFile);
        } catch (err) {
            console.error("Error rendering PDF to image via Poppler.", err);
            throw err;
        }

        // 2. Crop the image using sharp
        const croppedPath = path.join(this.tempDir, `asset_${assetId}.png`);
        
        const metadata = await sharp(pageImagePath).metadata();
        const width = metadata.width || 2480;
        const height = metadata.height || 3508;

        const left = Math.max(0, Math.floor((boundingBox.xmin || 0) * width));
        const top = Math.max(0, Math.floor((boundingBox.ymin || 0) * height));
        const cropWidth = Math.min(width - left, Math.max(1, Math.ceil(((boundingBox.xmax || 1) - (boundingBox.xmin || 0)) * width)));
        const cropHeight = Math.min(height - top, Math.max(1, Math.ceil(((boundingBox.ymax || 1) - (boundingBox.ymin || 0)) * height)));

        await sharp(pageImagePath)
            .extract({ left, top, width: cropWidth, height: cropHeight })
            .toFile(croppedPath);

        // Cleanup full page image
        try { await fs.unlink(pageImagePath); } catch (e) {}

        return croppedPath;
    }

    async cropAssetFromImage(
        sourceImagePath: string,
        boundingBox: { ymin: number; xmin: number; ymax: number; xmax: number },
        assetId: string
    ): Promise<string> {
        await fs.mkdir(this.tempDir, { recursive: true });
        const croppedPath = path.join(this.tempDir, `subasset_${assetId}.png`);
        
        const metadata = await sharp(sourceImagePath).metadata();
        const width = metadata.width || 2480;
        const height = metadata.height || 3508;

        const MARGIN_Y = 0.05;
        const MARGIN_X = 0.05;

        const ymin = Math.max(0, (boundingBox.ymin || 0) - MARGIN_Y);
        const xmin = Math.max(0, (boundingBox.xmin || 0) - MARGIN_X);
        const ymax = Math.min(1, (boundingBox.ymax || 1) + MARGIN_Y);
        const xmax = Math.min(1, (boundingBox.xmax || 1) + MARGIN_X);

        const left = Math.max(0, Math.floor(xmin * width));
        const top = Math.max(0, Math.floor(ymin * height));
        const cropWidth = Math.min(width - left, Math.max(1, Math.ceil((xmax - xmin) * width)));
        const cropHeight = Math.min(height - top, Math.max(1, Math.ceil((ymax - ymin) * height)));

        await sharp(sourceImagePath)
            .extract({ left, top, width: cropWidth, height: cropHeight })
            .toFile(croppedPath);

        return croppedPath;
    }

    async addGridToImage(imagePath: string, outputPath: string): Promise<string> {
        const metadata = await sharp(imagePath).metadata();
        const w = metadata.width || 1000;
        const h = metadata.height || 1000;
        
        let svg = `<svg width="${w}" height="${h}">`;
        const fontSize = Math.max(16, Math.round(h * 0.02));
        
        // Horizontal lines (Y axis) every 5%
        for (let i = 1; i < 20; i++) {
            const y = Math.round((i / 20) * h);
            const val = (i / 20).toFixed(2);
            svg += `<line x1="0" y1="${y}" x2="${w}" y2="${y}" stroke="red" stroke-width="3" opacity="0.7"/>`;
            svg += `<text x="10" y="${y - 5}" fill="red" font-size="${fontSize}" font-weight="bold" font-family="sans-serif" stroke="white" stroke-width="1">Y:${val}</text>`;
            svg += `<text x="${w - Math.round(w*0.08)}" y="${y - 5}" fill="red" font-size="${fontSize}" font-weight="bold" font-family="sans-serif" stroke="white" stroke-width="1">Y:${val}</text>`;
        }
        
        // Vertical lines (X axis) every 5%
        for (let i = 1; i < 20; i++) {
            const x = Math.round((i / 20) * w);
            const val = (i / 20).toFixed(2);
            svg += `<line x1="${x}" y1="0" x2="${x}" y2="${h}" stroke="blue" stroke-width="3" opacity="0.7"/>`;
            svg += `<text x="${x + 5}" y="${fontSize + 10}" fill="blue" font-size="${fontSize}" font-weight="bold" font-family="sans-serif" stroke="white" stroke-width="1">X:${val}</text>`;
            svg += `<text x="${x + 5}" y="${h - 20}" fill="blue" font-size="${fontSize}" font-weight="bold" font-family="sans-serif" stroke="white" stroke-width="1">X:${val}</text>`;
        }
        
        svg += `</svg>`;
        
        await sharp(imagePath)
            .composite([{ input: Buffer.from(svg) }])
            .toFile(outputPath);
            
        return outputPath;
    }
}
