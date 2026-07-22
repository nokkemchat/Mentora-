import React, { useMemo, useState, useEffect } from 'react';
import { View, Text, StyleSheet, Pressable, ActivityIndicator, Image } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { spacing, typography, borderRadius, useThemeColors } from '@/constants/theme';
import { MaterialCommunityIcons, Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/context/AuthContext';

const coverImages: Record<string, any> = {
  '/covers/math.png': require('../../../assets/images/covers/math.png'),
  '/covers/science.png': require('../../../assets/images/covers/science.png'),
  '/covers/languages.png': require('../../../assets/images/covers/languages.png'),
  '/covers/humanities.png': require('../../../assets/images/covers/humanities.png'),
  '/covers/technology.png': require('../../../assets/images/covers/technology.png'),
  '/covers/agriculture.png': require('../../../assets/images/covers/agriculture.png'),
};

type CourseType = {
  id: string;
  title: string;
  board: string;
  level: string;
  icon: string;
  color: string;
  image_url: string | null;
  teacher_name?: string;
  likes_count?: number;
  enrolled_count?: number;
  rating?: number;
  topics: { id: string }[];
};

export default function ExploreCourses({ searchQuery = '' }: { searchQuery?: string }) {
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

      if (role === 'teacher') {
        const { data: profileData } = await supabase
          .from('profiles')
          .select('subjects_taught')
          .eq('id', user.id)
          .single();

        allowedCourseTitles = profileData?.subjects_taught || [];
      }

      if (role === 'teacher' && allowedCourseTitles && allowedCourseTitles.length === 0) {
        setCourses([]);
        setLoading(false);
        return;
      }

      let query = supabase
        .from('courses')
        .select(`
          id, title, board, level, icon, color, image_url,
          topics (id)
        `);

      if (role === 'student') {
        const grade = user.user_metadata?.grade;
        const board = user.user_metadata?.board;

        if (grade) {
          const isOLevel = ['Form 1', 'Form 2', 'Form 3', 'Form 4'].includes(grade);
          const isALevel = ['Lower 6', 'Upper 6'].includes(grade);
          
          if (isOLevel) {
            query = query.in('level', [grade, 'O-Level', 'O Level']);
          } else if (isALevel) {
            query = query.in('level', [grade, 'A-Level', 'A Level']);
          } else {
            query = query.eq('level', grade);
          }
        }

        if (board) {
          query = query.eq('board', board);
        }
      }

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

    const coursesSubscription = supabase
      .channel('courses-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'courses' },
        () => {
          fetchCourses();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(coursesSubscription);
    };
  }, [user, role]);

  return (
    <View style={styles.container}>
      <Text style={styles.headerTitle}>Explore Courses</Text>
      <Text style={styles.headerSubtitle}>Find subjects tailored to your syllabus</Text>

      <Pressable 
        style={styles.aiBanner}
        onPress={() => router.push('/papers')}
      >
        <BlurView 
          intensity={75} 
          tint={colors.background === '#F8FAFC' ? "light" : "dark"}
          style={StyleSheet.absoluteFillObject} 
        />
        <View style={styles.aiBannerContent}>
          <MaterialCommunityIcons name="robot-outline" size={32} color={colors.accent} />
          <View style={{ flex: 1, marginLeft: spacing.md }}>
            <Text style={styles.aiBannerTitle}>AI Exam Intelligence</Text>
            <Text style={styles.aiBannerSubtitle}>Past papers turned into an interactive AI tutor.</Text>
          </View>
          <MaterialCommunityIcons name="chevron-right" size={24} color={colors.accent} />
        </View>
      </Pressable>

      {errorMsg ? (
        <Text style={{ color: 'red', marginTop: 20 }}>Error: {errorMsg}</Text>
      ) : loading ? (
        <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: spacing.xxl }} />
      ) : courses.length === 0 ? (
        <Text style={{ color: colors.textSecondary, marginTop: 20 }}>No courses found in the database.</Text>
      ) : (
        <View style={styles.grid}>
          {(() => {
            const isLightMode = colors.background === '#F8FAFC';
            
            const filteredCourses = courses.filter(course => {
              if (!searchQuery) return true;
              const q = searchQuery.toLowerCase();
              return course.title.toLowerCase().includes(q) || 
                     course.board.toLowerCase().includes(q) ||
                     course.level.toLowerCase().includes(q);
            });

            if (filteredCourses.length === 0) {
              return <Text style={{ color: colors.textSecondary, marginTop: 20 }}>No courses match your search.</Text>;
            }

            return filteredCourses.map((course) => (
              <Pressable 
                key={course.id} 
                style={styles.card}
                onPress={() => router.push(`/course/${course.id}`)}
              >
                <BlurView 
                  intensity={75} 
                  tint={isLightMode ? "light" : "dark"}
                  style={StyleSheet.absoluteFillObject} 
                />
              <View style={styles.cardContent}>
                <View style={styles.imageWrapper}>
                  {course.image_url && coverImages[course.image_url] ? (
                    <Image 
                      source={coverImages[course.image_url]} 
                      style={styles.courseImage} 
                      resizeMode="cover"
                    />
                  ) : (
                    <View style={[styles.iconContainer, { backgroundColor: course.color }]}>
                      <MaterialCommunityIcons name={course.icon as any} size={48} color={colors.background} />
                    </View>
                  )}
                  <View style={styles.floatingRatingBadge}>
                    <Ionicons name="star" size={14} color="#F59E0B" />
                    <Text style={styles.ratingText}>
                      {course.rating || (Math.random() * 1 + 4).toFixed(1)}
                    </Text>
                  </View>
                </View>
                
                <View style={styles.cardTextContainer}>
                  <Text style={styles.courseTitle} numberOfLines={1}>{course.title}</Text>
                  <Text style={styles.courseMeta}>{course.board} • {course.level}</Text>
                  
                  <View style={styles.teacherRow}>
                    <Ionicons name="person-circle" size={18} color={colors.textSecondary} />
                    <Text style={styles.teacherName}>
                      {course.teacher_name || 'Mr. John Doe'}
                    </Text>
                  </View>
                  
                  <View style={styles.statsRow}>
                    <View style={styles.statItem}>
                      <Ionicons name="people" size={16} color={colors.primary} />
                      <Text style={styles.statText}>
                        {course.enrolled_count || Math.floor(Math.random() * 900) + 100} Students
                      </Text>
                    </View>
                    <View style={styles.statDivider} />
                    <View style={styles.statItem}>
                      <Ionicons name="library" size={16} color={colors.secondary} />
                      <Text style={styles.statText}>
                        {course.topics?.length || 0} Topics
                      </Text>
                    </View>
                  </View>
                </View>
              </View>
            </Pressable>
            ));
          })()}
          </View>
        )}
    </View>
  );
}

