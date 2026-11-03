import React from 'react';

/**
 * ZivisoArtisticBackground
 * 
 * Renders an artistic, unorderly constellation of the letters Z-I-V-I-S-O
 * scattered across the background with organic tilts, varied depths, and gentle
 * falling / floating kinetic animations.
 * 
 * 100% transparent vector typography with zero solid image borders, seamlessly
 * blending into both Light and Dark mode forefronts beneath the liquid-glass cards.
 */
export default function ZivisoArtisticBackground() {
  const letters = [
    {
      char: 'Z',
      className: 'top-[-2%] right-[4%] md:right-[8%]',
      size: 'text-[150px] sm:text-[220px] md:text-[300px] lg:text-[360px]',
      rotation: '-rotate-[14deg]',
      animation: 'animate-float-slow',
      delay: '0s',
      opacity: 'opacity-20 dark:opacity-30',
      blur: 'blur-[0.5px]',
      gradient: 'from-primary via-indigo-400 to-purple-400',
    },
    {
      char: 'I',
      className: 'top-[12%] left-[18%] md:left-[24%]',
      size: 'text-[110px] sm:text-[150px] md:text-[200px] lg:text-[240px]',
      rotation: 'rotate-[24deg]',
      animation: 'animate-drift-fall',
      delay: '1.2s',
      opacity: 'opacity-15 dark:opacity-25',
      blur: 'blur-none',
      gradient: 'from-blue-400 via-primaryLight to-indigo-500',
    },
    {
      char: 'V',
      className: 'top-[36%] left-[2%] md:left-[5%]',
      size: 'text-[130px] sm:text-[180px] md:text-[250px] lg:text-[300px]',
      rotation: '-rotate-[22deg]',
      animation: 'animate-float-slow',
      delay: '2.5s',
      opacity: 'opacity-18 dark:opacity-28',
      blur: 'blur-[1px]',
      gradient: 'from-indigo-500 via-primary to-purple-500',
    },
    {
      char: 'I',
      className: 'top-[42%] right-[12%] md:right-[18%]',
      size: 'text-[90px] sm:text-[130px] md:text-[170px] lg:text-[210px]',
      rotation: '-rotate-[10deg]',
      animation: 'animate-drift-fall',
      delay: '3.8s',
      opacity: 'opacity-15 dark:opacity-22',
      blur: 'blur-none',
      gradient: 'from-purple-400 via-primaryLight to-blue-400',
    },
    {
      char: 'S',
      className: 'bottom-[14%] left-[26%] md:left-[35%]',
      size: 'text-[140px] sm:text-[200px] md:text-[270px] lg:text-[320px]',
      rotation: 'rotate-[18deg]',
      animation: 'animate-drift-fall',
      delay: '0.8s',
      opacity: 'opacity-20 dark:opacity-30',
      blur: 'blur-[0.5px]',
      gradient: 'from-primaryLight via-indigo-500 to-purple-400',
    },
    {
      char: 'O',
      className: 'bottom-[-2%] right-[2%] md:right-[6%]',
      size: 'text-[130px] sm:text-[190px] md:text-[250px] lg:text-[310px]',
      rotation: '-rotate-[15deg]',
      animation: 'animate-float-slow',
      delay: '2.1s',
      opacity: 'opacity-18 dark:opacity-25',
      blur: 'blur-[1px]',
      gradient: 'from-blue-500 via-primary to-indigo-400',
    },
    // Extra artistic scattered falling accents
    {
      char: 'Z',
      className: 'bottom-[8%] left-[4%]',
      size: 'text-[80px] sm:text-[110px] md:text-[140px]',
      rotation: 'rotate-[32deg]',
      animation: 'animate-drift-fall',
      delay: '4.2s',
      opacity: 'opacity-12 dark:opacity-20',
      blur: 'blur-[1.5px]',
      gradient: 'from-primary via-blue-400 to-indigo-500',
    },
    {
      char: 'O',
      className: 'top-[4%] left-[3%]',
      size: 'text-[70px] sm:text-[95px] md:text-[120px]',
      rotation: '-rotate-[20deg]',
      animation: 'animate-float-slow',
      delay: '3.1s',
      opacity: 'opacity-10 dark:opacity-18',
      blur: 'blur-[2px]',
      gradient: 'from-purple-500 via-primaryLight to-blue-400',
    },
  ];

  return (
    <div 
      className="fixed inset-0 pointer-events-none z-0 overflow-hidden select-none"
      aria-hidden="true"
    >
      {letters.map((item, idx) => (
        <span
          key={`${item.char}-${idx}`}
          style={{ animationDelay: item.delay }}
          className={`absolute font-black tracking-tighter leading-none select-none transition-all duration-700 ${item.className} ${item.size} ${item.rotation} ${item.animation} ${item.opacity} ${item.blur}`}
        >
          <span 
            className={`bg-gradient-to-br ${item.gradient} bg-clip-text text-transparent drop-shadow-[0_12px_24px_rgba(92,103,242,0.22)] block`}
            style={{ fontFamily: "'Outfit', ui-sans-serif, system-ui, sans-serif" }}
          >
            {item.char}
          </span>
        </span>
      ))}
    </div>
  );
}
