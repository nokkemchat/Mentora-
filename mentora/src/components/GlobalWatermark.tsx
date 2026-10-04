import React from 'react';
import { View, ImageBackground } from 'react-native';
import { useAppTheme } from '../context/ThemeContext';

export function GlobalWatermark() {
  const { isDark } = useAppTheme();
  
  // In ChatGPT dark mode, keep the canvas pure, sleek, and distraction-free
  if (isDark) return null;
  
  return (
    <View 
      style={{ 
        position: 'absolute', 
        top: 0, left: 0, right: 0, bottom: 0, 
        pointerEvents: 'none', 
        opacity: 0.06, 
        zIndex: 0 
      }}
      pointerEvents="none"
    >
      <ImageBackground 
        source={require('../../assets/images/school_doodle_pattern.png')} 
        style={{ width: '100%', height: '100%' }} 
        imageStyle={{ resizeMode: 'repeat' }}
      />
    </View>
  );
}
