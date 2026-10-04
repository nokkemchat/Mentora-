import React from 'react';
import { Pressable, StyleSheet, Dimensions, Animated } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter, useSegments } from 'expo-router';
import { useThemeColors } from '@/constants/theme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export function GlobalAITutorButton() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const segments = useSegments() as unknown as string[];

  // Hide the button on the AI Tutor screen itself, auth screens, question papers, document viewer, course, topic, and quiz screens
  const hideButton = 
    segments.includes('ai-tutor') || 
    segments.includes('(auth)') || 
    segments.includes('papers') ||
    segments.includes('viewer') ||
    segments.includes('course') ||
    segments.includes('topic') ||
    segments.includes('quiz');

  if (hideButton) return null;

  return (
    <Pressable
      style={({ pressed }) => [
        styles.fab,
        {
          bottom: insets.bottom + 84,
        },
        pressed && { transform: [{ scale: 0.94 }], opacity: 0.9 },
      ]}
      onPress={() => router.push('/ai-tutor')}
    >
      <MaterialCommunityIcons name="robot-outline" size={24} color="#FFFFFF" />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fab: {
    position: 'absolute',
    right: 20,
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#0F172A',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 6,
    zIndex: 9999,
  },
});
