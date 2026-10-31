import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, Pressable, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { spacing, typography, borderRadius, useThemeColors } from '@/constants/theme';
import { Feather } from '@expo/vector-icons';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';

export default function BoardSelection() {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const router = useRouter();
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);

  const selectBoard = async (board: 'zimsec' | 'cambridge') => {
    if (loading) return;

    if (user) {
      setLoading(true);
      try {
        // 1. Update user metadata
        await supabase.auth.updateUser({
          data: {
            role: 'student',
            board: board,
          },
        });

        // 2. Ensure profile exists in profiles table
        await supabase.from('profiles').upsert(
          {
            id: user.id,
            role: 'student',
            first_name:
              user.user_metadata?.first_name ||
              user.user_metadata?.given_name ||
              user.user_metadata?.full_name?.split(' ')[0] ||
              null,
            last_name:
              user.user_metadata?.last_name ||
              user.user_metadata?.family_name ||
              user.user_metadata?.full_name?.split(' ').slice(1).join(' ') ||
              null,
            avatar_url: user.user_metadata?.avatar_url || user.user_metadata?.picture || null,
          },
          { onConflict: 'id' }
        );

        router.replace('/(auth)/complete-profile');
      } catch (err) {
        console.warn('Error setting student board:', err);
        router.replace('/(auth)/complete-profile');
      } finally {
        setLoading(false);
      }
    } else {
      router.push(`/auth?role=student&board=${board}`);
    }
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
        <Pressable
          style={[styles.optionCard, loading && styles.optionCardDisabled]}
          onPress={() => selectBoard('zimsec')}
          disabled={loading}
        >
          <View style={styles.iconContainer}>
            <Text style={styles.iconText}>🇿🇼</Text>
          </View>
          <View style={styles.optionTextContainer}>
            <Text style={styles.optionTitle}>ZIMSEC</Text>
            <Text style={styles.optionSubtitle}>Zimbabwe School Examinations Council</Text>
          </View>
          {loading ? (
            <ActivityIndicator size="small" color={colors.primary} />
          ) : (
            <Feather name="chevron-right" size={24} color={colors.textTertiary} />
          )}
        </Pressable>

        <Pressable
          style={[styles.optionCard, loading && styles.optionCardDisabled]}
          onPress={() => selectBoard('cambridge')}
          disabled={loading}
        >
          <View style={styles.iconContainer}>
            <Text style={styles.iconText}>🇬🇧</Text>
          </View>
          <View style={styles.optionTextContainer}>
            <Text style={styles.optionTitle}>Cambridge</Text>
            <Text style={styles.optionSubtitle}>Cambridge International Examinations</Text>
          </View>
          {loading ? (
            <ActivityIndicator size="small" color={colors.primary} />
          ) : (
            <Feather name="chevron-right" size={24} color={colors.textTertiary} />
          )}
        </Pressable>
      </View>
    </View>
  );
}

const createStyles = (colors: any) =>
  StyleSheet.create({
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
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: colors.surfaceHighlight || colors.surface,
      alignItems: 'center',
      justifyContent: 'center',
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
    optionCardDisabled: {
      opacity: 0.6,
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
