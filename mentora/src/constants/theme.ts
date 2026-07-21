import { useColorScheme } from 'react-native';

export const lightColors = {
  background: '#F8FAFC',
  text: '#111827',
  textSecondary: '#6B7280',
  textTertiary: '#9CA3AF',
  primary: '#1E3A8A', // Navy Blue
  primaryLight: '#60A5FA', // Sky Blue
  accent: '#FBBF24', // Gold
  primaryContrast: '#1E3A8A', // Used for text on primaryLight bg
  border: '#E5E7EB',
  surface: '#FFFFFF', 
  surfaceHighlight: '#F8FAFC',
  error: '#EF4444',
  success: '#10B981',
  warning: '#F59E0B',
};

export const darkColors = {
  background: '#09090B',
  text: '#FAFAFA', 
  textSecondary: '#D4D4D8', 
  textTertiary: '#A1A1AA', 
  primary: '#60A5FA', // Sky Blue for readability on dark
  primaryLight: '#1E3A8A', // Navy Blue
  accent: '#60A5FA', // Sky Blue
  primaryContrast: '#FAFAFA', // White text on Navy pill
  border: '#3F3F46', 
  surface: '#18181B', 
  surfaceHighlight: '#27272A', 
  error: '#EF4444',
  success: '#10B981',
  warning: '#F59E0B',
};

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

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
};

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

export const borderRadius = {
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  full: 9999,
};

export const shadows = {
  sm: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  md: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 4,
  },
};
