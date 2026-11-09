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
        } else if (process.platform === 'win32') {
            this.popplerBin = path.join(__dirname, '..', 'vendor', 'poppler', 'poppler-24.02.0', 'Library', 'bin', 'pdftocairo.exe');
        } else {
            // Linux (e.g. Render / Docker container)
            this.popplerBin = 'pdftocairo';
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
        const MARGIN_Y = 0.01; // generous 1% padding so question slices don't clip headers or answer lines at page boundaries
        const rawYmin = Math.max(0, (boundingBox.ymin || 0) - MARGIN_Y);
        const rawYmax = Math.min(1, (boundingBox.ymax || 1) + MARGIN_Y);
        const top = Math.max(0, Math.floor(rawYmin * height));
        const cropWidth = width;
        const cropHeight = Math.min(height - top, Math.max(1, Math.ceil((rawYmax - rawYmin) * height)));

        await sharp(pageImagePath)
            .extract({ left, top, width: cropWidth, height: cropHeight })
            .toFile(croppedPath);

        // Cleanup full page image
        try { await fs.unlink(pageImagePath); } catch (e) {}

        return croppedPath;
    }

    async cropAssetFromImage(
        sourceImagePath: string,
        rawBoundingBox: any,
        assetId: string
    ): Promise<string> {
        await fs.mkdir(this.tempDir, { recursive: true });
        const safeAssetId = assetId.replace(/[^a-zA-Z0-9_-]/g, '_');
        const croppedPath = path.join(this.tempDir, `subasset_${safeAssetId}.png`);

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
        ymax = Math.max(0, Math.min(1, ymax));
        if (ymin >= ymax) {
            ymin = 0;
            ymax = 1;
        }

        // Full width of the paper across the visual band:
        // Always extract the full page width (left = 0, cropWidth = width) so no formulas,
        // bonds, apparatus, annotations, or labels are EVER cut off horizontally.
        const left = 0;
        const cropWidth = width;

        // Auto-fit vertical boundary detection with smart whitespace cushions
        // Ensures no top curve of test tubes, beaker rims, table borders, atom labels,
        // or captions are clipped, while safely excluding question text above and below.
        const bounds = await this.computeSmartVerticalBounds(sourceImagePath, ymin, ymax);

        await sharp(sourceImagePath)
            .extract({ left, top: bounds.top, width: cropWidth, height: bounds.height })
            .toFile(croppedPath);

        return croppedPath;
    }

    async computeSmartVerticalBounds(
        sourceImagePath: string,
        ymin: number,
        ymax: number
    ): Promise<{ top: number; height: number; width: number }> {
        const image = sharp(sourceImagePath);
        const metadata = await image.metadata();
        const width = metadata.width || 2480;
        const height = metadata.height || 3508;

        try {
            const raw = await image.raw().toBuffer();
            const channels = metadata.channels || 4;

            // Count dark pixels per horizontal row across 5% to 95% of page width
            // to ignore any marginal binding marks, edge punch-holes or scanning artifacts.
            const xStart = Math.round(width * 0.05);
            const xEnd = Math.round(width * 0.95);
            const rowDarkCounts = new Uint32Array(height);
            for (let y = 0; y < height; y++) {
                let count = 0;
                const rowOffset = y * width;
                for (let x = xStart; x < xEnd; x++) {
                    const idx = (rowOffset + x) * channels;
                    if (raw[idx] < 225 || raw[idx + 1] < 225 || raw[idx + 2] < 225) {
                        count++;
                    }
                }
                rowDarkCounts[y] = count;
            }

            const initialTop = Math.max(0, Math.min(height - 1, Math.floor(ymin * height)));
            const initialBottom = Math.max(0, Math.min(height - 1, Math.ceil(ymax * height)));

            const MAX_SCAN_WINDOW = Math.max(50, Math.round(height * 0.12)); // up to 12% vertical scan window
            const NOISE_THRESHOLD = 3;

            // 1. Precise Diagram Top:
            let diagramTop = initialTop;
            if (rowDarkCounts[diagramTop] > NOISE_THRESHOLD) {
                // ymin was inside content (cut off the top of the diagram) -> scan UP until whitespace
                const limit = Math.max(0, initialTop - MAX_SCAN_WINDOW);
                while (diagramTop > limit && rowDarkCounts[diagramTop] > NOISE_THRESHOLD) {
                    diagramTop--;
                }
            } else {
                // ymin was in whitespace -> scan DOWN to find where diagram actually begins
                const limit = Math.min(initialBottom, initialTop + MAX_SCAN_WINDOW);
                while (diagramTop < limit && rowDarkCounts[diagramTop] <= NOISE_THRESHOLD) {
                    diagramTop++;
                }
            }

            // Find where preceding text ends above diagramTop
            let textAboveEnd = Math.max(0, diagramTop - 1);
            while (textAboveEnd > 0 && rowDarkCounts[textAboveEnd] <= NOISE_THRESHOLD) {
                textAboveEnd--;
            }

            // 2. Precise Diagram Bottom:
            let diagramBottom = initialBottom;
            if (rowDarkCounts[diagramBottom] > NOISE_THRESHOLD) {
                // ymax was inside content -> scan DOWN until whitespace
                const limit = Math.min(height - 1, initialBottom + MAX_SCAN_WINDOW);
                while (diagramBottom < limit && rowDarkCounts[diagramBottom] > NOISE_THRESHOLD) {
                    diagramBottom++;
                }
            } else {
                // ymax was in whitespace -> scan UP to find content bottom
                const limit = Math.max(diagramTop, initialBottom - MAX_SCAN_WINDOW);
                while (diagramBottom > limit && rowDarkCounts[diagramBottom] <= NOISE_THRESHOLD) {
                    diagramBottom--;
                }
            }

            // Check for figure caption below the drawing:
            // Drawings (like apparatus or circuits) often have a gap of 50-250px between the drawing
            // and the caption (e.g. "Fig. 1.1", "Fig. 4"). If initialBottom or the scan window indicates
            // a single-line caption band directly below before the next subpart, extend diagramBottom.
            const captionScanLimit = Math.min(height - 1, Math.max(initialBottom + 50, diagramBottom + Math.round(height * 0.08)));
            let scanForCaption = diagramBottom + 1;
            while (scanForCaption < captionScanLimit && rowDarkCounts[scanForCaption] <= NOISE_THRESHOLD) {
                scanForCaption++;
            }
            if (scanForCaption < captionScanLimit && rowDarkCounts[scanForCaption] > NOISE_THRESHOLD) {
                let captionBottom = scanForCaption;
                while (captionBottom < height - 1 && rowDarkCounts[captionBottom] > NOISE_THRESHOLD) {
                    captionBottom++;
                }
                const captionHeight = captionBottom - scanForCaption;
                // Single-line caption is typically < 3.5% of page height
                if (captionHeight < Math.round(height * 0.035)) {
                    if (initialBottom >= scanForCaption - Math.round(height * 0.03)) {
                        diagramBottom = captionBottom;
                    }
                }
            }

            // Find where subsequent text begins below diagramBottom
            let textBelowStart = Math.min(height - 1, diagramBottom + 1);
            while (textBelowStart < height - 1 && rowDarkCounts[textBelowStart] <= NOISE_THRESHOLD) {
                textBelowStart++;
            }

            // Generous vertical breathing room: ~25-45px depending on image resolution
            const DESIRED_PADDING = Math.max(25, Math.round(height * 0.012));

            const topGap = diagramTop - textAboveEnd;
            const topPad = topGap > 6 ? Math.min(DESIRED_PADDING, Math.max(8, Math.floor(topGap / 2))) : 0;
            const finalTop = Math.max(textAboveEnd + 1, diagramTop - topPad);

            const bottomGap = textBelowStart - diagramBottom;
            const bottomPad = bottomGap > 6 ? Math.min(DESIRED_PADDING, Math.max(8, Math.floor(bottomGap / 2))) : 0;
            const finalBottom = Math.min(textBelowStart - 1, diagramBottom + bottomPad);

            const cropHeight = Math.max(10, finalBottom - finalTop);

            return { top: finalTop, height: cropHeight, width };
        } catch (scanErr) {
            console.warn("Smart vertical boundary scanner encountered error, falling back to padded bounding box:", scanErr);
            const MARGIN_Y = 0.015;
            const top = Math.max(0, Math.floor((ymin - MARGIN_Y) * height));
            const bottom = Math.min(height, Math.ceil((ymax + MARGIN_Y) * height));
            const cropHeight = Math.max(1, bottom - top);
            return { top, height: cropHeight, width };
        }
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
