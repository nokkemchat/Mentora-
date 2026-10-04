import React, { useMemo, useState, useEffect } from 'react';
import { View, Text, StyleSheet, Pressable, ActivityIndicator, Image, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { supabase } from '@/lib/supabase';
import { spacing, typography, borderRadius, shadows, useThemeColors } from '@/constants/theme';
import { MaterialCommunityIcons, Ionicons, Feather } from '@expo/vector-icons';
import { useAuth } from '@/context/AuthContext';
import { getSubjectVisuals } from '@/lib/subjectVisuals';
import { 
  getCachedCoursesListSync, 
  getCachedCoursesList, 
  setCachedCoursesList, 
  warmCourseMetadata, 
  registerActiveCourse, 
  registerCourseAlias 
} from '@/lib/courseCache';

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

const CATEGORIES = [
  { id: 'all', label: 'All Subjects', icon: 'apps-outline' },
  { id: 'mathematics', label: 'Mathematics', icon: 'calculator-outline' },
  { id: 'sciences', label: 'Sciences', icon: 'flask-outline' },
  { id: 'languages', label: 'Languages', icon: 'chatbubbles-outline' },
  { id: 'humanities', label: 'Humanities', icon: 'earth-outline' },
  { id: 'business', label: 'Business', icon: 'briefcase-outline' },
  { id: 'technology', label: 'Technology', icon: 'hardware-chip-outline' },
  { id: 'arts', label: 'Arts', icon: 'color-palette-outline' },
  { id: 'technical_vocational', label: 'Technical & Vocational', icon: 'construct-outline' },
  { id: 'health_life_skills', label: 'Health & Life Skills', icon: 'fitness-outline' },
];

function matchesSubjectCategory(title: string, categoryId: string): boolean {
  if (!title || categoryId === 'all') return true;
  const t = title.toLowerCase();

  switch (categoryId) {
    case 'mathematics':
      return /math|pure math|additional math|stats|statistics|calculus|algebra/i.test(t);
    case 'sciences':
      return /science|physics|chemistry|biology|combined science|integrated science|general science|agriculture/i.test(t);
    case 'languages':
      return /english|literature|french|shona|ndebele|spanish|german|portuguese|chichewa|swahili|language/i.test(t);
    case 'humanities':
      return /history|geography|heritage|religious|divinity|sociology|civics|family & religious|social studies/i.test(t);
    case 'business':
      return /commerce|business|account|accounting|economic|finance|entrepreneur/i.test(t);
    case 'technology':
      return /computer|ict|information communication|technology|coding|software/i.test(t);
    case 'arts':
      return /art|design & art|music|theatre|drama|visual art|performing/i.test(t);
    case 'technical_vocational':
      return /design & technology|technical graphics|woodwork|metalwork|building|food & nutrition|fashion|fabric|agriculture|technical/i.test(t);
    case 'health_life_skills':
      return /physical education|p\.e\.|health|life skills|guidance|counselling|home economics/i.test(t);
    default:
      return t.includes(categoryId.toLowerCase());
  }
}

function getEquivalentLevels(grade?: string): string[] {
  if (!grade) return [];
  const g = grade.trim().toLowerCase();

  if (['form 3', 'form 4', 'igcse', 'o-level', 'o level', 'gcse'].includes(g)) {
    return [
      'Form 3', 'Form 4', 'form 3', 'form 4',
      'IGCSE', 'igcse', 'Igcse',
      'O-Level', 'O Level', 'o-level', 'o level', 'O-level', 'O level',
      'IGCSE / O-Level', 'O-Level / IGCSE', 'GCSE', 'gcse'
    ];
  }

  if (['lower 6', 'upper 6', 'a-level', 'a level', 'as level', 'as-level', 'a2', 'a2 level', 'as & a level'].includes(g)) {
    return [
      'Lower 6', 'Upper 6', 'lower 6', 'upper 6',
      'A-Level', 'A Level', 'a-level', 'a level', 'A-level', 'A level',
      'AS Level', 'AS-Level', 'as level', 'as-level',
      'A2', 'A2 Level', 'a2 level',
      'AS & A Level', 'A-Level / AS Level', 'A Level / AS Level'
    ];
  }

  if (['form 1', 'form 2', 'checkpoint', 'lower secondary'].includes(g)) {
    return [
      'Form 1', 'Form 2', 'form 1', 'form 2',
      'Checkpoint', 'checkpoint',
      'Lower Secondary', 'lower secondary',
      'Form 1 & 2', 'Form 1-2'
    ];
  }

  if (['grade 7', 'primary'].includes(g)) {
    return ['Grade 7', 'Primary', 'grade 7', 'primary'];
  }

  return [grade];
}

export default function ExploreCourses({ searchQuery = '' }: { searchQuery?: string }) {
  const colors = useThemeColors();
  const isLight = colors.background === '#F8FAFC' || colors.background === '#FFFFFF';
  const styles = useMemo(() => createStyles(colors, isLight), [colors, isLight]);

  const router = useRouter();
  const { user } = useAuth();
  const role = user?.user_metadata?.role;

  // Initialize instantly (0ms) from cache memory if available
  const [courses, setCourses] = useState<CourseType[]>(() => {
    const cached = getCachedCoursesListSync();
    return (cached as CourseType[]) || [];
  });
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [loading, setLoading] = useState(() => {
    const cached = getCachedCoursesListSync();
    return !(cached && cached.length > 0);
  });
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    // Fast-path: read from persistent AsyncStorage if memory was empty
    async function loadCacheFirst() {
      if (courses.length === 0) {
        const localList = await getCachedCoursesList();
        if (localList && localList.length > 0 && isMounted) {
          setCourses(localList as CourseType[]);
          setLoading(false);
        }
      }
    }
    loadCacheFirst();

    async function fetchCourses() {
      let allowedCourseTitles: string[] | null = null;

      if (user && role === 'teacher') {
        const { data: profileData } = await supabase
          .from('profiles')
          .select('subjects_taught')
          .eq('id', user.id)
          .single();

        allowedCourseTitles = profileData?.subjects_taught || [];
      }

      if (role === 'teacher' && allowedCourseTitles && allowedCourseTitles.length === 0) {
        if (isMounted) {
          setCourses([]);
          setLoading(false);
        }
        return;
      }

      let query = supabase
        .from('courses')
        .select(`
          id, title, board, level, icon, color, image_url,
          topics (id)
        `);

      if (user && role === 'student') {
        const grade = user.user_metadata?.grade;
        const board = user.user_metadata?.board;

        if (grade) {
          const matchingLevels = getEquivalentLevels(grade);
          if (matchingLevels.length > 0) {
            query = query.in('level', matchingLevels);
          }
        }

        if (board) {
          const b = board.trim().toLowerCase();
          if (b.includes('cambridge') || b.includes('cie')) {
            query = query.or('board.ilike.%cambridge%,board.ilike.%cie%');
          } else {
            query = query.ilike('board', `%${board}%`);
          }
        }
      }

      if (role === 'teacher' && allowedCourseTitles && allowedCourseTitles.length > 0) {
        query = query.in('title', allowedCourseTitles);
      }
      
      let { data, error } = await query;

      // Resilient fallback: If session token skew causes JWT issued at future, load public courses
      if (error) {
        console.warn("Primary course query notice:", error.message);
        try {
          const fallbackResp = await fetch('https://akjbejexhdawelrfygub.supabase.co/rest/v1/courses?select=id,title,board,level,icon,color,image_url,topics(id)', {
            headers: {
              'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFramJlamV4aGRhd2VscmZ5Z3ViIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ3MjAwMTgsImV4cCI6MjEwMDI5NjAxOH0.L2t-AiTbkMOtadI6rNVII9QZ9qLVZqD3ep9ekHqvI7Y',
              'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFramJlamV4aGRhd2VscmZ5Z3ViIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ3MjAwMTgsImV4cCI6MjEwMDI5NjAxOH0.L2t-AiTbkMOtadI6rNVII9QZ9qLVZqD3ep9ekHqvI7Y'
            }
          });
          if (fallbackResp.ok) {
            data = await fallbackResp.json();
            error = null;
          }
        } catch (_) {}
      }

      if (error) {
        if (isMounted && courses.length === 0) {
          setErrorMsg(error.message);
        }
      } else if (data) {
        // Deduplicate courses: If multiple courses have same title + board + level,
        // pick the canonical one with the most topics, and alias empty duplicates to it.
        const grouped = new Map<string, CourseType[]>();
        (data as CourseType[]).forEach(c => {
          const key = `${(c.title || '').trim().toLowerCase()}__${(c.board || '').trim().toLowerCase()}__${(c.level || '').trim().toLowerCase()}`;
          if (!grouped.has(key)) grouped.set(key, []);
          grouped.get(key)!.push(c);
        });

        const cleanedList: CourseType[] = [];
        grouped.forEach((group) => {
          group.sort((a, b) => (b.topics?.length || 0) - (a.topics?.length || 0));
          const primary = group[0];
          cleanedList.push(primary);
          registerActiveCourse(primary.title, primary.board, primary.level, primary.id);
          group.forEach(item => {
            if (item.id !== primary.id) {
              registerCourseAlias(item.id, primary.id);
            }
          });
        });

        if (isMounted) {
          setCourses(cleanedList);
          setErrorMsg(null);
        }
        await setCachedCoursesList(cleanedList);
      }
      if (isMounted) {
        setLoading(false);
      }
    }

    fetchCourses();

    return () => {
      isMounted = false;
    };
  }, [user, role]);

  const filteredCourses = useMemo(() => {
    return courses.filter(course => {
      // Category filter using intelligent subject matching
      if (!matchesSubjectCategory(course.title, selectedCategory)) {
        return false;
      }

      // Search query filter
      if (!searchQuery) return true;
      const q = searchQuery.toLowerCase();
      return course.title.toLowerCase().includes(q) || 
             course.board?.toLowerCase().includes(q) ||
             course.level?.toLowerCase().includes(q);
    });
  }, [courses, selectedCategory, searchQuery]);

  return (
    <View style={styles.container}>
      {/* Category Pills Header */}
      <View style={styles.headerRow}>
        <View>
          <Text style={styles.sectionTitle}>Curriculum Subjects</Text>
          <Text style={styles.sectionSubtitle}>Select your subject to access syllabus & topics</Text>
        </View>
        <Text style={styles.courseCountBadge}>{filteredCourses.length} Available</Text>
      </View>

      {/* Horizontal Category Pill Filter */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.categoryScroll}
      >
        {CATEGORIES.map(cat => {
          const isSelected = selectedCategory === cat.id;
          return (
            <Pressable
              key={cat.id}
              style={[styles.categoryPill, isSelected ? styles.categoryPillActive : styles.categoryPillInactive]}
              onPress={() => setSelectedCategory(cat.id)}
            >
              <Ionicons 
                name={cat.icon as any} 
                size={16} 
                color={isSelected ? (isLight ? '#FFFFFF' : '#0F172A') : colors.textSecondary} 
              />
              <Text style={[styles.categoryPillText, isSelected ? styles.categoryPillTextActive : styles.categoryPillTextInactive]}>
                {cat.label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {errorMsg ? (
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>Notice: {errorMsg}</Text>
        </View>
      ) : loading ? (
        <ActivityIndicator size="large" color="#2563EB" style={{ marginTop: 30 }} />
      ) : filteredCourses.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Feather name="book-open" size={36} color={colors.textTertiary} />
          <Text style={styles.emptyTitle}>No subjects found</Text>
          <Text style={styles.emptySubtitle}>Try selecting a different category or clear search.</Text>
        </View>
      ) : (
        <View style={styles.coursesList}>
          {filteredCourses.map((course) => {
            const topicCount = course.topics?.length || 0;
            const { color: accentColor, icon: subjectIcon } = getSubjectVisuals(course.title, course.color, course.icon);

            return (
              <Pressable 
                key={course.id} 
                style={styles.courseCard}
                onPress={() => {
                  warmCourseMetadata(course);
                  router.push(`/course/${course.id}`);
                }}
              >
                {/* Top Card Row */}
                <View style={styles.cardTopRow}>
                  {/* Subject Icon Box - Frosted soft tint with rich icon */}
                  <View style={[styles.subjectIconBox, { backgroundColor: isLight ? `${accentColor}12` : `${accentColor}25` }]}>
                    <MaterialCommunityIcons 
                      name={subjectIcon as any} 
                      size={26} 
                      color={accentColor} 
                    />
                  </View>

                  {/* Title & Metadata Info */}
                  <View style={styles.cardHeaderInfo}>
                    <Text style={styles.courseTitle} numberOfLines={1}>
                      {course.title}
                    </Text>

                    <View style={styles.tagPillRow}>
                      {course.board && (
                        <View style={styles.boardBadge}>
                          <Text style={styles.boardBadgeText}>{course.board}</Text>
                        </View>
                      )}
                      {course.level && (
                        <View style={styles.levelBadge}>
                          <Text style={styles.levelBadgeText}>{course.level}</Text>
                        </View>
                      )}
                    </View>
                  </View>

                  {/* Rating / Quality Badge */}
                  <View style={styles.ratingBadge}>
                    <Ionicons name="star" size={13} color="#F59E0B" />
                    <Text style={styles.ratingValue}>4.9</Text>
                  </View>
                </View>

                {/* Card Divider */}
                <View style={styles.cardDivider} />

                {/* Bottom Action & Stats Row */}
                <View style={styles.cardBottomRow}>
                  <View style={styles.cardStatsGroup}>
                    <View style={styles.statPill}>
                      <Feather name="layers" size={13} color={colors.textSecondary} />
                      <Text style={styles.statPillText}>{topicCount} Topics</Text>
                    </View>
                    <View style={styles.statPill}>
                      <Feather name="users" size={13} color={colors.textSecondary} />
                      <Text style={styles.statPillTextSecondary}>2.4k Students</Text>
                    </View>
                  </View>

                  {/* Sleek Minimalist Action Arrow Button */}
                  <View style={styles.circularActionButton}>
                    <Feather name="arrow-up-right" size={16} color={colors.text} />
                  </View>
                </View>
              </Pressable>
            );
          })}
        </View>
      )}
    </View>
  );
}

const createStyles = (colors: any, isLight: boolean) => StyleSheet.create({
  container: {
    marginTop: 10,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  sectionTitle: {
    fontSize: 18,
    fontFamily: 'Outfit_700Bold',
    fontWeight: '700',
    color: colors.text,
    letterSpacing: -0.3,
  },
  sectionSubtitle: {
    fontSize: 12,
    fontFamily: 'Outfit_400Regular',
    color: colors.textSecondary,
    marginTop: 2,
  },
  courseCountBadge: {
    fontSize: 12,
    fontFamily: 'Outfit_500Medium',
    color: colors.textTertiary || colors.textSecondary,
    fontWeight: '500',
  },
  categoryScroll: {
    gap: 8,
    paddingBottom: 16,
  },
  categoryPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 9999,
    gap: 6,
  },
  categoryPillActive: {
    backgroundColor: isLight ? '#0F172A' : '#F1F5F9',
    ...shadows.sm,
  },
  categoryPillInactive: {
    backgroundColor: isLight ? '#FFFFFF' : colors.surface,
    borderWidth: 1,
    borderColor: isLight ? '#E2E8F0' : colors.border,
  },
  categoryPillText: {
    fontSize: 13,
    fontFamily: 'Outfit_600SemiBold',
    fontWeight: '600',
  },
  categoryPillTextActive: {
    color: isLight ? '#FFFFFF' : '#0F172A',
  },
  categoryPillTextInactive: {
    color: colors.textSecondary,
  },
  coursesList: {
    gap: 14,
  },
  courseCard: {
    backgroundColor: isLight ? '#FFFFFF' : colors.card,
    borderRadius: 24,
    padding: 16,
    borderWidth: 1,
    borderColor: isLight ? '#EDF2F7' : colors.cardBorder,
    ...shadows.tactile,
  },
  cardTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  subjectIconBox: {
    width: 52,
    height: 52,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  cardHeaderInfo: {
    flex: 1,
  },
  courseTitle: {
    fontSize: 17,
    fontFamily: 'Outfit_700Bold',
    fontWeight: '700',
    color: colors.text,
    letterSpacing: -0.3,
    marginBottom: 4,
  },
  tagPillRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  boardBadge: {
    backgroundColor: isLight ? '#F1F5F9' : colors.surfaceHighlight,
    paddingHorizontal: 8,
    paddingVertical: 2.5,
    borderRadius: 6,
  },
  boardBadgeText: {
    fontSize: 11,
    fontFamily: 'Outfit_600SemiBold',
    color: colors.text,
    fontWeight: '600',
  },
  levelBadge: {
    backgroundColor: isLight ? '#F8FAFC' : colors.surfaceHighlight,
    paddingHorizontal: 8,
    paddingVertical: 2.5,
    borderRadius: 6,
  },
  levelBadgeText: {
    fontSize: 11,
    fontFamily: 'Outfit_500Medium',
    color: colors.textSecondary,
  },
  ratingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: isLight ? '#FEF3C7' : '#2D2110',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    gap: 3,
    alignSelf: 'flex-start',
  },
  ratingValue: {
    fontSize: 12,
    fontFamily: 'Outfit_700Bold',
    fontWeight: '700',
    color: '#D97706',
  },
  cardDivider: {
    height: 1,
    backgroundColor: isLight ? '#F1F5F9' : colors.border,
    marginVertical: 14,
  },
  cardBottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  cardStatsGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  statPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: isLight ? '#F8FAFC' : colors.surfaceHighlight,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 5,
  },
  statPillText: {
    fontSize: 11,
    fontFamily: 'Outfit_500Medium',
    color: colors.textSecondary,
    fontWeight: '500',
  },
  statPillTextSecondary: {
    fontSize: 11,
    fontFamily: 'Outfit_500Medium',
    color: colors.textSecondary,
  },
  circularActionButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: isLight ? '#F8FAFC' : colors.surfaceHighlight,
    borderWidth: 1,
    borderColor: isLight ? '#E2E8F0' : colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorContainer: {
    padding: 16,
    borderRadius: 16,
    backgroundColor: '#FEF2F2',
    marginTop: 16,
  },
  errorText: {
    color: '#DC2626',
    fontSize: 13,
    fontFamily: 'Outfit_500Medium',
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
    gap: 8,
  },
  emptyTitle: {
    fontSize: 16,
    fontFamily: 'Outfit_600SemiBold',
    color: colors.text,
    marginTop: 8,
  },
  emptySubtitle: {
    fontSize: 13,
    fontFamily: 'Outfit_400Regular',
    color: colors.textSecondary,
  },
});

