import React, { useMemo, useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, Image, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { spacing, typography, borderRadius, useThemeColors } from '@/constants/theme';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';

type Teacher = {
  id: string;
  first_name: string;
  last_name: string;
  subjects_taught: string[];
  bio: string;
  avatar_url: string | null;
  school: string | null;
  years_of_experience: number | null;
  employment_type: string | null;
  availability_schedule: string | null;
};

type Course = {
  id: string;
  title: string;
  board: string;
  level: string;
  icon: string;
  color: string;
  topics: { id: string }[];
};

export default function TeacherProfileScreen() {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuth();

  const [teacher, setTeacher] = useState<Teacher | null>(null);
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTeacher, setSelectedTeacher] = useState(false);

  useEffect(() => {
    if (!id) return;

    const fetchTeacher = async () => {
      // Fetch teacher profile
      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('id, first_name, last_name, subjects_taught, bio, avatar_url, school, years_of_experience, employment_type, availability_schedule')
        .eq('id', id)
        .single();

      if (!profileError && profileData) {
        setTeacher(profileData as Teacher);

        // Fetch courses that match teacher's subjects
        if (profileData.subjects_taught && profileData.subjects_taught.length > 0) {
          const { data: coursesData } = await supabase
            .from('courses')
            .select('id, title, board, level, icon, color, topics (id)')
            .in('title', profileData.subjects_taught.map((s: string) => s.trim()));

          if (coursesData) {
            setCourses(coursesData as Course[]);
          }
        }
      }

      setLoading(false);
    };

    fetchTeacher();
  }, [id]);

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (!teacher) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>Teacher not found.</Text>
        <Pressable onPress={() => router.back()} style={styles.actionButton}>
          <Text style={styles.actionButtonText}>Go Back</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      {/* Back Button */}
      <Pressable onPress={() => router.back()} style={styles.backNav}>
        <Ionicons name="arrow-back" size={24} color={colors.text} />
      </Pressable>

      {/* Profile Header */}
      <View style={styles.profileHeader}>
        {teacher.avatar_url ? (
          <Image source={{ uri: teacher.avatar_url }} style={styles.avatar} />
        ) : (
          <View style={styles.avatarFallback}>
            <Ionicons name="person" size={48} color={colors.primary} />
          </View>
        )}

        <Text style={styles.teacherName}>{teacher.first_name} {teacher.last_name}</Text>

        <View style={styles.verifiedRow}>
          <Ionicons name="checkmark-circle" size={18} color={colors.success} />
          <Text style={styles.verifiedText}>Verified Educator</Text>
        </View>

        {teacher.school && (
          <View style={styles.metaRow}>
            <Ionicons name="location-outline" size={16} color={colors.textSecondary} />
            <Text style={styles.metaText}>{teacher.school}</Text>
          </View>
        )}

        {teacher.years_of_experience && (
          <View style={styles.metaRow}>
            <Ionicons name="time-outline" size={16} color={colors.textSecondary} />
            <Text style={styles.metaText}>{teacher.years_of_experience} years experience</Text>
          </View>
        )}

        {teacher.employment_type && (
          <View style={styles.metaRow}>
            <Ionicons name="briefcase-outline" size={16} color={colors.textSecondary} />
            <Text style={styles.metaText}>{teacher.employment_type}</Text>
          </View>
        )}
      </View>

      {/* Bio Section */}
      {teacher.bio ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>About</Text>
          <View style={styles.bioCard}>
            <Text style={styles.bioText}>{teacher.bio}</Text>
          </View>
        </View>
      ) : null}

      {/* Subjects Section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Subjects</Text>
        <View style={styles.subjectChips}>
          {teacher.subjects_taught?.map((subject, idx) => (
            <View key={idx} style={styles.subjectChip}>
              <Ionicons name="book" size={14} color={colors.primary} style={{ marginRight: 6 }} />
              <Text style={styles.subjectChipText}>{subject.trim()}</Text>
            </View>
          ))}
        </View>
      </View>

      {/* Courses by this Teacher */}
      {courses.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Courses</Text>
          {courses.map((course) => (
            <Pressable
              key={course.id}
              style={styles.courseCard}
              onPress={() => router.push(`/course/${course.id}`)}
            >
              <View style={[styles.courseIcon, { backgroundColor: course.color }]}>
                <MaterialCommunityIcons name={course.icon as any} size={28} color={colors.background} />
              </View>
              <View style={styles.courseInfo}>
                <Text style={styles.courseTitle}>{course.title}</Text>
                <Text style={styles.courseMeta}>{course.board} • {course.level}</Text>
                <Text style={styles.courseTopic}>{course.topics?.length || 0} Topics</Text>
              </View>
              <Ionicons name="chevron-forward" size={22} color={colors.textTertiary} />
            </Pressable>
          ))}
        </View>
      )}

      {/* Select Teacher Button */}
      <Pressable
        style={[styles.selectButton, selectedTeacher && styles.selectButtonSelected]}
        onPress={() => setSelectedTeacher(!selectedTeacher)}
      >
        <Ionicons
          name={selectedTeacher ? 'checkmark-circle' : 'add-circle-outline'}
          size={22}
          color={selectedTeacher ? '#FFFFFF' : colors.primary}
          style={{ marginRight: spacing.sm }}
        />
        <Text style={[styles.selectButtonText, selectedTeacher && styles.selectButtonTextSelected]}>
          {selectedTeacher ? 'Following this Teacher' : 'Follow this Teacher'}
        </Text>
      </Pressable>

    </ScrollView>
  );
}

