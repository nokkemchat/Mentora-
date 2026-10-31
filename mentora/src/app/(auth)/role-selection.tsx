import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, Pressable, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { spacing, typography, borderRadius, useThemeColors } from '@/constants/theme';
import { Feather } from '@expo/vector-icons';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';

export default function RoleSelection() {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const router = useRouter();
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);

  const selectRole = async (role: 'student' | 'teacher') => {
    if (loading) return;

    if (role === 'student') {
      // If user is already authenticated (e.g. signed in via Google first)
      if (user) {
        setLoading(true);
        try {
          await supabase.auth.updateUser({
            data: { role: 'student', role_selected: true },
          });
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
        } catch (e) {
          console.warn('Error setting student role:', e);
        } finally {
          setLoading(false);
        }
      }
      router.push('/(auth)/board-selection');
    } else {
      // Role is Teacher
      if (user) {
        setLoading(true);
        try {
          // 1. Update user metadata so AuthContext and Dashboard know they are a teacher
          await supabase.auth.updateUser({
            data: { role: 'teacher', role_selected: true },
          });

          // 2. Ensure profiles table reflects teacher role
          await supabase.from('profiles').upsert(
            {
              id: user.id,
              role: 'teacher',
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

          router.replace('/(auth)/complete-teacher-profile');
        } catch (err) {
          console.warn('Error assigning teacher role:', err);
          router.replace('/(auth)/complete-teacher-profile');
        } finally {
          setLoading(false);
        }
      } else {
        router.push('/auth?role=teacher');
      }
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
        <Pressable
          style={[styles.optionCard, loading && styles.optionCardDisabled]}
          onPress={() => selectRole('student')}
          disabled={loading}
        >
          <View style={styles.iconContainer}>
            <Feather name="user" size={32} color={colors.primary} />
          </View>
          <View style={styles.optionTextContainer}>
            <Text style={styles.optionTitle}>I am a Student</Text>
            <Text style={styles.optionSubtitle}>I want to learn, practice, and prepare for my exams.</Text>
          </View>
          {loading ? (
            <ActivityIndicator size="small" color={colors.primary} />
          ) : (
            <Feather name="chevron-right" size={24} color={colors.textTertiary} />
          )}
        </Pressable>

        <Pressable
          style={[styles.optionCard, loading && styles.optionCardDisabled]}
          onPress={() => selectRole('teacher')}
          disabled={loading}
        >
          <View style={styles.iconContainer}>
            <Feather name="users" size={32} color={colors.primary} />
          </View>
          <View style={styles.optionTextContainer}>
            <Text style={styles.optionTitle}>I am a Teacher</Text>
            <Text style={styles.optionSubtitle}>I want to upload past papers, mark questions, and teach.</Text>
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
