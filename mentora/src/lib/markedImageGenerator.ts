import { Skia, PaintStyle, StrokeCap, StrokeJoin, ImageFormat, matchFont } from '@shopify/react-native-skia';
import * as FileSystem from 'expo-file-system/legacy';
import { Platform } from 'react-native';
import { VisualAnnotation, AssessmentResult } from './tutorAgent';
// annotationUtils is no longer needed — fallback synthesis removed

interface GenerateMarkedImageOptions {
  imageUri: string;
  annotations: VisualAnnotation[];
  score: number;
  maxScore: number;
  assessment?: AssessmentResult;
}

/**
 * Generates a real, flattened JPEG image file where the teacher's red ink
 * (ticks, underlines, crosses, margin marks, circled score stamp)
 * is permanently drawn into the image bitmap pixels.
 */
export async function generateMarkedImageFile({
  imageUri,
  annotations,
  score,
  maxScore,
  assessment,
}: GenerateMarkedImageOptions): Promise<string> {
  try {
    const baseDir = FileSystem.cacheDirectory || FileSystem.documentDirectory || '';

    // 1. Read image into base64
    let base64 = '';
    if (imageUri.startsWith('data:')) {
      base64 = imageUri.split(',')[1] || '';
    } else if (imageUri.startsWith('http://') || imageUri.startsWith('https://')) {
      // Download or fetch to get local data
      try {
        const tempPath = `${baseDir}orig_${Date.now()}.jpg`;
        const downloadResult = await FileSystem.downloadAsync(imageUri, tempPath);
        base64 = await FileSystem.readAsStringAsync(downloadResult.uri, { encoding: 'base64' });
      } catch (dlErr) {
        console.warn('downloadAsync failed, attempting fetch fallback:', dlErr);
        const resp = await fetch(imageUri);
        const blob = await resp.blob();
        base64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onloadend = () => {
            const res = reader.result as string;
            resolve(res.split(',')[1] || '');
          };
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        });
      }
    } else {
      base64 = await FileSystem.readAsStringAsync(imageUri, { encoding: 'base64' });
    }

    if (!base64) {
      throw new Error('Could not read image data for marking.');
    }

    // 3. Decode into Skia Image
    const skData = Skia.Data.fromBase64(base64);
    const skImage = Skia.Image.MakeImageFromEncoded(skData);
    if (!skImage) {
      throw new Error('Failed to decode image with Skia.');
    }

    const imgW = skImage.width();
    const imgH = skImage.height();

    // 4. Create Offscreen Skia Surface
    const surface = Skia.Surface.Make(imgW, imgH);
    if (!surface) {
      throw new Error('Failed to allocate offscreen Skia surface.');
    }

    const canvas = surface.getCanvas();

    // 5. Draw original student paper
    canvas.drawImage(skImage, 0, 0);

    // 6. Setup Paints for Red Teacher Ink (authentic ballpoint pen)
    const redColor = Skia.Color('#C82333');

    const strokePaint = Skia.Paint();
    strokePaint.setColor(redColor);
    strokePaint.setStyle(PaintStyle.Stroke);
    strokePaint.setStrokeWidth(Math.max(imgW * 0.003, 3));
    strokePaint.setStrokeCap(StrokeCap.Round);
    strokePaint.setStrokeJoin(StrokeJoin.Round);

    const textPaint = Skia.Paint();
    textPaint.setColor(redColor);

    // Font for margin annotations and score: priority for handwriting styles
    const fontSize = Math.max(imgW * 0.022, 17);
    const headerFontSize = Math.max(imgW * 0.028, 22);
    let font: any = null;
    let headerFont: any = null;
    try {
      const fontMgr = Skia.FontMgr.System();
      const count = fontMgr.countFamilies();
      let family = 'Helvetica';
      const preferred = ['Noteworthy', 'Chalkboard SE', 'Bradley Hand', 'Snell Roundhand', 'Marker Felt', 'Arial'];
      for (const pref of preferred) {
        for (let i = 0; i < count; i++) {
          const name = fontMgr.getFamilyName(i);
          if (name.toLowerCase().includes(pref.toLowerCase())) {
            family = name;
            break;
          }
        }
        if (family !== 'Helvetica') break;
      }
      const typeface = fontMgr.matchFamilyStyle(family, { weight: 600, width: 5, slant: 0 }) 
        || (count > 0 ? fontMgr.matchFamilyStyle(fontMgr.getFamilyName(0), { weight: 600, width: 5, slant: 0 }) : null);
      if (typeface) {
        font = Skia.Font(typeface, fontSize);
        headerFont = Skia.Font(typeface, headerFontSize);
      }
    } catch (fontErr) {
      console.warn('System font matching failed:', fontErr);
    }

    if (!font) {
      try {
        font = Skia.Font(undefined, fontSize);
        headerFont = Skia.Font(undefined, headerFontSize);
      } catch (_) {}
    }

    // 7. Paint each red ink annotation onto the bitmap.
    // ONLY render annotations the AI actually returned — never synthesize fallback positions.
    const activeAnnotations = annotations && annotations.length > 0 ? annotations : [];

    activeAnnotations.forEach((ann, idx) => {
      let ymin = 120 + idx * 95;
      let xmin = 880;

      if (Array.isArray(ann.box_2d) && ann.box_2d.length >= 2) {
        ymin = typeof ann.box_2d[0] === 'number' ? ann.box_2d[0] : ymin;
        xmin = typeof ann.box_2d[1] === 'number' ? ann.box_2d[1] : xmin;
      }
      // Normalize 0..1 scale to 0..1000 if model returned fractional values
      if (ymin > 0 && ymin <= 1) ymin = ymin * 1000;
      if (xmin > 0 && xmin <= 1) xmin = xmin * 1000;

      const x = Math.min(Math.max((xmin / 1000) * imgW, imgW * 0.05), imgW * 0.95);
      const y = Math.min(Math.max((ymin / 1000) * imgH, imgH * 0.05), imgH * 0.95);

      const rawType = (ann.type || '').toLowerCase();
      const isInlineTick = rawType === 'inline_tick' || ((rawType === 'tick' || rawType === 'checkmark' || rawType === 'check') && xmin < 800);
      const isTick = (rawType === 'tick' || rawType === 'checkmark' || rawType === 'check' || rawType === 'correct') && !isInlineTick;
      const isCross = rawType === 'cross' || rawType === 'x' || rawType === 'wrong' || rawType === 'incorrect';
      const isUnderline = rawType === 'underline' || rawType === 'correction' || rawType === 'mistake' || rawType === 'note' || rawType === 'comment';
      const isTotal = rawType === 'total_header' || rawType === 'total' || rawType === 'score' || rawType === 'grade';

      if (isInlineTick) {
        // Crisp in-situ red ballpoint pen tick placed directly on student's keyword, number, or equation step
        const tickSize = Math.max(imgW * 0.016, 13);
        const path = Skia.Path.Make();
        path.moveTo(x - tickSize * 0.9, y + tickSize * 0.15);
        path.lineTo(x - tickSize * 0.45, y + tickSize * 0.65);
        path.lineTo(x, y - tickSize * 0.4);
        canvas.drawPath(path, strokePaint);

        if (font && ann.text && ann.text !== '✓') {
          const label = ann.text.replace(/[()]/g, '');
          const smallFont = Skia.Font(font.getTypeface(), Math.max(fontSize * 0.65, 11));
          canvas.drawText(label, x + 4, y - tickSize * 0.2, textPaint, smallFont);
        }
      } else if (isTick) {
        // Hand-drawn red teacher checkmark followed by (score/max) in right margin
        const tickSize = Math.max(imgW * 0.024, 18);
        const path = Skia.Path.Make();
        path.moveTo(x - tickSize * 1.1, y + tickSize * 0.2);
        path.lineTo(x - tickSize * 0.6, y + tickSize * 0.75);
        path.lineTo(x, y - tickSize * 0.45);
        canvas.drawPath(path, strokePaint);

        if (font && ann.text) {
          const label = ann.text.startsWith('(') ? ann.text : `(${ann.text})`;
          canvas.drawText(label, x + 8, y + fontSize * 0.35, textPaint, font);
        }
      } else if (isCross) {
        // Hand-drawn red X followed by (0/max) in red ink
        const xSize = Math.max(imgW * 0.018, 14);
        canvas.drawLine(x - xSize * 1.1, y - xSize * 0.5, x - xSize * 0.2, y + xSize * 0.5, strokePaint);
        canvas.drawLine(x - xSize * 0.2, y - xSize * 0.5, x - xSize * 1.1, y + xSize * 0.5, strokePaint);

        if (font && ann.text) {
          const label = ann.text.startsWith('(') ? ann.text : `(${ann.text})`;
          canvas.drawText(label, x + 8, y + fontSize * 0.35, textPaint, font);
        }
      } else if (isUnderline) {
        // Handwritten teacher explanation notes underneath the mistake
        const lineW = Math.min(imgW * 0.65, 300);
        const linePath = Skia.Path.Make();
        linePath.moveTo(x, y + 4);
        linePath.lineTo(x + lineW, y + 4);
        canvas.drawPath(linePath, strokePaint);

        if (font && ann.text) {
          const noteText = `✍️ ${ann.text.replace(/^[⚠️\s]+/, '')}`;
          const maxLineWidth = imgW * 0.68;
          const words = noteText.split(' ');
          let currentLine = '';
          let currentY = y + fontSize * 1.25;
          const lineHeight = fontSize * 1.35;

          for (const word of words) {
            const testLine = currentLine ? `${currentLine} ${word}` : word;
            let testW = 0;
            try {
              testW = font.measureText ? font.measureText(testLine).width : testLine.length * (fontSize * 0.6);
            } catch (_) {
              testW = testLine.length * (fontSize * 0.6);
            }
            if (testW > maxLineWidth && currentLine) {
              canvas.drawText(currentLine, x, currentY, textPaint, font);
              currentLine = word;
              currentY += lineHeight;
            } else {
              currentLine = testLine;
            }
          }
          if (currentLine) {
            canvas.drawText(currentLine, x, currentY, textPaint, font);
          }
        }
      } else if (isTotal) {
        // Natural red pen grade circled at the bottom right: "Total: 7/10"
        const totalText = (ann.text && ann.text.startsWith('Total')) ? ann.text : (ann.text ? `Total: ${ann.text}` : `Total: ${score}/${maxScore}`);
        const tFont = headerFont || font;
        if (tFont) {
          canvas.drawText(totalText, x, y, textPaint, tFont);
          // Circled border around total stamp
          const stampW = Math.max(imgW * 0.28, 140);
          const stampH = Math.max(imgH * 0.045, 36);
          const rrect = Skia.RRectXY(
            Skia.XYWHRect(x - 10, y - stampH * 0.75, stampW, stampH),
            12,
            12
          );
          canvas.drawRRect(rrect, strokePaint);
        }
      }
    });

    // If total wasn't in annotations, always write circled teacher grade at bottom right
    const hasTotalHeader = activeAnnotations.some((a) => {
      const t = (a.type || '').toLowerCase();
      return t === 'total_header' || t === 'total' || t === 'score';
    });
    if (!hasTotalHeader) {
      const totalText = `Total: ${score}/${maxScore}`;
      const tFont = headerFont || font;
      if (tFont) {
        const tx = imgW * 0.70;
        const ty = imgH * 0.88;
        canvas.drawText(totalText, tx, ty, textPaint, tFont);
        const stampW = Math.max(imgW * 0.26, 130);
        const stampH = Math.max(imgH * 0.045, 36);
        const rrect = Skia.RRectXY(
          Skia.XYWHRect(tx - 10, ty - stampH * 0.75, stampW, stampH),
          12,
          12
        );
        canvas.drawRRect(rrect, strokePaint);
      }
    }

    // 8. Snapshot offscreen surface and encode to JPEG
    const snapshot = surface.makeImageSnapshot();
    const markedBase64 = snapshot.encodeToBase64(ImageFormat.JPEG, 85);

    // 9. Write to local file system cache
    const outputFilename = `marked_script_${Date.now()}_${Math.random().toString(36).substring(7)}.jpg`;
    const outputPath = `${baseDir}${outputFilename}`;
    try {
      await FileSystem.writeAsStringAsync(outputPath, markedBase64, { encoding: 'base64' });
    } catch (_) {}

    // Return the data URI directly as it renders instantaneously without file I/O lag
    return `data:image/jpeg;base64,${markedBase64}`;
  } catch (err) {
    console.error('generateMarkedImageFile error:', err);
    // Fallback to original image if Skia processing fails
    return imageUri;
  }
}