const createStyles = (colors: any) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
  },
  content: {
    padding: spacing.xl,
    paddingTop: spacing.xxxl,
    paddingBottom: 100,
  },
  backNav: {
    marginBottom: spacing.lg,
  },

  // Profile Header
  profileHeader: {
    alignItems: 'center',
    marginBottom: spacing.xxl,
  },
  avatar: {
    width: 100,
    height: 100,
    borderRadius: 50,
    marginBottom: spacing.md,
  },
  avatarFallback: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  teacherName: {
    fontSize: typography.sizes.xxl,
    fontWeight: typography.weights.bold,
    fontFamily: 'Outfit_700Bold',
    color: colors.text,
    marginBottom: spacing.xs,
  },
  verifiedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: spacing.md,
  },
  verifiedText: {
    fontSize: typography.sizes.sm,
    fontFamily: 'Outfit_500Medium',
    color: colors.success,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: spacing.xs,
  },
  metaText: {
    fontSize: typography.sizes.sm,
    fontFamily: 'Outfit_400Regular',
    color: colors.textSecondary,
  },

  // Sections
  section: {
    marginBottom: spacing.xl,
  },
  sectionTitle: {
    fontSize: typography.sizes.lg,
    fontWeight: typography.weights.semibold,
    fontFamily: 'Outfit_600SemiBold',
    color: colors.text,
    marginBottom: spacing.md,
  },

  // Bio
  bioCard: {
    backgroundColor: colors.surface,
    padding: spacing.lg,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  bioText: {
    fontSize: typography.sizes.md,
    fontFamily: 'Outfit_400Regular',
    color: colors.text,
    lineHeight: 24,
  },

  // Subjects
  subjectChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  subjectChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primaryLight,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.full,
  },
  subjectChipText: {
    fontSize: typography.sizes.sm,
    fontFamily: 'Outfit_500Medium',
    color: colors.primary,
    fontWeight: typography.weights.medium,
  },

  // Courses
  courseCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    padding: spacing.lg,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.md,
  },
  courseIcon: {
    width: 52,
    height: 52,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  courseInfo: {
    flex: 1,
  },
  courseTitle: {
    fontSize: typography.sizes.md,
    fontWeight: typography.weights.bold,
    fontFamily: 'Outfit_600SemiBold',
    color: colors.text,
  },
  courseMeta: {
    fontSize: typography.sizes.xs,
    fontFamily: 'Outfit_400Regular',
    color: colors.textSecondary,
    marginTop: 2,
  },
  courseTopic: {
    fontSize: typography.sizes.xs,
    fontFamily: 'Outfit_500Medium',
    color: colors.primary,
    marginTop: 4,
  },

  // Select Button
  selectButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
    borderRadius: borderRadius.full,
    borderWidth: 2,
    borderColor: colors.primary,
    backgroundColor: colors.background,
    marginBottom: spacing.xxl,
  },
  selectButtonSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  selectButtonText: {
    fontSize: typography.sizes.md,
    fontWeight: typography.weights.semibold,
    fontFamily: 'Outfit_600SemiBold',
    color: colors.primary,
  },
  selectButtonTextSelected: {
    color: '#FFFFFF',
  },

  // Error
  errorText: {
    fontSize: typography.sizes.lg,
    color: colors.error,
    marginBottom: spacing.md,
  },
  actionButton: {
    padding: spacing.md,
    backgroundColor: colors.primary,
    borderRadius: borderRadius.md,
  },
  actionButtonText: {
    color: '#FFFFFF',
    fontWeight: typography.weights.bold,
  },
});
