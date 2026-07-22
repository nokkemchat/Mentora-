import React from 'react';
import { View, ImageBackground } from 'react-native';
import { useThemeColors } from '../constants/theme';

export function GlobalWatermark() {
  const colors = useThemeColors();
  
  return (
    <View 
      style={{ 
        position: 'absolute', 
        top: 0, left: 0, right: 0, bottom: 0, 
        pointerEvents: 'none', 
        opacity: colors.background === '#F8FAFC' ? 0.08 : 0.05, // Slightly higher opacity in light mode
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
