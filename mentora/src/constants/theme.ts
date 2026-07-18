import { useColorScheme } from 'react-native';

export const lightColors = {
  background: '#FFFFFF',
  text: '#0F172A', 
  textSecondary: '#4B5563',
  textTertiary: '#9CA3AF',
  primary: '#0B0F19', // Navy
  primaryLight: '#1E3A8A', 
  accent: '#0B0F19', 
  border: '#E5E7EB',
  surface: '#F8FAFC', 
  surfaceHighlight: '#F1F5F9',
  error: '#EF4444',
  success: '#10B981',
  warning: '#F59E0B',
};

export const darkColors = {
  background: '#0B0F19', // Navy
  text: '#F8FAFC', 
  textSecondary: '#94A3B8', 
  textTertiary: '#64748B', 
  primary: '#3B82F6', // Blue-500
  primaryLight: '#1E3A8A', // Deep Blue
  accent: '#3B82F6', 
  border: '#1E293B', 
  surface: '#0F172A', 
  surfaceHighlight: '#1E293B', 
  error: '#F87171',
  success: '#34D399',
  warning: '#FBBF24',
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
    shadowColor: 'transparent',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0,
    shadowRadius: 0,
    elevation: 0,
  },
  md: {
    shadowColor: 'transparent',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0,
    shadowRadius: 0,
    elevation: 0,
  },
};
