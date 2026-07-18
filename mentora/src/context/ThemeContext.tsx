import React, { createContext, useContext, useState, useEffect } from 'react';
import { useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { lightColors, darkColors } from '@/constants/theme';

export type ThemePreference = 'system' | 'light' | 'dark';

type ThemeContextType = {
  themePreference: ThemePreference;
  setThemePreference: (pref: ThemePreference) => void;
  colors: typeof lightColors;
  isDark: boolean;
};

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const systemColorScheme = useColorScheme();
  const [themePreference, setThemePreferenceState] = useState<ThemePreference>('system');
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    // Load preference from storage on mount
    const loadTheme = async () => {
      try {
        const storedTheme = await AsyncStorage.getItem('@app_theme');
        if (storedTheme === 'light' || storedTheme === 'dark' || storedTheme === 'system') {
          setThemePreferenceState(storedTheme as ThemePreference);
        }
      } catch (e) {
        console.error('Failed to load theme preference', e);
      } finally {
        setIsReady(true);
      }
    };
    loadTheme();
  }, []);

  const setThemePreference = async (pref: ThemePreference) => {
    setThemePreferenceState(pref);
    try {
      await AsyncStorage.setItem('@app_theme', pref);
    } catch (e) {
      console.error('Failed to save theme preference', e);
    }
  };

  const isDark = 
    themePreference === 'dark' || 
    (themePreference === 'system' && systemColorScheme === 'dark');

  const colors = isDark ? darkColors : lightColors;

  // Don't render until theme is loaded to prevent flash of wrong colors
  if (!isReady) {
    return null;
  }

  return (
    <ThemeContext.Provider value={{ themePreference, setThemePreference, colors, isDark }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useAppTheme() {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useAppTheme must be used within a ThemeProvider');
  }
  return context;
}
