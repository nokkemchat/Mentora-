import React, { useState, useMemo } from 'react';
import type { VisualAnnotation } from '../lib/annotationUtils';

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
    <div
      className="relative flex items-center justify-center select-none rounded-xl"
      style={{
        height: '100%',
        maxHeight: '100%',
        maxWidth: '100%',
        aspectRatio: imageDimensions ? `${imageDimensions.width} / ${imageDimensions.height}` : undefined,
        width: imageDimensions ? 'auto' : '100%'
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
        className="w-full h-full max-w-full max-h-full object-contain rounded-xl shadow-2xl bg-white border border-gray-300 block select-none pointer-events-none"
      />

      {/* Vector Red Ink Teacher Annotation Layer */}
      {showAnnotations && annotations.length > 0 && (
        <div className="absolute inset-0 overflow-hidden pointer-events-none rounded-xl">
          {annotations.map((ann, idx) => {
            const [ymin, xmin, ymax, xmax] = ann.box_2d || [0, 0, 0, 0];
            const yMid = (ymin + ymax) / 2;
            const topPct = ann.bbox ? (ann.bbox.y * 100) : ((yMid / scaleY) * 100);
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
                    className="font-serif font-bold text-sm sm:text-base text-[#dc2626] select-none flex items-center gap-0.5 tracking-tight transition-transform group-hover:scale-105 drop-shadow-[0_1px_1px_rgba(255,255,255,0.85)]"
                  >
                    <span className="text-sm font-black">{isZero ? '✗' : '✓'}</span>
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

            // 2. Total Senior Examiner Header Stamp (Top or Bottom)
            if (ann.type === 'total_header') {
              const isBottom = topPct >= 60 || (ann.text && ann.text.toLowerCase().includes('total'));
              const stampText = ann.text || 'Total: 7/9';
              const fullStamp = stampText.includes('|')
                ? stampText
                : (stampText.toLowerCase().includes('booklet')
                    ? stampText
                    : `${stampText} | Booklet Total: ${stampText.replace(/.*?Total:\s*/i, '')}`);

              return (
                <div
                  key={annId}
                  style={isBottom ? { bottom: '2%', right: '2%' } : { top: '1.5%', right: '1.5%' }}
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
              const noteText = !hasDedicatedComment ? (ann.teacher_correction || ann.comment || '').replace(/^✍️\s*/, '').replace(/^\^\s*/, '').trim() : '';
              const commentTopPct = Math.min(topPct + 2.5, 95);
              const commentLeftPct = crossLeftPct;
              const commentMaxW = '65%';

              return (
                <React.Fragment key={annId}>
                  {/* Neat Red Pen Cross ✗ on mistake line/diagram */}
                  <div
                    style={{ top: `${topPct}%`, left: `${crossLeftPct}%` }}
                    className="absolute pointer-events-auto group -translate-y-1/2 flex items-center gap-1.5 z-20 select-none cursor-pointer"
                    onMouseEnter={() => setActiveTooltip(annId)}
                    onMouseLeave={() => setActiveTooltip(null)}
                  >
                    <svg viewBox="0 0 24 24" className="w-4 h-4 text-[#dc2626] stroke-[3.5] filter drop-shadow-[0_1px_1px_rgba(255,255,255,0.9)]">
                      <path d="M6 6 L18 18 M18 6 L6 18" stroke="currentColor" strokeLinecap="round" />
                    </svg>
                  </div>

                  {/* Authentic Teacher Red-Ink Comment: Handwritten style with ^ in blank space (Zero Blocking Cards) */}
                  {showComments && (ann.comment || ann.teacher_correction) && (
                    <div
                      style={{
                        top: `${commentTopPct}%`,
                        left: `${commentLeftPct}%`,
                        maxWidth: commentMaxW
                      }}
                      className="absolute pointer-events-auto z-20 flex items-start gap-1 select-none pointer-events-none sm:pointer-events-auto"
                    >
                      <span className="font-bold text-xs sm:text-sm text-[#dc2626] leading-none shrink-0 select-none">^</span>
                      <span className="font-serif italic font-medium text-[11px] sm:text-[12px] text-[#dc2626] leading-tight drop-shadow-[0_1px_1px_rgba(255,255,255,0.95)]">
                        {ann.teacher_correction || ann.comment}
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

            // 4. Inline Tick (Placed AFTER the student's formula / working step)
            if (ann.type === 'tick' || ann.type === 'inline_tick') {
              // Position tick directly after the student's mathematical expression
              const leftPct = Math.min(leftEndPct + 1.2, 82);

              return (
                <div
                  key={annId}
                  style={{ top: `${topPct}%`, left: `${leftPct}%` }}
                  className="absolute pointer-events-auto group -translate-y-1/2 flex items-center gap-1.5 z-10 select-none cursor-pointer"
                  onMouseEnter={() => setActiveTooltip(annId)}
                  onMouseLeave={() => setActiveTooltip(null)}
                >
                  {/* SVG Authentic Teacher Checkmark */}
                  <svg
                    viewBox="0 0 32 32"
                    className="w-5 h-5 sm:w-6 sm:h-6 text-[#dc2626] filter drop-shadow-[0_1px_1px_rgba(255,255,255,0.9)] transition-transform group-hover:scale-110 shrink-0"
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
                    <span className="text-[11px] font-extrabold text-[#dc2626] font-mono">
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
              const leftPct = Math.max(leftStartPct, 15);
              const maxWPct = Math.min(Math.max(((xmax - xmin) / scaleX) * 100, 30), 65);

              return (
                <div
                  key={annId}
                  style={{
                    top: `${topPct}%`,
                    left: `${leftPct}%`,
                    maxWidth: `${Math.max(maxWPct, 25)}%`
                  }}
                  className="absolute pointer-events-auto group z-15"
                >
                  {ann.type === 'underline' && (
                    <div className="border-b-[1.5px] border-[#dc2626] w-full h-0.5 mb-1" />
                  )}
                  {showComments && (ann.text || ann.comment) && (
                    <div className="flex items-start gap-1 text-[#dc2626] font-serif italic text-xs leading-tight drop-shadow-[0_1px_1px_rgba(255,255,255,0.95)]">
                      <span className="font-bold not-italic">^</span>
                      <span>{(ann.teacher_correction || ann.text || ann.comment || '').replace(/^✍️\s*/, '')}</span>
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
  );
}
