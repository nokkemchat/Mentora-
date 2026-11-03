import React from 'react';

interface ZivisoArtisticBackgroundProps {
  offsetSidebar?: boolean;
  className?: string;
}

/**
 * ZivisoArtisticBackground
 * 
 * Displays large, spread-out 3D plush furry letters spelling Z-I-V-I-S-O
 * floating gracefully across the center canvas.
 * 
 * Rendered with 100% transparent edges and enhanced opacity/scale so the soft,
 * vibrant furry fibers are clearly visible through the translucent liquid-glass
 * forefront cards in both light and dark mode.
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
      {/* Rich ambient lilac-periwinkle aura glowing behind the letters */}
      <div className="absolute w-[90%] max-w-[1200px] h-[380px] sm:h-[500px] rounded-full bg-primary/20 dark:bg-primary/30 blur-[140px] pointer-events-none -z-10 animate-pulse duration-[8000ms]" />

      {/* Spaced-Out, Bigger 3D Furry Z-I-V-I-S-O Composition */}
      <div className="relative flex items-center justify-center w-full px-2 sm:px-6 py-4 animate-float-slow">
        <img
          src="/ziviso-furry-letters.png"
          alt="ZIVISO Furry Letters"
          className="w-[98%] sm:w-[94%] max-w-[1150px] lg:max-w-[1400px] xl:max-w-[1650px] h-auto object-contain select-none transition-all duration-700 opacity-60 sm:opacity-70 dark:opacity-80 drop-shadow-[0_25px_60px_rgba(92,103,242,0.40)] dark:drop-shadow-[0_30px_70px_rgba(129,140,248,0.50)]"
          draggable={false}
        />
      </div>
    </div>
  );
}
