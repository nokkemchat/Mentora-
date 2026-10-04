import * as path from "path";
import * as fs from "fs/promises";
import sharp from "sharp";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

export class Cropper {
    private tempDir: string;
    private popplerBin: string;
    private isMac: boolean;

    constructor() {
        this.tempDir = path.join(__dirname, '..', 'temp');
        this.isMac = process.platform === 'darwin';
        
        if (this.isMac) {
            this.popplerBin = path.join(__dirname, '..', 'vendor', 'pdfrender');
        } else {
            this.popplerBin = path.join(__dirname, '..', 'vendor', 'poppler', 'poppler-24.02.0', 'Library', 'bin', 'pdftocairo.exe');
        }
    }

    async renderAllPages(pdfPath: string, prefix: string): Promise<string[]> {
        await fs.mkdir(this.tempDir, { recursive: true });

        const outputPrefix = path.join(this.tempDir, `page_${prefix}`);
        
        try {
            if (this.isMac) {
                await execAsync(`"${this.popplerBin}" renderAll "${pdfPath}" "${outputPrefix}" 150`);
            } else {
                await execAsync(`"${this.popplerBin}" -png -r 150 "${pdfPath}" "${outputPrefix}"`);
            }
            
            const files = await fs.readdir(this.tempDir);
            const generatedFiles = files
                .filter(f => f.startsWith(`page_${prefix}`) && f.endsWith('.png'))
                .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }))
                .map(f => path.join(this.tempDir, f));
                
            return generatedFiles;
        } catch (err) {
            console.error("Error rendering PDF to images via PDF renderer.", err);
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
            if (this.isMac) {
                await execAsync(`"${this.popplerBin}" renderPage "${pdfPath}" "${outputPrefix}" 300 ${pageNumber}`);
            } else {
                await execAsync(`"${this.popplerBin}" -png -r 300 -f ${pageNumber} -l ${pageNumber} "${pdfPath}" "${outputPrefix}"`);
            }
            
            const files = await fs.readdir(this.tempDir);
            const genFile = files.find(f => f.startsWith(`asset_${assetId}_full`) && f.endsWith('.png'));
            if (!genFile) throw new Error("Renderer did not generate an output file.");
            
            pageImagePath = path.join(this.tempDir, genFile);
        } catch (err) {
            console.error("Error rendering PDF to image via renderer.", err);
            throw err;
        }

        // 2. Crop the image using sharp
        const croppedPath = path.join(this.tempDir, `asset_${assetId}.png`);
        
        const metadata = await sharp(pageImagePath).metadata();
        const width = metadata.width || 2480;
        const height = metadata.height || 3508;

        // For question slices, use full page width so margins, question numbers, and wide diagrams are never clipped horizontally
        const left = 0;
        const top = Math.max(0, Math.floor((boundingBox.ymin || 0) * height));
        const cropWidth = width;
        const cropHeight = Math.min(height - top, Math.max(1, Math.ceil(((boundingBox.ymax || 1) - (boundingBox.ymin || 0)) * height)));

        await sharp(pageImagePath)
            .extract({ left, top, width: cropWidth, height: cropHeight })
            .toFile(croppedPath);

        // Cleanup full page image
        try { await fs.unlink(pageImagePath); } catch (e) {}

        return croppedPath;
    }

        async findFigureAnchorBounds(pdfPath: string, pageNumber: number, hint?: string): Promise<{ ymin: number; xmin: number; ymax: number; xmax: number } | null> {
        try {
            const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
            const dataBuffer = await fs.readFile(pdfPath);
            const doc = await pdfjs.getDocument({ data: new Uint8Array(dataBuffer) }).promise;
            if (pageNumber > doc.numPages) return null;
            const page = await doc.getPage(pageNumber);
            const content = await page.getTextContent();
            const items = content.items
                .map((i: any) => ({ str: (i.str || '').trim(), x: i.transform[4], y: i.transform[5] }))
                .filter((i: any) => i.str);

            // Universal caption pattern matching Fig. 1, Fig. 1.1, Figure 1, Diagram 1.1 across all exam boards
            const captionRegex = /^(Fig(\.|s)|Figures*|Diagrams*)s*\d+([.-]\d+)?[a-z]?[:.]?(\s*[\(\[].*?[\)\]])?\s*$/i;
            const captions = items.filter((i: any) => captionRegex.test(i.str));
            if (captions.length === 0) return null;

            // Group text items by line (within 3.5 points vertically) so multi-token sentences are cleanly assembled
            const lines: { y: number; text: string; items: any[] }[] = [];
            for (const it of items) {
                let line = lines.find(l => Math.abs(l.y - it.y) < 3.5);
                if (!line) {
                    line = { y: it.y, text: '', items: [] };
                    lines.push(line);
                }
                line.items.push(it);
            }
            for (const l of lines) {
                l.items.sort((a, b) => a.x - b.x);
                l.text = l.items.map(i => i.str).join(' ');
            }

            let targetCaption = captions[0];
            if (hint) {
                const matchFig = hint.match(/(\d+\.\d+|\d+)/);
                if (matchFig) {
                    const found = captions.find((c: any) => c.str.includes(matchFig[0]));
                    if (found) targetCaption = found;
                } else {
                    const matchIdx = hint.match(/img(\d+)/i);
                    if (matchIdx) {
                        const idx = parseInt(matchIdx[1], 10);
                        if (captions[idx]) targetCaption = captions[idx];
                    }
                }
            }

            const figLabel = targetCaption.str.replace(/[:.]?$/, '').trim();
            // Find introductory line above the caption
            const introLine = lines.find(l => l.y > targetCaption.y && l.text.toLowerCase().includes(figLabel.toLowerCase()) && l.text.length > targetCaption.str.length);

            const pdfH = page.view[3] || 842;
            let yminPt = introLine ? introLine.y + 14 : targetCaption.y + 240;
            let ymaxPt = targetCaption.y - 10;

            const ymin = Math.max(0.02, (pdfH - yminPt) / pdfH);
            const ymax = Math.min(0.98, (pdfH - ymaxPt) / pdfH);

            console.log(`[Universal Anchor Cropper] Successfully anchored ${figLabel} on Page ${pageNumber}: ymin=${ymin.toFixed(3)}, ymax=${ymax.toFixed(3)}`);
            return { ymin, xmin: 0.03, ymax, xmax: 0.97 };
        } catch (err) {
            console.warn("Could not find figure anchor bounds:", err);
            return null;
        }
    }

    async cropAssetFromImage(
        sourceImagePath: string,
        rawBoundingBox: any,
        assetId: string,
        pdfPath?: string,
        pageNumber?: number,
        description?: string
    ): Promise<string> {
        await fs.mkdir(this.tempDir, { recursive: true });
        const safeAssetId = assetId.replace(/[^a-zA-Z0-9_-]/g, '_');
        const croppedPath = path.join(this.tempDir, `subasset_${safeAssetId}.png`);

        // 1. Try anchor bounds if pdfPath & pageNumber are provided
        if (pdfPath && pageNumber) {
            const anchorBounds = await this.findFigureAnchorBounds(pdfPath, pageNumber, description || assetId);
            if (anchorBounds) {
                try {
                    const fullPagePng = await this.cropAsset(pdfPath, pageNumber, anchorBounds, `anchor_${safeAssetId}`);
                    await sharp(fullPagePng)
                        .trim({ background: '#ffffff', threshold: 15 })
                        .extend({ top: 20, bottom: 20, left: 30, right: 30, background: '#ffffff' })
                        .toFile(croppedPath);
                    try { await fs.unlink(fullPagePng); } catch(e) {}
                    return croppedPath;
                } catch (anchorErr) {
                    console.warn("Anchor crop failed, falling back to slice crop:", anchorErr);
                }
            }
        }

        // 2. Fallback: Crop from source image with generous headroom
        const metadata = await sharp(sourceImagePath).metadata();
        const width = metadata.width || 2480;
        const height = metadata.height || 3508;

        let ymin = 0, xmin = 0, ymax = 1, xmax = 1;
        if (Array.isArray(rawBoundingBox)) {
            ymin = rawBoundingBox[0] ?? 0;
            xmin = rawBoundingBox[1] ?? 0;
            ymax = rawBoundingBox[2] ?? 1;
            xmax = rawBoundingBox[3] ?? 1;
        } else if (rawBoundingBox && typeof rawBoundingBox === 'object') {
            ymin = rawBoundingBox.ymin ?? rawBoundingBox.top ?? 0;
            xmin = rawBoundingBox.xmin ?? rawBoundingBox.left ?? 0;
            ymax = rawBoundingBox.ymax ?? rawBoundingBox.bottom ?? 1;
            xmax = rawBoundingBox.xmax ?? rawBoundingBox.right ?? 1;
        }

        ymin = Math.max(0, Math.min(1, ymin));
        xmin = Math.max(0, Math.min(1, xmin));
        ymax = Math.max(0, Math.min(1, ymax));
        xmax = Math.max(0, Math.min(1, xmax));

        // Horizontal: Expand widely (20% on each side)
        const cropXmin = Math.max(0.02, xmin - 0.20);
        const cropXmax = Math.min(0.98, xmax + 0.20);

        // Vertical: Expand upward by 15% headroom so top rims/meniscus/apparatus are NEVER cut off!
        const cropYmin = Math.max(0.01, ymin - 0.15);
        const cropYmax = Math.min(0.99, ymax + 0.04);

        const left = Math.max(0, Math.floor(cropXmin * width));
        const top = Math.max(0, Math.floor(cropYmin * height));
        const cropWidth = Math.min(width - left, Math.max(1, Math.ceil((cropXmax - cropXmin) * width)));
        const cropHeight = Math.min(height - top, Math.max(1, Math.ceil((cropYmax - cropYmin) * height)));

        try {
            await sharp(sourceImagePath)
                .extract({ left, top, width: cropWidth, height: cropHeight })
                .trim({ background: '#ffffff', threshold: 20 })
                .extend({ top: 20, bottom: 20, left: 30, right: 30, background: '#ffffff' })
                .toFile(croppedPath);
        } catch (trimErr) {
            await sharp(sourceImagePath)
                .extract({ left, top, width: cropWidth, height: cropHeight })
                .toFile(croppedPath);
        }

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
