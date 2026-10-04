export const lightColors = {
  background: '#F8FAFC', // Luminous canvas
  text: '#0F172A',
  textSecondary: '#64748B',
  textTertiary: '#94A3B8',
  primary: '#2563EB', // Modern Vibrant Cobalt
  primaryLight: '#EEF2FF', // Soft Periwinkle
  secondary: '#64748B',
  card: '#FFFFFF',
  accent: '#F59E0B', // Amber
  primaryContrast: '#FFFFFF',
  border: '#EDF2F7',
  cardBorder: '#F1F5F9',
  surface: '#FFFFFF', 
  surfaceHighlight: '#F1F5F9',
  backgroundElement: '#F1F5F9',
  backgroundSelected: '#E2E8F0',
  error: '#EF4444',
  success: '#10B981',
  warning: '#F59E0B',
  tintPeriwinkle: '#EEF2FF',
  tintAmber: '#FEF3C7',
  tintEmerald: '#ECFDF5',
  tintRose: '#FFE4E6',
  brandCobalt: '#1D4ED8',
  brandBlue: '#2563EB',
};

export const darkColors = {
  background: '#0D0D0D', // ChatGPT true neutral dark canvas (rich OLED near-black)
  text: '#ECECEC', // Crisp high-contrast text
  textSecondary: '#A1A1AA', // Neutral light gray secondary
  textTertiary: '#71717A', // Muted neutral tertiary
  primary: '#3B82F6', // Vibrant modern blue
  primaryLight: '#212121', // Neutral dark elevated container
  secondary: '#A1A1AA',
  card: '#1E1E1E', // ChatGPT characteristic neutral charcoal card surface
  accent: '#F59E0B',
  primaryContrast: '#FFFFFF',
  border: '#2A2A2A', // Subtle neutral border
  cardBorder: '#262626', // Clean card outline
  surface: '#1E1E1E', // Main surface
  surfaceHighlight: '#2A2A2A', // Hover/press elevated highlight
  backgroundElement: '#181818', // Deep element background
  backgroundSelected: '#2F2F2F', // Selected item background
  error: '#EF4444',
  success: '#10B981',
  warning: '#F59E0B',
  tintPeriwinkle: '#262626',
  tintAmber: '#2A2215',
  tintEmerald: '#14291E',
  tintRose: '#2E151A',
  brandCobalt: '#3B82F6',
  brandBlue: '#60A5FA',
};

export type ThemeColor = keyof typeof lightColors;
