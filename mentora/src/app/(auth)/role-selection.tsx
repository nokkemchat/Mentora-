import React, { useMemo } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { spacing, typography, borderRadius, useThemeColors } from '@/constants/theme';
import { Feather } from '@expo/vector-icons';

export default function RoleSelection() {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const router = useRouter();

  const selectRole = (role: 'student' | 'teacher') => {
    if (role === 'student') {
      router.push('/(auth)/board-selection');
    } else {
      router.push('/auth?role=teacher');
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <Feather name="arrow-left" size={24} color={colors.text} />
        </Pressable>
        <Text style={styles.title}>Who are you?</Text>
        <Text style={styles.subtitle}>Choose your role to personalize your experience.</Text>
      </View>

      <View style={styles.optionsContainer}>
        <Pressable style={styles.optionCard} onPress={() => selectRole('student')}>
          <View style={styles.iconContainer}>
            <Feather name="user" size={32} color={colors.primary} />
          </View>
          <View style={styles.optionTextContainer}>
            <Text style={styles.optionTitle}>I am a Student</Text>
            <Text style={styles.optionSubtitle}>I want to learn, practice, and prepare for my exams.</Text>
          </View>
          <Feather name="chevron-right" size={24} color={colors.textTertiary} />
        </Pressable>

        <Pressable style={styles.optionCard} onPress={() => selectRole('teacher')}>
          <View style={styles.iconContainer}>
            <Feather name="users" size={32} color={colors.primary} />
          </View>
          <View style={styles.optionTextContainer}>
            <Text style={styles.optionTitle}>I am a Teacher</Text>
            <Text style={styles.optionSubtitle}>I want to create courses and educate students.</Text>
          </View>
          <Feather name="chevron-right" size={24} color={colors.textTertiary} />
        </Pressable>
      </View>
    </View>
  );
}

const createStyles = (colors: any) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    padding: spacing.xl,
  },
  header: {
    marginTop: spacing.xxxl,
    marginBottom: spacing.xxl,
  },
  backButton: {
    marginBottom: spacing.lg,
  },
  title: {
    fontSize: typography.sizes.xxl,
    fontWeight: typography.weights.bold,
    color: colors.text,
    marginBottom: spacing.xs,
  },
  subtitle: {
    fontSize: typography.sizes.md,
    color: colors.textSecondary,
  },
  optionsContainer: {
    flex: 1,
  },
  optionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    padding: spacing.lg,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.md,
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: borderRadius.full,
    backgroundColor: colors.surfaceHighlight,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.md,
  },
  optionTextContainer: {
    flex: 1,
  },
  optionTitle: {
    fontSize: typography.sizes.md,
    fontWeight: typography.weights.semibold,
    color: colors.text,
  },
  optionSubtitle: {
    fontSize: typography.sizes.sm,
    color: colors.textSecondary,
    marginTop: 4,
  },
});
