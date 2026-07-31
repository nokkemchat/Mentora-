import { useColorScheme } from 'react-native';

export const lightColors = {
  background: '#FFFFFF',
  text: '#0F172A',
  textSecondary: '#64748B',
  textTertiary: '#94A3B8',
  primary: '#4F46E5', // Deep Indigo
  primaryLight: '#E0E7FF', // Soft Indigo
  accent: '#F59E0B', // Amber
  primaryContrast: '#FFFFFF',
  border: '#F1F5F9',
  surface: '#F8FAFC', 
  surfaceHighlight: '#F1F5F9',
  error: '#EF4444',
  success: '#10B981',
  warning: '#F59E0B',
};

export const darkColors = {
  background: '#0F172A',
  text: '#F8FAFC', 
  textSecondary: '#94A3B8', 
  textTertiary: '#64748B', 
  primary: '#818CF8', // Light Indigo for dark mode
  primaryLight: '#1E1B4B', // Very Dark Indigo
  accent: '#F59E0B',
  primaryContrast: '#FFFFFF',
  border: '#1E293B', 
  surface: '#1E293B', 
  surfaceHighlight: '#334155', 
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
  sm: 4,
  md: 8,
  lg: 12,
  xl: 16,
  full: 9999,
};

export const shadows = {
  sm: {
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.02,
    shadowRadius: 2,
    elevation: 1,
  },
  md: {
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  lg: {
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 16,
    elevation: 4,
  }
};
