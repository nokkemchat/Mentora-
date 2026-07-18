import React, { useMemo } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { spacing, typography, borderRadius, useThemeColors } from '@/constants/theme';
import { Feather } from '@expo/vector-icons';

export default function BoardSelection() {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const router = useRouter();

  const selectBoard = (board: 'zimsec' | 'cambridge') => {
    router.push(`/auth?role=student&board=${board}`);
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <Feather name="arrow-left" size={24} color={colors.text} />
        </Pressable>
        <Text style={styles.title}>Select your Board</Text>
        <Text style={styles.subtitle}>Which curriculum are you studying?</Text>
      </View>

      <View style={styles.optionsContainer}>
        <Pressable style={styles.optionCard} onPress={() => selectBoard('zimsec')}>
          <View style={styles.iconContainer}>
            <Text style={styles.iconText}>🇿🇼</Text>
          </View>
          <View style={styles.optionTextContainer}>
            <Text style={styles.optionTitle}>ZIMSEC</Text>
            <Text style={styles.optionSubtitle}>Zimbabwe School Examinations Council</Text>
          </View>
          <Feather name="chevron-right" size={24} color={colors.textTertiary} />
        </Pressable>

        <Pressable style={styles.optionCard} onPress={() => selectBoard('cambridge')}>
          <View style={styles.iconContainer}>
            <Text style={styles.iconText}>🇬🇧</Text>
          </View>
          <View style={styles.optionTextContainer}>
            <Text style={styles.optionTitle}>Cambridge</Text>
            <Text style={styles.optionSubtitle}>Cambridge International Examinations</Text>
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
  iconText: {
    fontSize: 24,
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
