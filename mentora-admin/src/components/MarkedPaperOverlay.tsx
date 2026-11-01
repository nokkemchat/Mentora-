import React, { useState, useMemo, useEffect } from 'react';
import type { VisualAnnotation } from '../lib/annotationUtils';
import { cleanCorrectionNote } from '../lib/annotationUtils';

interface MarkedPaperOverlayProps {
  imageUrl: string;
  annotations: VisualAnnotation[];
  showAnnotations: boolean;
  showComments?: boolean;
  altText?: string;
}

export default function MarkedPaperOverlay({
  imageUrl,
  annotations,
  showAnnotations,
  showComments = true,
  altText = 'Student submission'
}: MarkedPaperOverlayProps) {
  const [activeTooltip, setActiveTooltip] = useState<string | null>(null);
  const [imageDimensions, setImageDimensions] = useState<{ width: number; height: number } | null>(null);

  // Reset image dimensions when imageUrl changes to prevent stale aspect ratio shift across pages
  useEffect(() => {
    setImageDimensions(null);
  }, [imageUrl]);

  // Legacy declutter: hide per-question "Q Total" / "Cont." page stamps — only the
  // booklet total (top-left of the first page) renders as a page-level stamp.
  const renderableAnnotations = useMemo(
    () =>
      annotations.filter(ann => {
        if (ann.type !== 'total_header') return true;
        const t = ann.text || '';
        return !/^Q\d+\s*Total/i.test(t) && !/Cont\. from/i.test(t);
      }),
    [annotations]
  );

  // Dynamically detect coordinate scale (raw image pixel dimensions vs normalized 0-1000)
  const { scaleX, scaleY } = useMemo(() => {
    let maxY = 0;
    let maxX = 0;
    annotations.forEach((ann) => {
      const [ymin, xmin, ymax, xmax] = ann.box_2d || [0, 0, 0, 0];
      if (ymin > maxY) maxY = ymin;
      if (ymax > maxY) maxY = ymax;
      if (xmin > maxX) maxX = xmin;
      if (xmax > maxX) maxX = xmax;
    });

    const isPixel = maxY > 1000 || maxX > 1000;
    const natW = imageDimensions?.width || (isPixel ? maxX : 1000);
    const natH = imageDimensions?.height || (isPixel ? maxY : 1000);

    return {
      scaleX: isPixel ? natW : 1000,
      scaleY: isPixel ? natH : 1000,
    };
  }, [annotations, imageDimensions]);

  return (
    <div className="relative w-full h-full flex items-center justify-center select-none overflow-hidden">
      {/* Inner wrapper tightly conforms to image dimensions so overlay matches bitmap with zero letterbox offset */}
      <div
        className="relative inline-flex items-center justify-center max-w-full max-h-full rounded-xl shadow-2xl bg-white border border-gray-300 overflow-hidden"
        style={{
          aspectRatio: imageDimensions ? `${imageDimensions.width} / ${imageDimensions.height}` : undefined,
        }}
      >
        {/* Pristine Student Photo Scan - 100% Contained */}
        <img
          src={imageUrl}
          alt={altText}
          onLoad={(e) => {
            const img = e.currentTarget;
            if (img.naturalWidth && img.naturalHeight) {
              setImageDimensions({ width: img.naturalWidth, height: img.naturalHeight });
            }
          }}
          className="block max-w-full max-h-full w-auto h-auto object-contain select-none pointer-events-none"
        />

        {/* Vector Red Ink Teacher Annotation Layer */}
        {showAnnotations && renderableAnnotations.length > 0 && (
          <div className="absolute inset-0 overflow-hidden pointer-events-none">
            {renderableAnnotations.map((ann, idx) => {
              const [ymin, xmin, ymax, xmax] = ann.box_2d || [0, 0, 0, 0];
              const yMid = (ymin + ymax) / 2;
              // Use the box's true vertical center so -translate-y-1/2 centers annotations directly on student writing
              const topPct = ann.bbox && typeof ann.bbox.height === 'number'
                ? (ann.bbox.y + ann.bbox.height / 2) * 100
                : ((yMid / scaleY) * 100);
            const leftEndPct = (xmax / scaleX) * 100;
            const leftStartPct = (xmin / scaleX) * 100;
            const annId = `ann-${idx}-${ann.type}`;

            // Detect if this is a right-margin mark badge (e.g. "✓ 2/2", "✓ 2/3", "✓ 3/4")
            const isScorePill =
              ann.type === 'mark_badge' ||
              ((ann.text || '').includes('/') && (leftStartPct >= 65 || ann.type === 'tick'));

            // 1. Right Margin Score Badges (Rendered as Authentic Teacher Red Ink: ✓(score/max))
            if (isScorePill && ann.type !== 'total_header') {
              const textClean = (ann.text || '')
                .replace(/^[([✓✗\s]+/, '')
                .replace(/[)\]\s]+$/, '')
                .trim();
              const isZero =
                (ann.text || '').includes('0/') ||
                (ann.text || '').includes('✗') ||
                textClean.startsWith('0');

              return (
                <div
                  key={annId}
                  style={{ top: `${topPct}%`, right: '2.5%' }}
                  className="absolute pointer-events-auto group -translate-y-1/2 z-20 select-none cursor-pointer"
                  onMouseEnter={() => setActiveTooltip(annId)}
                  onMouseLeave={() => setActiveTooltip(null)}
                >
                  {/* Authentic Red Ballpoint Pen Margin Score */}
                  <div
                    className="font-serif font-bold text-xs sm:text-sm text-[#dc2626] select-none flex items-center gap-0.5 tracking-tight transition-transform group-hover:scale-105 drop-shadow-[0_1px_1px_rgba(255,255,255,0.85)]"
                  >
                    <span className="text-xs font-black">{isZero ? '✗' : '✓'}</span>
                    <span>({textClean})</span>
                  </div>

                  {/* Tooltip */}
                  {ann.comment && (
                    <div className="absolute bottom-full right-0 mb-1.5 hidden group-hover:flex flex-col items-end z-30 pointer-events-none min-w-[150px] max-w-[260px]">
                      <div className="bg-[#1e1e24] text-white text-[11px] font-medium px-2.5 py-1.5 rounded-lg shadow-xl border border-white/10 text-right leading-tight">
                        <span
                          className={
                            'font-bold block mb-0.5 ' +
                            (isZero ? 'text-[#ef4444]' : 'text-[#10b981]')
                          }
                        >
                          {isZero ? '0 Marks Awarded' : 'Marks Awarded'}
                        </span>
                        {ann.comment}
                      </div>
                      <div className="w-2 h-2 bg-[#1e1e24] rotate-45 -mt-1 mr-3 border-r border-b border-white/10" />
                    </div>
                  )}
                </div>
              );
            }

            // 2. Total Senior Examiner Header Stamp — placement is BOX-DRIVEN:
            //    a top-left box renders top-left; a low box renders bottom-right
            //    (stacked by its box offset); otherwise the legacy top-right spot applies.
            if (ann.type === 'total_header') {
              const stampText = ann.text || 'Total: 7/9';
              const fullStamp = stampText.includes('|')
                ? stampText
                : (stampText.toLowerCase().includes('booklet')
                    ? stampText
                    : /total\s*:/i.test(stampText)
                      ? `${stampText} | Booklet Total: ${stampText.replace(/.*?Total:\s*/i, '')}`
                      : stampText);
              const leftPct = (xmin / scaleX) * 100;
              const boxTopPct = ann.bbox ? ann.bbox.y * 100 : topPct;
              const isTopLeft = leftPct < 40 && boxTopPct < 30;
              const isBottom = !isTopLeft && boxTopPct >= 60;

              return (
                <div
                  key={annId}
                  style={isTopLeft
                    ? { top: `${Math.max(boxTopPct, 1.5)}%`, left: `${Math.max(leftPct, 2)}%` }
                    : isBottom
                      ? { top: `${topPct}%`, right: '2%', transform: 'translateY(-50%)' }
                      : { top: '1.5%', right: '1.5%' }}
                  className="absolute pointer-events-auto z-30 select-none"
                >
                  <div className="font-serif font-bold text-xs sm:text-sm text-[#dc2626] flex items-center gap-1.5 drop-shadow-[0_1px_1px_rgba(255,255,255,0.85)]">
                    <span>{fullStamp}</span>
                  </div>
                </div>
              );
            }

            // 3. Teacher Cross / Correction (Rendered as Authentic Red Handwritten Notes with ^)
            if (ann.type === 'cross' || ann.text === '✗') {
              const crossLeftPct = Math.min(Math.max(leftStartPct, 15), 65);
              const hasDedicatedComment = annotations.some(
                a => (a.type === 'comment' || a.type === 'underline') &&
                     (!!a.subpart_label && a.subpart_label === ann.subpart_label)
              );
              const rawNote = !hasDedicatedComment ? (ann.teacher_correction || ann.comment || '') : '';
              const noteText = cleanCorrectionNote(rawNote);
              const commentTopPct = Math.min(topPct + 3.0, 95);
              const commentLeftPct = Math.min(Math.max(leftStartPct, 16), 45);

              return (
                <React.Fragment key={annId}>
                  {/* Neat Red Pen Cross ✗ on mistake line/diagram */}
                  <div
                    style={{ top: `${topPct}%`, left: `${crossLeftPct}%` }}
                    className="absolute pointer-events-auto group -translate-y-1/2 flex items-center gap-1.5 z-20 select-none cursor-pointer"
                    onMouseEnter={() => setActiveTooltip(annId)}
                    onMouseLeave={() => setActiveTooltip(null)}
                  >
                    <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 text-[#dc2626] stroke-[3.5] filter drop-shadow-[0_1px_1px_rgba(255,255,255,0.9)]">
                      <path d="M6 6 L18 18 M18 6 L6 18" stroke="currentColor" strokeLinecap="round" />
                    </svg>
                  </div>

                  {/* Authentic Teacher Red-Ink Comment: Legible semi-transparent frosted card to prevent ink collisions */}
                  {showComments && noteText && (
                    <div
                      style={{
                        top: `${commentTopPct}%`,
                        left: `${commentLeftPct}%`,
                        maxWidth: '55%'
                      }}
                      className="absolute pointer-events-auto z-25 flex items-start gap-1 select-none bg-white/95 backdrop-blur-[2px] px-2 py-0.5 rounded shadow-[0_1px_2px_rgba(0,0,0,0.1)] border border-red-200/80"
                    >
                      <span className="font-bold text-[10px] sm:text-[11px] text-[#dc2626] leading-none shrink-0 select-none">^</span>
                      <span className="font-serif italic font-medium text-[10px] sm:text-[11px] text-[#dc2626] leading-tight drop-shadow-[0_1px_1px_rgba(255,255,255,0.95)]">
                        {noteText}
                      </span>
                    </div>
                  )}

                  {/* Hover Tooltip if comments toggled off */}
                  {!showComments && ann.comment && (
                    <div
                      style={{ top: `${topPct}%`, left: `${crossLeftPct}%` }}
                      className="absolute pointer-events-none group-hover:flex hidden bottom-full left-0 mb-1.5 z-30 min-w-[150px] max-w-[280px]"
                    >
                      <div className="bg-[#1e1e24] text-white text-[11px] font-medium px-2.5 py-1.5 rounded-lg shadow-xl border border-white/10 text-left leading-tight">
                        <span className="text-[#ef4444] font-bold block mb-0.5">✗ Examiner Correction</span>
                        {ann.comment}
                        {ann.teacher_correction && (
                          <span className="text-amber-300 block mt-1">✎ {ann.teacher_correction}</span>
                        )}
                      </div>
                      <div className="w-2 h-2 bg-[#1e1e24] rotate-45 -mt-1 ml-3 border-r border-b border-white/10" />
                    </div>
                  )}
                </React.Fragment>
              );
            }

            // 4. Inline Tick (Placed AFTER or SUPERSCRIPT above the student's formula / working step)
            if (ann.type === 'tick' || ann.type === 'inline_tick') {
              // Position tick slightly superscript above the baseline so it never collides with numbers
              const leftPct = Math.min(Math.max(leftEndPct + 1.2, leftStartPct + 6), 84);
              const elevatedTopPct = Math.max(topPct - 1.8, 1.5);

              return (
                <div
                  key={annId}
                  style={{ top: `${elevatedTopPct}%`, left: `${leftPct}%` }}
                  className="absolute pointer-events-auto group -translate-y-[80%] flex items-center gap-1 z-10 select-none cursor-pointer"
                  onMouseEnter={() => setActiveTooltip(annId)}
                  onMouseLeave={() => setActiveTooltip(null)}
                >
                  {/* SVG Authentic Teacher Checkmark */}
                  <svg
                    viewBox="0 0 32 32"
                    className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-[#dc2626] filter drop-shadow-[0_1px_1px_rgba(255,255,255,0.9)] transition-transform group-hover:scale-110 shrink-0"
                  >
                    <path
                      d="M5 16.5 L12 23.5 L27 8.5"
                      fill="none"
                      stroke="#dc2626"
                      strokeWidth="3.6"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>

                  {/* Mark code badge if not just ✓ (e.g. M1, A1, B1) */}
                  {ann.text && ann.text !== '✓' && (
                    <span className="text-[10px] sm:text-[11px] font-extrabold text-[#dc2626] font-mono leading-none">
                      {ann.text}
                    </span>
                  )}

                  {/* Hover tooltip for awarded criterion */}
                  {ann.comment && (
                    <div className="absolute bottom-full left-0 mb-1.5 hidden group-hover:flex flex-col items-start z-30 pointer-events-none min-w-[160px] max-w-[280px]">
                      <div className="bg-[#1e1e24] text-white text-[11px] font-medium px-2.5 py-1.5 rounded-lg shadow-xl border border-white/10 leading-tight">
                        <span className="text-[#10b981] font-bold block mb-0.5">✓ Mark Awarded</span>
                        {ann.comment}
                      </div>
                      <div className="w-2 h-2 bg-[#1e1e24] rotate-45 -mt-1 ml-3 border-r border-b border-white/10" />
                    </div>
                  )}
                </div>
              );
            }

            // 5. Underline / Standalone Teacher Note with ^
            if (ann.type === 'underline' || ann.type === 'comment') {
              const noteText = cleanCorrectionNote(ann.teacher_correction || ann.text || ann.comment);
              const leftPct = Math.min(Math.max(leftStartPct, 15), 45);
              const topAdjusted = Math.min(topPct + 2.0, 95);

              return (
                <div
                  key={annId}
                  style={{
                    top: `${topAdjusted}%`,
                    left: `${leftPct}%`,
                    maxWidth: '55%'
                  }}
                  className="absolute pointer-events-auto group z-25 bg-white/95 backdrop-blur-[2px] px-2 py-0.5 rounded shadow-[0_1px_2px_rgba(0,0,0,0.1)] border border-red-200/80"
                >
                  {ann.type === 'underline' && (
                    <div className="border-b-[1.5px] border-[#dc2626] w-full h-0.5 mb-1" />
                  )}
                  {showComments && noteText && (
                    <div className="flex items-start gap-1 text-[#dc2626] font-serif italic text-[10px] sm:text-[11px] leading-tight drop-shadow-[0_1px_1px_rgba(255,255,255,0.95)]">
                      <span className="font-bold not-italic">^</span>
                      <span>{noteText}</span>
                    </div>
                  )}
                </div>
              );
            }

            return null;
          })}
        </div>
      )}
      </div>
    </div>
  );
}
