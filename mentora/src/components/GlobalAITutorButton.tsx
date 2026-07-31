import React from 'react';
import { Pressable, StyleSheet, Dimensions, Animated } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter, useSegments } from 'expo-router';
import { useThemeColors } from '@/constants/theme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export function GlobalAITutorButton() {
  const router = useRouter();
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const segments = useSegments();

  // Hide the button on the AI Tutor screen itself, and auth screens
  const hideButton = segments.includes('ai-tutor') || segments.includes('(auth)');

  if (hideButton) return null;

  return (
    <Pressable
      style={[
        styles.fab,
        {
          backgroundColor: colors.primary,
          bottom: insets.bottom + 90, // Above the tab bar
        },
      ]}
      onPress={() => router.push('/ai-tutor')}
    >
      <MaterialCommunityIcons name="robot-outline" size={32} color="#FFFFFF" />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fab: {
    position: 'absolute',
    right: 20,
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 5,
    elevation: 8,
    zIndex: 9999, // Ensure it floats above everything
  },
});