/**
 * Downsamples and compresses high-res camera/gallery photos (e.g. 4032x3024 5MB)
 * down to max dimension 1280px at 75% quality (~150-250KB base64).
 * This ensures lightning-fast upload, prevents network drops, and stays well within
 * Edge Function payload limits while preserving pin-sharp handwriting clarity.
 */
export async function optimizeImageForUpload(uriOrBase64: string, maxDim = 1280): Promise<{ uri: string; base64: string }> {
  try {
    let rawB64 = '';
    if (uriOrBase64.startsWith('data:')) {
      rawB64 = uriOrBase64.split(',')[1] || '';
    } else {
      rawB64 = await FileSystem.readAsStringAsync(uriOrBase64, { encoding: 'base64' });
    }
    if (!rawB64) return { uri: uriOrBase64, base64: uriOrBase64 };

    const skData = Skia.Data.fromBase64(rawB64);
    const skImg = Skia.Image.MakeImageFromEncoded(skData);
    if (!skImg) {
      return { 
        uri: uriOrBase64, 
        base64: uriOrBase64.startsWith('data:') ? uriOrBase64 : `data:image/jpeg;base64,${rawB64}` 
      };
    }

    const w = skImg.width();
    const h = skImg.height();
    const maxVal = Math.max(w, h);

    if (maxVal <= maxDim && rawB64.length < 500000) {
      return {
        uri: uriOrBase64,
        base64: uriOrBase64.startsWith('data:') ? uriOrBase64 : `data:image/jpeg;base64,${rawB64}`
      };
    }

    const scale = Math.min(1, maxDim / maxVal);
    const newW = Math.round(w * scale);
    const newH = Math.round(h * scale);

    const surface = Skia.Surface.Make(newW, newH);
    if (!surface) {
      return { 
        uri: uriOrBase64, 
        base64: uriOrBase64.startsWith('data:') ? uriOrBase64 : `data:image/jpeg;base64,${rawB64}` 
      };
    }

    const canvas = surface.getCanvas();
    const srcRect = Skia.XYWHRect(0, 0, w, h);
    const dstRect = Skia.XYWHRect(0, 0, newW, newH);
    canvas.drawImageRect(skImg, srcRect, dstRect, Skia.Paint());

    const snapshot = surface.makeImageSnapshot();
    const compressedB64 = snapshot.encodeToBase64(ImageFormat.JPEG, 75);
    const dataUri = `data:image/jpeg;base64,${compressedB64}`;

    return { uri: dataUri, base64: dataUri };
  } catch (err) {
    console.warn('optimizeImageForUpload fallback:', err);
    return { uri: uriOrBase64, base64: uriOrBase64 };
  }
}
