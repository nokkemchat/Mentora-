import React, { useEffect, useState, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, Image, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import { spacing, typography, borderRadius, useThemeColors } from '@/constants/theme';
import { Feather, Ionicons } from '@expo/vector-icons';

type Teacher = {
  id: string;
  first_name: string;
  last_name: string;
  subjects_taught: string[];
  bio: string;
  avatar_url: string | null;
  school: string | null;
};

export default function StudentDashboard() {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const { user } = useAuth();
  const router = useRouter();
  const [schoolmatesCount, setSchoolmatesCount] = useState<number | null>(null);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [loadingTeachers, setLoadingTeachers] = useState(true);

  useEffect(() => {
    if (user?.user_metadata?.school) {
      const fetchSchoolmates = async () => {
        const { data, error } = await supabase.rpc('get_school_count', { 
          school_name: user.user_metadata.school 
        });
        
        if (!error && data !== null) {
          setSchoolmatesCount(data as number);
        }
      };
      fetchSchoolmates();
    }
  }, [user]);

  useEffect(() => {
    const fetchTeachers = async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, first_name, last_name, subjects_taught, bio, avatar_url, school')
        .eq('role', 'teacher')
        .eq('is_approved', true)
        .eq('is_activated', true);

      if (!error && data) {
        setTeachers(data as Teacher[]);
      }
      setLoadingTeachers(false);
    };

    fetchTeachers();
  }, []);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>Hello, {user?.user_metadata?.first_name || 'Student'}!</Text>
          <Text style={styles.subtitle}>Ready to crush your goals today?</Text>
        </View>
        <View style={styles.avatarPlaceholder}>
          <Ionicons name="person" size={24} color={colors.primary} />
        </View>
      </View>

      {/* Community Callout */}
      {user?.user_metadata?.school && (
        <View style={styles.communityCard}>
          <View style={styles.communityIconContainer}>
            <Ionicons name="people" size={24} color={colors.background} />
          </View>
          <View style={styles.communityInfo}>
            <Text style={styles.communityTitle}>
              {schoolmatesCount !== null ? schoolmatesCount : '...'} Students
            </Text>
            <Text style={styles.communitySubtitle}>
              from {user.user_metadata.school} are here
            </Text>
          </View>
        </View>
      )}

      {/* Career Hub Banner */}
      <Pressable 
        style={styles.careerHubCard}
        onPress={() => router.push('/careers/hub')}
      >
        <View style={styles.careerHubInfo}>
          <Text style={styles.careerHubTitle}>Career Hub 🎓</Text>
          <Text style={styles.careerHubSubtitle}>Explore universities, scholarships, and plan your future roadmap.</Text>
        </View>
        <Ionicons name="arrow-forward-circle" size={28} color={colors.background} />
      </Pressable>

      {/* Available Teachers Section */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Ionicons name="school" size={22} color={colors.primary} />
          <Text style={styles.sectionTitle}>Available Teachers</Text>
        </View>

        {loadingTeachers ? (
          <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: spacing.xl }} />
        ) : teachers.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="person-add-outline" size={48} color={colors.border} />
            <Text style={styles.emptyTitle}>No teachers yet</Text>
            <Text style={styles.emptySubtitle}>Teachers will appear here once they've been approved.</Text>
          </View>
        ) : (
          teachers.map((teacher) => (
            <Pressable 
              key={teacher.id} 
              style={styles.teacherCard}
              onPress={() => router.push(`/teacher/${teacher.id}`)}
            >
              <View style={styles.teacherHeader}>
                {teacher.avatar_url ? (
                  <Image source={{ uri: teacher.avatar_url }} style={styles.teacherAvatar} />
                ) : (
                  <View style={styles.teacherAvatarFallback}>
                    <Ionicons name="person" size={28} color={colors.primary} />
                  </View>
                )}
                <View style={styles.teacherInfo}>
                  <Text style={styles.teacherName}>
                    {teacher.first_name} {teacher.last_name}
                  </Text>
                  {teacher.school && (
                    <View style={styles.teacherMeta}>
                      <Ionicons name="location-outline" size={14} color={colors.textSecondary} />
                      <Text style={styles.teacherSchool}>{teacher.school}</Text>
                    </View>
                  )}
                </View>
                <Ionicons name="chevron-forward" size={22} color={colors.textTertiary} />
              </View>

              {teacher.bio ? (
                <Text style={styles.teacherBio}>{teacher.bio}</Text>
              ) : null}

              <View style={styles.subjectsRow}>
                <Text style={styles.subjectsLabel}>Subjects</Text>
                <View style={styles.subjectChips}>
                  {teacher.subjects_taught?.map((subject, idx) => (
                    <View key={idx} style={styles.subjectChip}>
                      <Ionicons name="book" size={12} color={colors.primary} style={{ marginRight: 4 }} />
                      <Text style={styles.subjectChipText}>{subject.trim()}</Text>
                    </View>
                  ))}
                </View>
              </View>
            </Pressable>
          ))
        )}
      </View>

      {/* My Courses */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Ionicons name="library" size={22} color={colors.primary} />
          <Text style={styles.sectionTitle}>My Courses</Text>
        </View>
        <View style={styles.emptyState}>
          <Ionicons name="book-outline" size={48} color={colors.border} />
          <Text style={styles.emptyTitle}>No active courses</Text>
          <Text style={styles.emptySubtitle}>You haven't enrolled in any courses yet.</Text>
        </View>
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
    marginBottom: spacing.lg,
  },
  greeting: {
    fontSize: typography.sizes.xl,
    fontWeight: typography.weights.bold,
    fontFamily: 'Outfit_700Bold',
    color: colors.text,
  },
  subtitle: {
    fontSize: typography.sizes.sm,
    fontFamily: 'Outfit_400Regular',
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
  communityCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    padding: spacing.lg,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.xl,
  },
  communityIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.secondary,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  communityInfo: {
    flex: 1,
  },
  communityTitle: {
    fontSize: typography.sizes.lg,
    fontWeight: typography.weights.bold,
    fontFamily: 'Outfit_600SemiBold',
    color: colors.text,
  },
  communitySubtitle: {
    fontSize: typography.sizes.sm,
    fontFamily: 'Outfit_400Regular',
    color: colors.textSecondary,
    marginTop: 2,
  },
  careerHubCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#8B5CF6',
    padding: spacing.xl,
    borderRadius: borderRadius.lg,
    marginBottom: spacing.xl,
  },
  careerHubInfo: {
    flex: 1,
    marginRight: spacing.md,
  },
  careerHubTitle: {
    fontSize: typography.sizes.lg,
    fontWeight: typography.weights.bold,
    fontFamily: 'Outfit_600SemiBold',
    color: colors.background,
    marginBottom: spacing.xs,
  },
  careerHubSubtitle: {
    fontSize: typography.sizes.sm,
    fontFamily: 'Outfit_400Regular',
    color: 'rgba(255, 255, 255, 0.8)',
    lineHeight: 20,
  },
  section: {
    marginBottom: spacing.xl,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  sectionTitle: {
    fontSize: typography.sizes.lg,
    fontWeight: typography.weights.semibold,
    fontFamily: 'Outfit_600SemiBold',
    color: colors.text,
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
  emptyTitle: {
    fontSize: typography.sizes.md,
    fontWeight: typography.weights.semibold,
    fontFamily: 'Outfit_600SemiBold',
    color: colors.text,
    marginTop: spacing.md,
  },
  emptySubtitle: {
    fontSize: typography.sizes.sm,
    fontFamily: 'Outfit_400Regular',
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: 4,
  },

  // Teacher Card Styles
  teacherCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  teacherHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  teacherAvatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    marginRight: spacing.md,
  },
  teacherAvatarFallback: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  teacherInfo: {
    flex: 1,
  },
  teacherName: {
    fontSize: typography.sizes.md,
    fontWeight: typography.weights.bold,
    fontFamily: 'Outfit_600SemiBold',
    color: colors.text,
  },
  teacherMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  teacherSchool: {
    fontSize: typography.sizes.sm,
    fontFamily: 'Outfit_400Regular',
    color: colors.textSecondary,
  },
  verifiedBadge: {
    marginLeft: spacing.sm,
  },
  teacherBio: {
    fontSize: typography.sizes.sm,
    fontFamily: 'Outfit_400Regular',
    color: colors.textSecondary,
    marginTop: spacing.md,
    lineHeight: 20,
  },
  subjectsRow: {
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  subjectsLabel: {
    fontSize: typography.sizes.xs,
    fontWeight: typography.weights.semibold,
    fontFamily: 'Outfit_600SemiBold',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: spacing.sm,
  },
  subjectChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  subjectChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primaryLight,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.full,
  },
  subjectChipText: {
    fontSize: typography.sizes.sm,
    fontFamily: 'Outfit_500Medium',
    color: colors.primary,
    fontWeight: typography.weights.medium,
  },
});
