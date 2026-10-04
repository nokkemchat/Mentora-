/**
 * Subject visual helpers to ensure vibrant, high-contrast colors and icons across
 * both light and dark themes, sanitizing legacy Tailwind class strings (e.g. 'bg-blue-500')
 * into valid React Native hex colors.
 */

export const TAILWIND_COLOR_MAP: Record<string, string> = {
  'bg-blue-500': '#2563EB',
  'bg-blue-600': '#1D4ED8',
  'bg-sky-500': '#0284C7',
  'bg-sky-600': '#0369A1',
  'bg-emerald-500': '#10B981',
  'bg-emerald-600': '#059669',
  'bg-green-500': '#22C55E',
  'bg-amber-500': '#F59E0B',
  'bg-amber-600': '#D97706',
  'bg-yellow-500': '#EAB308',
  'bg-purple-500': '#8B5CF6',
  'bg-purple-600': '#7C3AED',
  'bg-indigo-500': '#6366F1',
  'bg-indigo-600': '#4F46E5',
  'bg-rose-500': '#F43F5E',
  'bg-rose-600': '#E11D48',
  'bg-pink-500': '#EC4899',
  'bg-cyan-500': '#06B6D4',
  'bg-teal-500': '#14B8A6',
  'bg-orange-500': '#F97316',
};

export const SUBJECT_METADATA_MAP: Record<string, { color: string; icon: string }> = {
  chemistry: { color: '#0D9488', icon: 'flask' },
  physics: { color: '#6366F1', icon: 'atom' },
  mathematics: { color: '#2563EB', icon: 'calculator-variant' },
  maths: { color: '#2563EB', icon: 'calculator-variant' },
  math: { color: '#2563EB', icon: 'calculator-variant' },
  biology: { color: '#10B981', icon: 'leaf' },
  science: { color: '#0D9488', icon: 'flask-outline' },
  english: { color: '#D97706', icon: 'book-open-page-variant' },
  geography: { color: '#059669', icon: 'earth' },
  commerce: { color: '#8B5CF6', icon: 'finance' },
  business: { color: '#8B5CF6', icon: 'finance' },
  accounting: { color: '#0D9488', icon: 'calculator' },
  economics: { color: '#0284C7', icon: 'chart-line' },
  history: { color: '#EA580C', icon: 'feather' },
  computer: { color: '#4F46E5', icon: 'laptop' },
  computing: { color: '#4F46E5', icon: 'laptop' },
  ict: { color: '#4F46E5', icon: 'laptop' },
  agriculture: { color: '#16A34A', icon: 'sprout' },
  heritage: { color: '#B45309', icon: 'castle' },
  french: { color: '#3B82F6', icon: 'translate' },
  shona: { color: '#059669', icon: 'book-open-variant' },
  ndebele: { color: '#7C3AED', icon: 'book-open-variant' },
};

/**
 * Normalizes subject color and icon into valid, vibrant hex color and clear icon name.
 */
export function getSubjectVisuals(title?: string, rawColor?: string, rawIcon?: string): { color: string; icon: string } {
  const normTitle = (title || '').trim().toLowerCase();

  // Find matching subject metadata preset if any
  let matchedPreset: { color: string; icon: string } | undefined;
  for (const [key, preset] of Object.entries(SUBJECT_METADATA_MAP)) {
    if (normTitle.includes(key)) {
      matchedPreset = preset;
      break;
    }
  }

  // 1. Resolve Color: Prioritize distinct preset color over generic default blue
  let resolvedColor = '#334155';
  if (matchedPreset) {
    resolvedColor = matchedPreset.color;
  } else if (rawColor && (rawColor.startsWith('#') || rawColor.startsWith('rgb'))) {
    resolvedColor = rawColor.trim();
  } else if (rawColor && TAILWIND_COLOR_MAP[rawColor.trim()]) {
    resolvedColor = TAILWIND_COLOR_MAP[rawColor.trim()];
  }

  // 2. Resolve Icon
  let resolvedIcon = 'book-open-variant';
  if (rawIcon && rawIcon !== 'book-open-variant' && rawIcon !== 'flask') {
    resolvedIcon = rawIcon.trim();
  } else if (matchedPreset) {
    resolvedIcon = matchedPreset.icon;
  } else if (rawIcon) {
    resolvedIcon = rawIcon.trim();
  }

  return {
    color: resolvedColor,
    icon: resolvedIcon,
  };
}
