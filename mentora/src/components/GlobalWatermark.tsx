import React from 'react';
import { View, Image } from 'react-native';
import { useThemeColors } from '../constants/theme';

export function GlobalWatermark() {
  const colors = useThemeColors();
  
  return (
    <View 
      style={{ 
        position: 'absolute', 
        top: 0, left: 0, right: 0, bottom: 0, 
        alignItems: 'center', 
        justifyContent: 'center', 
        pointerEvents: 'none', 
        opacity: 0.4, 
        zIndex: 0 
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
