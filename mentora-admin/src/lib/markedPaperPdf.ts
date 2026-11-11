// Generates a downloadable PDF of a marked student paper.
// Each PDF page = the page image with the teacher's red-ink annotation layer
// drawn on top (same rendering rules as MarkedPaperOverlay), assembled with jsPDF.

import { jsPDF } from 'jspdf';
import { canonicalSubpartKey, cleanCorrectionNote, isScoreFractionText } from './annotationUtils';

export interface PdfAnnotation {
  type?: string;
  text?: string;
  comment?: string;
  teacher_correction?: string;
  question_number?: string | number;
  subpart_label?: string;
  box_2d?: [number, number, number, number];
  bbox?: { y: number; x?: number; ymax?: number; xmax?: number; width?: number; height?: number };
}

export interface MarkedPdfPage {
  original_image_url?: string;
  marked_image_url?: string | null;
  annotations?: PdfAnnotation[];
}

const RED = '#dc2626';
const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);

const loadImage = (url: string): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load image: ${url}`));
    img.src = url;
  });

// Replicates MarkedPaperOverlay's positioning + styling on a canvas.
function drawAnnotations(
  ctx: CanvasRenderingContext2D,
  annotations: PdfAnnotation[],
  W: number,
  H: number
) {
  // Legacy declutter: skip per-question "Q Total" / "Cont." stamps — only the
  // booklet total (top-left of the first page) renders as a page-level stamp.
  const seenBadges = new Set<string>();
  const renderable = annotations.filter(ann => {
    if (ann.type === 'total_header') {
      const t = ann.text || '';
      return !/^Q\d+\s*Total/i.test(t) && !/Cont\. from/i.test(t);
    }

    const box = ann.box_2d || [0, 0, 0, 0];
    const isNorm = box.every(v => v >= 0 && v <= 1);
    const xmin = isNorm ? box[1] * 1000 : box[1];
    const yMid = isNorm ? ((box[0] + box[2]) / 2) * 1000 : (box[0] + box[2]) / 2;
    const isPill =
      ann.type === 'mark_badge' ||
      (isScoreFractionText(ann.text) && (xmin >= 650 || ann.type === 'tick'));

    if (isPill) {
      const qNorm = ann.question_number !== undefined && ann.question_number !== null
        ? String(ann.question_number).trim().replace(/^q(?:uestion)?\s*/i, '')
        : '';
      const partKey = canonicalSubpartKey(ann.subpart_label, qNorm);
      const badgeKey = partKey
        ? `${qNorm}::${partKey}`
        : `raw::${(ann.text || '').trim()}::${Math.round(yMid / 30)}`;
      if (seenBadges.has(badgeKey)) {
        return false;
      }
      seenBadges.add(badgeKey);
    }

    return true;
  });

  // Detect coordinate scale (raw pixels vs normalized 0-1000) — same as the overlay.
  let maxY = 0;
  let maxX = 0;
  renderable.forEach(ann => {
    const [ymin, xmin, ymax, xmax] = ann.box_2d || [0, 0, 0, 0];
    maxY = Math.max(maxY, ymin, ymax);
    maxX = Math.max(maxX, xmin, xmax);
  });
  const isPixel = maxY > 1000 || maxX > 1000;
  const scaleX = isPixel ? W : 1000;
  const scaleY = isPixel ? H : 1000;

  const fontSize = Math.max(14, Math.round(H * 0.017));

  // White halo behind red text: keeps marks legible over handwriting and looks cleaner.
  const haloText = (text: string, x: number, y: number, maxWidth?: number) => {
    ctx.save();
    ctx.lineJoin = 'round';
    ctx.lineWidth = Math.max(3, fontSize * 0.3);
    ctx.strokeStyle = 'rgba(255,255,255,0.92)';
    ctx.strokeText(text, x, y, maxWidth);
    ctx.fillText(text, x, y, maxWidth);
    ctx.restore();
  };

  renderable.forEach(ann => {
    const [ymin, xmin, ymax, xmax] = ann.box_2d || [0, 0, 0, 0];
    const yMid = (ymin + ymax) / 2;
    const topPct = ann.bbox && typeof ann.bbox.height === 'number'
      ? (ann.bbox.y + ann.bbox.height / 2) * 100
      : (yMid / scaleY) * 100;
    const y = (topPct / 100) * H;
    const leftStart = (xmin / scaleX) * W;
    const leftEnd = (xmax / scaleX) * W;

    ctx.fillStyle = RED;
    ctx.strokeStyle = RED;
    ctx.textBaseline = 'middle';

    const isScorePill =
      ann.type === 'mark_badge' ||
      (isScoreFractionText(ann.text) && (leftStart >= W * 0.65 || ann.type === 'tick'));

    // 1. Right-margin score badge: ✓(2/2) / ✗(0/2)
    if (isScorePill && ann.type !== 'total_header') {
      const textClean = (ann.text || '')
        .replace(/^[([✓✗\s]+/, '')
        .replace(/[)\]\s]+$/, '')
        .trim();
      const isZero =
        (ann.text || '').includes('0/') || (ann.text || '').includes('✗') || textClean.startsWith('0');
      const label = `${isZero ? '✗' : '✓'} (${textClean})`;
      ctx.font = `bold ${Math.round(fontSize * 1.05)}px Georgia, serif`;
      ctx.textAlign = 'right';
      haloText(label, W * 0.975, y);
      return;
    }

    // 2. Total / booklet stamps — placement is BOX-DRIVEN (same as the overlay):
    //    a top-left box renders top-left; a low box renders bottom-right (stacked by
    //    its box offset); otherwise top-right.
    if (ann.type === 'total_header') {
      const stampText = ann.text || 'Total: 7/9';
      const fullStamp = stampText.includes('|')
        ? stampText
        : stampText.toLowerCase().includes('booklet')
          ? stampText
          : /total\s*:/i.test(stampText)
            ? `${stampText} | Booklet Total: ${stampText.replace(/.*?Total:\s*/i, '')}`
            : stampText;
      const leftPct = (xmin / scaleX) * 100;
      const isTopLeft = leftPct < 40 && topPct < 30;
      ctx.font = `bold ${Math.round(fontSize * 0.95)}px Georgia, serif`;
      if (isTopLeft) {
        ctx.textAlign = 'left';
        haloText(fullStamp, Math.max(W * 0.02, leftStart), Math.max((topPct / 100) * H, fontSize * 0.6));
      } else {
        const isBottom = topPct >= 60 || (ann.text || '').toLowerCase().includes('total');
        ctx.textAlign = 'right';
        haloText(fullStamp, W * 0.98, isBottom ? y : H * 0.018 + fontSize / 2);
      }
      return;
    }

    // 3. Teacher cross ✗ with "^ correction" note below
    if (ann.type === 'cross' || ann.text === '✗') {
      const x = clamp(leftStart, W * 0.15, W * 0.65);
      const s = fontSize * 0.5;
      ctx.lineWidth = Math.max(3, fontSize * 0.15);
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(x - s, y - s);
      ctx.lineTo(x + s, y + s);
      ctx.moveTo(x + s, y - s);
      ctx.lineTo(x - s, y + s);
      ctx.stroke();

      const hasDedicatedComment = annotations.some(
        a =>
          (a.type === 'comment' || a.type === 'underline') &&
          !!a.subpart_label &&
          a.subpart_label === ann.subpart_label
      );
function cleanCorrectionNote(raw?: string): string {
  if (!raw) return '';
  let note = raw.replace(/^✍️\s*/, '').replace(/^\^\s*/, '').trim();
  note = note.replace(/correct completion after [A-Z0-9]+ with the fraction seen removed with no errors or omissions seen/gi, '');
  note = note.replace(/with no errors or omissions seen/gi, '');
  note = note.replace(/\b(?:oe|nfww|cao|soi|dep)\b/gi, '');
  note = note.replace(/^Missed\s*\[([A-Z0-9]+)\]:\s*/i, '[$1] ');
  note = note.replace(/\s*;\s*$/, '').trim();
  return note;
}

      const rawNote = !hasDedicatedComment ? (ann.teacher_correction || ann.comment || '') : '';
      const note = cleanCorrectionNote(rawNote);
      if (note) {
        ctx.font = `italic ${Math.round(fontSize * 0.85)}px Georgia, serif`;
        ctx.textAlign = 'left';
        haloText(`^ ${note}`, x + s * 1.3, Math.min(y + H * 0.028, H * 0.95), W * 0.55);
      }
      return;
    }

    // 4. Inline tick ✓ after the student's working, with mark code badge (elevated superscript)
    if (ann.type === 'tick' || ann.type === 'inline_tick') {
      const x = clamp(leftEnd + W * 0.012, 0, W * 0.82);
      const s = fontSize * 0.52;
      const tickY = y - s * 0.45; // Superscript elevation to avoid colliding with numbers/formulas
      ctx.lineWidth = Math.max(2.5, fontSize * 0.15);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(x - s, tickY);
      ctx.lineTo(x - s * 0.1, tickY + s * 0.55);
      ctx.lineTo(x + s, tickY - s * 0.6);
      ctx.stroke();
      if (ann.text && ann.text !== '✓') {
        ctx.font = `bold ${Math.round(fontSize * 0.8)}px monospace`;
        ctx.textAlign = 'left';
        haloText(ann.text, x + s * 1.25, tickY);
      }
      return;
    }

    // 5. Standalone comment / underline notes
    if (ann.type === 'comment' || ann.type === 'underline') {
      const note = cleanCorrectionNote(ann.teacher_correction || ann.comment || ann.text);
      if (note) {
        ctx.font = `italic ${Math.round(fontSize * 0.85)}px Georgia, serif`;
        ctx.textAlign = 'left';
        haloText(`^ ${note}`, clamp(leftStart, W * 0.15, W * 0.7), Math.min(y + H * 0.028, H * 0.95), W * 0.55);
      }
    }
  });
}

async function renderPageCanvas(page: MarkedPdfPage): Promise<{ dataUrl: string; w: number; h: number } | null> {
  // AI-painted photo already contains the red ink; otherwise original + vector layer.
  const useMarked = !!page.marked_image_url;
  const url = (useMarked ? page.marked_image_url : page.original_image_url) || '';
  if (!url) return null;

  const img = await loadImage(url);
  const maxDim = 1600;
  const scale = Math.min(1, maxDim / Math.max(img.naturalWidth, img.naturalHeight));
  const W = Math.max(1, Math.round(img.naturalWidth * scale));
  const H = Math.max(1, Math.round(img.naturalHeight * scale));

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, W, H);
  ctx.drawImage(img, 0, 0, W, H);

  if (!useMarked && page.annotations && page.annotations.length > 0) {
    drawAnnotations(ctx, page.annotations, W, H);
  }

  return { dataUrl: canvas.toDataURL('image/jpeg', 0.85), w: W, h: H };
}

export async function downloadMarkedPaperPdf(opts: {
  studentName: string;
  paperLabel: string;
  pages: MarkedPdfPage[];
}): Promise<void> {
  const rendered: { dataUrl: string; w: number; h: number }[] = [];
  for (const page of opts.pages) {
    try {
      const canvas = await renderPageCanvas(page);
      if (canvas) rendered.push(canvas);
    } catch (e) {
      console.warn('Skipping page that failed to render:', e);
    }
  }

  if (rendered.length === 0) {
    throw new Error('No pages could be rendered for the PDF.');
  }

  const first = rendered[0];
  const pdf = new jsPDF({
    unit: 'pt',
    format: 'a4',
    orientation: first.w > first.h ? 'landscape' : 'portrait'
  });

  rendered.forEach((pg, idx) => {
    if (idx > 0) {
      pdf.addPage('a4', pg.w > pg.h ? 'landscape' : 'portrait');
    }
    const pw = pdf.internal.pageSize.getWidth();
    const ph = pdf.internal.pageSize.getHeight();
    const fit = Math.min(pw / pg.w, ph / pg.h);
    const w = pg.w * fit;
    const h = pg.h * fit;
    pdf.addImage(pg.dataUrl, 'JPEG', (pw - w) / 2, (ph - h) / 2, w, h);
  });

  const safeName = (opts.studentName || 'student').replace(/[^a-z0-9 _-]/gi, '').trim() || 'student';
  const safePaper = (opts.paperLabel || 'paper').replace(/[^a-z0-9 _-]/gi, '').trim() || 'paper';
  pdf.save(`Marked_${safePaper}_${safeName}.pdf`);
}
