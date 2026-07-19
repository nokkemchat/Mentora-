import { useColorScheme } from 'react-native';

export const lightColors = {
  background: '#FAFAFA',
  text: '#121212', // Graphite text
  textSecondary: '#4A4A4A',
  textTertiary: '#8E8E8E',
  primary: '#CCFF00', // Lime Spark
  primaryLight: '#E6FF80', 
  accent: '#121212', // Graphite
  border: '#E0E0E0',
  surface: '#FFFFFF', 
  surfaceHighlight: '#F5F5F5',
  error: '#FF4D4D',
  success: '#10B981',
  warning: '#F59E0B',
};

export const darkColors = {
  background: '#121212', // Deep Graphite
  text: '#FFFFFF', 
  textSecondary: '#A0A0A0', 
  textTertiary: '#6E6E6E', 
  primary: '#CCFF00', // Lime Spark
  primaryLight: '#334000', // Dark tinted lime
  accent: '#CCFF00', 
  border: '#2A2A2A', // Light Graphite border
  surface: '#1A1A1A', // Graphite surface
  surfaceHighlight: '#222222', 
  error: '#FF6B6B',
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
