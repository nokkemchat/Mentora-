import React, { useEffect, useState, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import { spacing, typography, borderRadius, useThemeColors } from '@/constants/theme';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';

type Course = {
  id: string;
  title: string;
  board: string;
  level: string;
  icon: string;
  color: string;
};

export default function TeacherDashboard() {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const { user } = useAuth();
  const router = useRouter();
  
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;

    const fetchTeacherData = async () => {
      // First get the teacher_stats_id for this user
      const { data: statsData, error: statsError } = await supabase
        .from('teacher_stats')
        .select('id')
        .eq('teacher_id', user.id)
        .single();

      if (!statsError && statsData) {
        // Then fetch their courses
        const { data, error } = await supabase
          .from('teacher_courses')
          .select('*')
          .eq('teacher_stats_id', statsData.id);

        if (!error && data) {
          const formattedCourses = data.map((tc: any) => ({
            id: tc.id,
            title: tc.title || 'Untitled Course',
            board: 'ZIMSEC',
            level: 'A-Level',
            icon: 'book-open-variant',
            color: '#3B82F6',
            ...tc
          }));
          setCourses(formattedCourses);
        }
      }
      setLoading(false);
    };

    fetchTeacherData();
  }, [user]);

  // Render Loading State
  if (loading) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  // Render Dashboard
  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.greeting}>Welcome, {user?.user_metadata?.first_name || 'Teacher'}!</Text>
            <Text style={styles.subtitle}>Let's inspire some students today.</Text>
          </View>
          <View style={styles.avatarPlaceholder}>
            <Feather name="users" size={24} color={colors.primary} />
          </View>
        </View>

        {/* Stats Overview */}
        <View style={styles.statsContainer}>
          <View style={styles.statCard}>
            <Feather name="book" size={24} color={colors.primary} />
            <Text style={styles.statValue}>{courses.length}</Text>
            <Text style={styles.statLabel}>Published Courses</Text>
          </View>
        </View>

        {/* Active Courses List */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>My Courses</Text>
            <Pressable>
              <Text style={styles.seeAllText}>Manage</Text>
            </Pressable>
          </View>

          {courses.length === 0 ? (
            <View style={styles.emptyState}>
              <Feather name="inbox" size={48} color={colors.border} />
              <Text style={styles.emptyStateTitle}>No courses yet</Text>
              <Text style={styles.emptyStateSubtitle}>Create your first course to start teaching!</Text>
            </View>
          ) : (
            courses.map((course) => (
              <Pressable 
                key={course.id}
                style={styles.courseCard}
                onPress={() => router.push(`/course/${course.id}`)}
              >
                <View style={[styles.courseIconContainer, { backgroundColor: course.color }]}>
                  <MaterialCommunityIcons name={course.icon as any} size={32} color={colors.background} />
                </View>
                <View style={styles.courseInfo}>
                  <Text style={styles.courseSubject}>{course.board} • {course.level}</Text>
                  <Text style={styles.courseTopic}>{course.title}</Text>
                </View>
                <Feather name="edit-2" size={20} color={colors.textSecondary} />
              </Pressable>
            ))
          )}
        </View>

        {/* Upcoming Classes / Live Rooms */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Live Study Rooms</Text>
          <Pressable 
            style={styles.liveRoomCard}
            onPress={() => router.push('/rooms')}
          >
            <View style={styles.liveIconContainer}>
              <View style={styles.liveIndicator} />
              <Feather name="video" size={24} color={colors.error} />
            </View>
            <View style={styles.liveInfo}>
              <Text style={styles.liveTitle}>Host a Live Session</Text>
              <Text style={styles.liveSubtitle}>Jump into a study room and interact directly with your students.</Text>
            </View>
            <Feather name="arrow-right" size={20} color={colors.textSecondary} />
          </Pressable>
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}

const createStyles = (colors: any) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    padding: spacing.xl,
    paddingTop: spacing.xxxl,
    paddingBottom: 100,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xxl,
  },
  greeting: {
    fontSize: typography.sizes.xl,
    fontWeight: typography.weights.bold,
    color: colors.text,
  },
  subtitle: {
    fontSize: typography.sizes.sm,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  avatarPlaceholder: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statsContainer: {
    flexDirection: 'row',
    gap: spacing.md,
    marginBottom: spacing.xxl,
  },
  statCard: {
    flex: 1,
    backgroundColor: colors.surface,
    padding: spacing.lg,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  statValue: {
    fontSize: typography.sizes.xxl,
    fontWeight: typography.weights.bold,
    color: colors.text,
    marginVertical: spacing.xs,
  },
  statLabel: {
    fontSize: typography.sizes.xs,
    color: colors.textSecondary,
    fontWeight: typography.weights.medium,
  },
  section: {
    marginBottom: spacing.xxl,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  sectionTitle: {
    fontSize: typography.sizes.lg,
    fontWeight: typography.weights.semibold,
    color: colors.text,
  },
  seeAllText: {
    fontSize: typography.sizes.sm,
    fontWeight: typography.weights.medium,
    color: colors.primary,
  },
  courseCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  courseIconContainer: {
    width: 60,
    height: 60,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  courseInfo: {
    flex: 1,
  },
  courseSubject: {
    fontSize: typography.sizes.xs,
    color: colors.textSecondary,
    fontWeight: typography.weights.semibold,
    textTransform: 'uppercase',
  },
  courseTopic: {
    fontSize: typography.sizes.md,
    fontWeight: typography.weights.bold,
    color: colors.text,
    marginVertical: 4,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xxxl,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    borderStyle: 'dashed',
  },
  emptyStateTitle: {
    fontSize: typography.sizes.md,
    fontWeight: typography.weights.semibold,
    color: colors.text,
    marginTop: spacing.md,
  },
  emptyStateSubtitle: {
    fontSize: typography.sizes.sm,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: 4,
  },
  liveRoomCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    padding: spacing.lg,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  liveIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(239, 68, 68, 0.1)', // Light red
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
    position: 'relative',
  },
  liveIndicator: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: colors.error,
    borderWidth: 2,
    borderColor: colors.surface,
  },
  liveInfo: {
    flex: 1,
  },
  liveTitle: {
    fontSize: typography.sizes.md,
    fontWeight: typography.weights.bold,
    color: colors.text,
    marginBottom: 2,
  },
  liveSubtitle: {
    fontSize: typography.sizes.sm,
    color: colors.textSecondary,
  },
  input: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.md,
    padding: spacing.lg,
    color: colors.text,
  },
  primaryButton: {
    backgroundColor: colors.primary,
    paddingVertical: spacing.lg,
    borderRadius: borderRadius.md,
    alignItems: 'center',
  },
  primaryButtonText: {
    color: colors.background,
    fontSize: typography.sizes.md,
    fontWeight: typography.weights.semibold,
  },
});