const createStyles = (colors: any) => StyleSheet.create({
  container: {
    flex: 1,
    marginTop: spacing.xxl,
  },
  headerTitle: {
    fontSize: typography.sizes.xl,
    fontWeight: typography.weights.bold,
    color: colors.text,
  },
  headerSubtitle: {
    fontSize: typography.sizes.sm,
    color: colors.textSecondary,
    marginBottom: spacing.md,
    marginTop: spacing.xs,
  },
  aiBanner: {
    backgroundColor: 'transparent',
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    marginBottom: spacing.xxl,
    shadowColor: colors.accent,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  aiBannerContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  aiBannerTitle: {
    color: colors.accent,
    fontSize: typography.sizes.lg,
    fontWeight: typography.weights.bold,
    marginBottom: 4,
  },
  aiBannerSubtitle: {
    color: colors.textSecondary,
    fontSize: typography.sizes.sm,
    lineHeight: 20,
  },
  grid: {
    flexDirection: 'column',
    gap: spacing.md,
  },
  card: {
    width: '100%', 
    backgroundColor: 'transparent',
    borderRadius: 24,
    alignItems: 'flex-start',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: colors.background === '#F8FAFC' ? 0.05 : 0.2,
    shadowRadius: 20,
    elevation: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardContent: {
    flexDirection: 'column',
    width: '100%',
  },
  imageWrapper: {
    width: '100%',
    height: 140,
    position: 'relative',
  },
  courseImage: {
    width: '100%',
    height: '100%',
  },
  iconContainer: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  floatingRatingBadge: {
    position: 'absolute',
    top: spacing.md,
    right: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: borderRadius.md,
    gap: 4,
  },
  ratingText: {
    fontSize: typography.sizes.xs,
    fontWeight: typography.weights.bold,
    fontFamily: 'Outfit_600SemiBold',
    color: '#FCD34D',
  },
  cardTextContainer: {
    width: '100%',
    padding: spacing.lg,
  },
  courseTitle: {
    fontSize: typography.sizes.lg,
    fontWeight: typography.weights.bold,
    fontFamily: 'Outfit_600SemiBold',
    color: colors.text,
    marginBottom: 4,
  },
  courseMeta: {
    fontSize: typography.sizes.sm,
    fontFamily: 'Outfit_400Regular',
    color: colors.textSecondary,
    fontWeight: typography.weights.medium,
    marginBottom: spacing.xs,
  },
  teacherRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.md,
    gap: spacing.xs,
  },
  teacherName: {
    fontSize: typography.sizes.xs,
    fontFamily: 'Outfit_500Medium',
    color: colors.textSecondary,
    fontWeight: typography.weights.medium,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(150, 150, 150, 0.08)',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.lg,
  },
  statItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  statDivider: {
    width: 1,
    height: 12,
    backgroundColor: colors.border,
    marginHorizontal: spacing.md,
  },
  statText: {
    fontSize: typography.sizes.xs,
    fontFamily: 'Outfit_500Medium',
    color: colors.textSecondary,
    fontWeight: typography.weights.medium,
  },
});
