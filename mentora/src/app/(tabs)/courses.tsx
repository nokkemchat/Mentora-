import React, { useMemo, useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { spacing, typography, borderRadius, useThemeColors } from '@/constants/theme';
import { MaterialCommunityIcons } from '@expo/vector-icons';

type CourseType = {
  id: string;
  title: string;
  board: string;
  level: string;
  icon: string;
  color: string;
  topics: { id: string }[];
};

import { useAuth } from '@/context/AuthContext';

export default function CoursesScreen() {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const router = useRouter();
  const { user } = useAuth();
  const role = user?.user_metadata?.role;

  const [courses, setCourses] = useState<CourseType[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    async function fetchCourses() {
      if (!user) return;

      let allowedCourseTitles: string[] | null = null;

      // If they are a teacher, we only want to show courses they chose during setup
      if (role === 'teacher') {
        const { data: profileData } = await supabase
          .from('profiles')
          .select('subjects_taught')
          .eq('id', user.id)
          .single();

        allowedCourseTitles = profileData?.subjects_taught || [];
      }

      // If they are a teacher and have NO courses chosen, we can early return
      if (role === 'teacher' && allowedCourseTitles && allowedCourseTitles.length === 0) {
        setCourses([]);
        setLoading(false);
        return;
      }

      let query = supabase
        .from('courses')
        .select(`
          id, title, board, level, icon, color,
          topics (id)
        `);

      if (role === 'teacher' && allowedCourseTitles && allowedCourseTitles.length > 0) {
        query = query.in('title', allowedCourseTitles);
      }
      
      const { data, error } = await query;

      if (error) {
        console.error("Error fetching courses:", error);
        setErrorMsg(error.message);
      } else if (data) {
        setCourses(data as CourseType[]);
      }
      setLoading(false);
    }

    fetchCourses();
  }, [user, role]);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.headerTitle}>Explore Courses</Text>
      <Text style={styles.headerSubtitle}>Find subjects tailored to your syllabus</Text>

      {errorMsg ? (
        <Text style={{ color: 'red', marginTop: 20 }}>Error: {errorMsg}</Text>
      ) : loading ? (
        <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: spacing.xxl }} />
      ) : courses.length === 0 ? (
        <Text style={{ color: colors.textSecondary, marginTop: 20 }}>No courses found in the database.</Text>
      ) : (
        <View style={styles.grid}>
          {courses.map((course) => (
            <Pressable 
              key={course.id} 
              style={styles.card}
              onPress={() => router.push(`/course/${course.id}`)}
            >
              <View style={[styles.iconContainer, { backgroundColor: course.color }]}>
                <MaterialCommunityIcons name={course.icon as any} size={32} color={colors.background} />
              </View>
              <Text style={styles.courseTitle}>{course.title}</Text>
              <Text style={styles.courseMeta}>{course.board} • {course.level}</Text>
              <View style={styles.topicBadge}>
                <Text style={styles.topicBadgeText}>
                  {course.topics?.length || 0} Topics
                </Text>
              </View>
            </Pressable>
          ))}
        </View>
      )}
    </ScrollView>
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
  },
  headerTitle: {
    fontSize: typography.sizes.xxl,
    fontWeight: typography.weights.bold,
    color: colors.text,
  },
  headerSubtitle: {
    fontSize: typography.sizes.md,
    color: colors.textSecondary,
    marginBottom: spacing.xxl,
    marginTop: spacing.xs,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  card: {
    width: '47%', // Roughly half minus gap
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'flex-start',
  },
  iconContainer: {
    width: 56,
    height: 56,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  courseTitle: {
    fontSize: typography.sizes.lg,
    fontWeight: typography.weights.bold,
    color: colors.text,
    marginBottom: spacing.xs,
  },
  courseMeta: {
    fontSize: typography.sizes.xs,
    color: colors.textSecondary,
    fontWeight: typography.weights.medium,
    marginBottom: spacing.md,
  },
  topicBadge: {
    backgroundColor: colors.primaryLight,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.sm,
  },
  topicBadgeText: {
    fontSize: typography.sizes.xs,
    color: colors.primary,
    fontWeight: typography.weights.bold,
  },
});
