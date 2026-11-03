import React from 'react';

interface ZivisoArtisticBackgroundProps {
  offsetSidebar?: boolean;
  className?: string;
}

/**
 * ZivisoArtisticBackground
 * 
 * Displays large, cozy 3D furry plush letters spelling Z-I-V-I-S-O
 * in an artistic tumbling/floating arrangement.
 * 
 * Rendered with 100% transparent alpha falloff so the plush fibers blend seamlessly
 * into both light and dark backgrounds beneath liquid-glass cards without any solid gray border.
 * Centered and scaled generously to provide warm visual interest right in the center.
 */
export default function ZivisoArtisticBackground({ 
  offsetSidebar = true,
  className = '' 
}: ZivisoArtisticBackgroundProps) {
  return (
    <div 
      className={`fixed inset-0 pointer-events-none z-0 overflow-hidden select-none flex items-center justify-center ${
        offsetSidebar ? 'md:left-64' : 'left-0'
      } ${className}`}
      aria-hidden="true"
    >
      {/* Soft central ambient lilac-indigo aura behind the furry letters */}
      <div className="absolute w-[500px] sm:w-[750px] lg:w-[950px] h-[320px] sm:h-[450px] rounded-full bg-primary/12 dark:bg-primary/20 blur-[130px] pointer-events-none -z-10 animate-pulse duration-[8000ms]" />

      {/* Floating 3D Furry Z-I-V-I-S-O Composition */}
      <div className="relative flex items-center justify-center w-full px-4 sm:px-8 py-6 animate-float-slow">
        <img
          src="/ziviso-furry-letters.png"
          alt="ZIVISO Furry Letters"
          className="w-[92%] sm:w-[86%] max-w-[950px] lg:max-w-[1150px] xl:max-w-[1300px] h-auto object-contain select-none transition-all duration-700 opacity-40 sm:opacity-50 dark:opacity-60 drop-shadow-[0_20px_50px_rgba(92,103,242,0.30)] dark:drop-shadow-[0_25px_60px_rgba(129,140,248,0.40)] hover:scale-[1.02]"
          draggable={false}
        />
      </div>
    </div>
  );
}
