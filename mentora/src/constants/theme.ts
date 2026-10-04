import { useColorScheme } from 'react-native';
import { lightColors, darkColors, ThemeColor } from './themeColors';
export { lightColors, darkColors, ThemeColor };

import { useAppTheme } from '@/context/ThemeContext';

export function useThemeColors() {
  // Use the global theme context instead of just system settings
  try {
    const { colors } = useAppTheme();
    return colors;
  } catch (e) {
    // Fallback if used outside Provider
    return lightColors;
  }
}

// Fallback for non-React contexts if needed (will not auto-update)
export const colors = lightColors;
export const Colors = {
  light: lightColors,
  dark: darkColors,
};


export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
};

export const Spacing = {
  ...spacing,
  none: 0,
  half: 4,
  one: 8,
  two: 16,
  three: 24,
  four: 32,
  five: 40,
  six: 48,
  seven: 56,
  eight: 64,
};

export const MaxContentWidth = 1200;

export const typography = {
  sizes: {
    xs: 12,
    sm: 14,
    md: 16,
    lg: 18,
    xl: 20,
    xxl: 24,
    xxxl: 32,
  },
  weights: {
    regular: '400' as const,
    medium: '500' as const,
    semibold: '600' as const,
    bold: '700' as const,
  },
};

export const Fonts = {
  regular: 'Outfit_400Regular',
  medium: 'Outfit_500Medium',
  semiBold: 'Outfit_600SemiBold',
  bold: 'Outfit_700Bold',
  mono: 'monospace',
};

export const borderRadius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  card: 24,
  pill: 9999,
  round: 9999,
  full: 9999,
};

export const shadows = {
  sm: {
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 3,
    elevation: 1,
  },
  md: {
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  lg: {
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.07,
    shadowRadius: 16,
    elevation: 4,
  },
  tactile: {
    shadowColor: '#102A6B',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.07,
    shadowRadius: 14,
    elevation: 4,
  },
  floating: {
    shadowColor: '#102A6B',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.12,
    shadowRadius: 20,
    elevation: 8,
  },
};
