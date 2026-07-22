import React, { useEffect, useState, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, Image, ActivityIndicator, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import { spacing, typography, borderRadius, useThemeColors } from '@/constants/theme';
import { Feather, Ionicons } from '@expo/vector-icons';
import { GlobalWatermark } from '@/components/GlobalWatermark';
import { BlurView } from 'expo-blur';
import ExploreCourses from './ExploreCourses';

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
  const isLightMode = colors.background === '#F8FAFC';
  const styles = useMemo(() => createStyles(colors), [colors]);

  const { user } = useAuth();
  const router = useRouter();
  const [schoolmatesCount, setSchoolmatesCount] = useState<number | null>(null);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [loadingTeachers, setLoadingTeachers] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

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
      <GlobalWatermark />
      <ScrollView 
        contentContainerStyle={styles.content} 
        showsVerticalScrollIndicator={false}
        stickyHeaderIndices={[0]}
      >
        {/* Sticky Search Bar Container */}
        <View style={styles.stickyHeaderWrapper}>
          <BlurView 
            intensity={80} 
            tint={isLightMode ? "light" : "dark"} 
            style={StyleSheet.absoluteFillObject} 
          />
          <View style={styles.searchContainer}>
            <Ionicons name="search" size={20} color={colors.textSecondary} style={styles.searchIcon} />
            <TextInput 
              style={styles.searchInput}
              placeholder="Search for subjects, topics, or papers..."
              placeholderTextColor={colors.textSecondary}
              value={searchQuery}
              onChangeText={setSearchQuery}
            />
          </View>
        </View>



      {/* Career Hub Banner */}
      <Pressable 
        style={styles.careerHubCard}
        onPress={() => router.push('/careers/hub')}
      >
        <BlurView 
          intensity={75} 
          tint={isLightMode ? "light" : "dark"} 
          style={StyleSheet.absoluteFillObject} 
        />
        <View style={styles.careerHubInfo}>
          <Text style={styles.careerHubTitle}>Career Hub 🎓</Text>
          <Text style={styles.careerHubSubtitle}>Explore universities, scholarships, and plan your future roadmap.</Text>
        </View>
        <Ionicons name="arrow-forward-circle" size={28} color={colors.background} />
      </Pressable>






      <ExploreCourses searchQuery={searchQuery} />
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
    paddingHorizontal: spacing.xl,
    paddingBottom: 100,
  },
  stickyHeaderWrapper: {
    marginHorizontal: -spacing.xl,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xxxl,
    paddingBottom: spacing.md,
    marginBottom: spacing.md,
    zIndex: 10,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(150, 150, 150, 0.1)',
    borderRadius: borderRadius.full,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  searchIcon: {
    marginRight: spacing.sm,
  },
  searchInput: {
    flex: 1,
    fontSize: typography.sizes.md,
    fontFamily: 'Outfit_400Regular',
    color: colors.text,
  },
  communityCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'transparent',
    padding: spacing.lg,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.xl,
    overflow: 'hidden',
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
    backgroundColor: 'transparent',
    padding: spacing.xl,
    borderRadius: borderRadius.lg,
    marginBottom: spacing.xl,
    borderWidth: 1,
    borderColor: '#8B5CF6',
    overflow: 'hidden',
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
    backgroundColor: 'transparent',
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
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
    color: '#000000',
    fontWeight: typography.weights.medium,
  },
});
