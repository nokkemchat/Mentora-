import React, { useMemo, useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { spacing, typography, borderRadius, useThemeColors } from '@/constants/theme';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useAuth } from '@/context/AuthContext';
import { GlobalWatermark } from '../../components/GlobalWatermark';

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
  topics: { id: string }[];
};

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
    <SafeAreaView style={styles.container} edges={['top']}>
      <GlobalWatermark />
      <ScrollView contentContainerStyle={styles.content}>
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

            return courses.map((course) => (
              <Pressable 
                key={course.id} 
                style={styles.card}
                onPress={() => router.push(`/course/${course.id}`)}
              >
                {/* Glass background effect */}
                <BlurView 
                  intensity={75} 
                  tint={isLightMode ? "light" : "dark"}
                  style={StyleSheet.absoluteFillObject} 
                />
              <View style={styles.cardContent}>
                {course.image_url && coverImages[course.image_url] ? (
                  <Image 
                    source={coverImages[course.image_url]} 
                    style={styles.courseImage} 
                    resizeMode="cover"
                  />
                ) : (
                  <View style={[styles.iconContainer, { backgroundColor: course.color }]}>
                    <MaterialCommunityIcons name={course.icon as any} size={28} color={colors.background} />
                  </View>
                )}
                
                <View style={styles.cardTextContainer}>
                  <Text style={styles.courseTitle}>{course.title}</Text>
                  <Text style={styles.courseMeta}>{course.board} • {course.level}</Text>
                </View>

                <View style={styles.topicBadge}>
                  {/* Glass Curvature Gradient (Water Bubble) */}
                  <LinearGradient
                    colors={['rgba(255, 255, 255, 0.2)', 'rgba(255, 255, 255, 0.0)', 'rgba(255, 255, 255, 0.1)']}
                    locations={[0, 0.5, 1]}
                    start={{ x: 0.2, y: 0.1 }}
                    end={{ x: 0.8, y: 0.9 }}
                    style={StyleSheet.absoluteFillObject}
                  />
                  <Text style={styles.topicBadgeText}>
                    {course.topics?.length || 0}
                  </Text>
                </View>
              </View>
            </Pressable>
            ));
          })()}
          </View>
        )}
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
  },
  headerTitle: {
    fontSize: typography.sizes.xxl,
    fontWeight: typography.weights.bold,
    color: colors.text,
  },
  headerSubtitle: {
    fontSize: typography.sizes.md,
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
    borderRadius: 100, // Pill shape like navigation bar
    padding: spacing.lg,
    alignItems: 'flex-start',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: colors.background === '#F8FAFC' ? 0.05 : 0.2,
    shadowRadius: 20,
    elevation: 10,
  },
  cardContent: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
  },
  cardTextContainer: {
    flex: 1,
    paddingHorizontal: spacing.md,
    justifyContent: 'center',
  },
  courseImage: {
    width: 56,
    height: 56,
    borderRadius: 28, // Circular image
  },
  iconContainer: {
    width: 56,
    height: 56,
    borderRadius: 28, // Circular icon container
    alignItems: 'center',
    justifyContent: 'center',
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
    backgroundColor: 'transparent',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: 9999, // Perfect pill shape
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
    overflow: 'hidden',
    shadowColor: '#FFFFFF',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  topicBadgeText: {
    fontSize: typography.sizes.xs,
    // Dark grey in light mode, White in dark mode
    color: colors.background === '#F8FAFC' ? '#333333' : '#FFFFFF',
    fontWeight: typography.weights.bold,
  },
});
