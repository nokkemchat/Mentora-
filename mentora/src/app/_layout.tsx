import { usePreventScreenCapture } from 'expo-screen-capture';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { useFonts, Outfit_300Light, Outfit_400Regular, Outfit_500Medium, Outfit_600SemiBold, Outfit_700Bold } from '@expo-google-fonts/outfit';
import { StatusBar } from 'expo-status-bar';
import { View, Image } from 'react-native';
import { AuthProvider } from '../context/AuthContext';
import { ThemeProvider } from '../context/ThemeContext';
import { useThemeColors } from '../constants/theme';



SplashScreen.preventAutoHideAsync();

function GlobalWatermark() {
  const colors = useThemeColors();
  
  return (
    <View 
      style={{ 
        position: 'absolute', 
        top: 0, left: 0, right: 0, bottom: 0, 
        alignItems: 'center', 
        justifyContent: 'center', 
        pointerEvents: 'none', 
        opacity: 0.1, 
        zIndex: 999 
      }}
      pointerEvents="none"
    >
      <Image 
        source={require('../../assets/images/logo.png')} 
        style={{ 
          width: 600, 
          height: 600, 
          resizeMode: 'contain',
          tintColor: colors.text
        }} 
      />
    </View>
  );
}

function AppContent() {
  return (
    <View style={{ flex: 1 }}>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="index" />
      </Stack>
      
      <GlobalWatermark />
    </View>
  );
}

export default function RootLayout() {
  usePreventScreenCapture();

  const [loaded, error] = useFonts({
    Outfit_300Light,
    Outfit_400Regular,
    Outfit_500Medium,
    Outfit_600SemiBold,
    Outfit_700Bold,
  });

  useEffect(() => {
    if (loaded || error) {
      // Hide the native splash screen immediately when fonts load.
      // Our AnimatedSplashScreen in AppContent will seamlessly take over.
      SplashScreen.hideAsync();
    }
  }, [loaded, error]);

  if (!loaded && !error) {
    return null;
  }

  return (
    <ThemeProvider>
      <AuthProvider>
        <StatusBar style="auto" />
        <AppContent />
      </AuthProvider>
    </ThemeProvider>
  );
}
