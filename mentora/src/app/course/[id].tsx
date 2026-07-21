import React, { useMemo, useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, LayoutAnimation, UIManager, Platform, ActivityIndicator, Alert, Linking, Image } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { spacing, typography, borderRadius, useThemeColors } from '@/constants/theme';
import { Feather, MaterialCommunityIcons, Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as WebBrowser from 'expo-web-browser';
import { decode } from 'base64-arraybuffer';

const coverImages: Record<string, any> = {
  '/covers/math.png': require('../../../assets/images/covers/math.png'),
  '/covers/science.png': require('../../../assets/images/covers/science.png'),
  '/covers/languages.png': require('../../../assets/images/covers/languages.png'),
  '/covers/humanities.png': require('../../../assets/images/covers/humanities.png'),
  '/covers/technology.png': require('../../../assets/images/covers/technology.png'),
  '/covers/agriculture.png': require('../../../assets/images/covers/agriculture.png'),
};

// Enable LayoutAnimation on Android
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const STATUS_COLORS: Record<string, string> = {
  'Not Started': '#9CA3AF',
  'In Progress': '#F59E0B',
  'Mastered': '#10B981',
  'Needs Revision': '#EF4444'
};

const DIFFICULTY_COLORS: Record<string, string> = {
  'Easy': '#10B981',
  'Medium': '#F59E0B',
  'Hard': '#EF4444'
};

export default function CourseDetailScreen() {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuth();
  
  const [course, setCourse] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [expandedTopicId, setExpandedTopicId] = useState<string | null>(null);
  const [uploadingSyllabus, setUploadingSyllabus] = useState(false);
  const [hasSubscription, setHasSubscription] = useState(false);
  const [teachers, setTeachers] = useState<any[]>([]);

  const fetchCourseData = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('courses')
      .select(`
        *,
        topics (
          *,
          subtopics (
            *,
            user_progress (status)
          )
        )
      `)
      .eq('id', id)
      .single();

    if (!error && data) {
      setCourse(data);
      if (data.topics && data.topics.length > 0) {
        setExpandedTopicId(data.topics[0].id);
      }
    }

    // Check subscription (TEMPORARILY BYPASSED FOR TESTING)
    setHasSubscription(true);
    /*
    if (user?.user_metadata?.role !== 'teacher') {
      const { data: subData } = await supabase
        .from('subscriptions')
        .select('*')
        .eq('course_id', id)
        .eq('user_id', user?.id)
        .eq('status', 'active')
        .single();
      
      setHasSubscription(!!subData);
    } else {
      setHasSubscription(true); // Teachers have access to everything
    }
    */

    // Fetch teachers who teach this subject
    if (data?.title) {
      const { data: teacherData } = await supabase
        .from('profiles')
        .select('id, first_name, last_name, avatar_url, bio, school, subjects_taught')
        .eq('role', 'teacher')
        .eq('is_approved', true)
        .eq('is_activated', true)
        .contains('subjects_taught', [data.title]);

      if (teacherData) {
        setTeachers(teacherData);
      }
    }

    setLoading(false);
  };

  useEffect(() => {
    if (!id || !user) return;
    fetchCourseData();
  }, [id, user]);

  const handleUploadSyllabus = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: 'application/pdf',
        copyToCacheDirectory: true,
      });

      if (result.canceled || !result.assets || result.assets.length === 0) return;

      const asset = result.assets[0];
      setUploadingSyllabus(true);

      const fileExt = asset.name.split('.').pop() || 'pdf';
      const fileName = `${course.id}-${Date.now()}.${fileExt}`;

      let fileBody: any;
      
      if (Platform.OS === 'web') {
        // On web, the actual file object is available in asset.file
        fileBody = asset.file;
        if (!fileBody) {
            // Fallback for web if file object is somehow missing
            const response = await fetch(asset.uri);
            fileBody = await response.blob();
        }
      } else {
        // On mobile, read the file into base64 and decode to ArrayBuffer
        const base64 = await FileSystem.readAsStringAsync(asset.uri, { encoding: 'base64' });
        fileBody = decode(base64);
      }

      const { error: uploadError } = await supabase.storage
        .from('syllabuses')
        .upload(fileName, fileBody, {
          contentType: asset.mimeType || 'application/pdf',
          upsert: true
        });

      if (uploadError) throw uploadError;

      const { data: publicUrlData } = supabase.storage.from('syllabuses').getPublicUrl(fileName);
      const fileUrl = publicUrlData.publicUrl;

      const { error: dbError } = await supabase
        .from('courses')
        .update({ syllabus_url: fileUrl })
        .eq('id', course.id);

      if (dbError) throw dbError;

      Alert.alert('Processing Syllabus', 'The AI is extracting topics from your PDF. This might take a minute...');

      const { data: processData, error: processError } = await supabase.functions.invoke('process-syllabus', {
        body: { course_id: course.id, file_url: fileUrl }
      });

      if (processError) {
        // processError is usually a FunctionsHttpError, which contains the raw response context
        let errorMessage = processError.message;
        try {
          if (processError.context && typeof processError.context.json === 'function') {
             const errJson = await processError.context.json();
             if (errJson && errJson.error) {
               errorMessage = errJson.error;
             }
          }
        } catch (e) {
          // fallback to default message
        }
        throw new Error(`AI Processing Failed: ${errorMessage}`);
      } 
      
      Alert.alert('Success', 'Syllabus processed and topics updated successfully!');
      fetchCourseData();

    } catch (error: any) {
      console.error(error);
      Alert.alert('Upload Failed', error.message);
    } finally {
      setUploadingSyllabus(false);
    }
  };

  const handleViewSyllabus = async () => {
    if (course.syllabus_url) {
      await WebBrowser.openBrowserAsync(course.syllabus_url);
    }
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (!course) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>Course not found.</Text>
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <Text style={styles.backButtonText}>Go Back</Text>
        </Pressable>
      </View>
    );
  }

  const toggleTopic = (topicId: string) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpandedTopicId(prev => prev === topicId ? null : topicId);
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Pressable onPress={() => router.back()} style={styles.backNav}>
        <Feather name="arrow-left" size={24} color={colors.text} />
      </Pressable>

      <View style={styles.header}>
        {course.image_url && coverImages[course.image_url] ? (
          <Image 
            source={coverImages[course.image_url]} 
            style={styles.coverImage} 
            resizeMode="cover"
          />
        ) : (
          <View style={[styles.iconContainer, { backgroundColor: course.color }]}>
            <MaterialCommunityIcons name={course.icon as any} size={40} color={colors.background} />
          </View>
        )}
        <Text style={styles.courseTitle}>{course.title}</Text>
        <Text style={styles.courseMeta}>{course.board} • {course.level}</Text>
      </View>

      <View style={{ flexDirection: 'row', justifyContent: 'center', marginBottom: spacing.xl, gap: spacing.md }}>
        {course.syllabus_url && (
          <Pressable 
            style={[styles.backButton, { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }]} 
            onPress={handleViewSyllabus}
          >
            <Text style={[styles.backButtonText, { color: colors.text }]}>View PDF Syllabus</Text>
          </Pressable>
        )}
        
        {user?.user_metadata?.role === 'teacher' && (
          <Pressable 
            style={styles.backButton}
            onPress={handleUploadSyllabus}
            disabled={uploadingSyllabus}
          >
            {uploadingSyllabus ? (
              <ActivityIndicator color={colors.background} size="small" />
            ) : (
              <Text style={styles.backButtonText}>
                {course.syllabus_url ? 'Replace Syllabus' : 'Upload Syllabus (PDF)'}
              </Text>
            )}
          </Pressable>
        )}
      </View>

      {/* Teachers who teach this subject */}
      {teachers.length > 0 && user?.user_metadata?.role !== 'teacher' && (
        <View style={styles.teachersSection}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.md }}>
            <Ionicons name="school" size={20} color={colors.primary} />
            <Text style={styles.sectionTitle}>Educators</Text>
          </View>
          {teachers.map((teacher) => (
            <Pressable
              key={teacher.id}
              style={styles.teacherRow}
              onPress={() => router.push(`/teacher/${teacher.id}`)}
            >
              {teacher.avatar_url ? (
                <Image source={{ uri: teacher.avatar_url }} style={styles.teacherAvatar} />
              ) : (
                <View style={styles.teacherAvatarFallback}>
                  <Ionicons name="person" size={20} color={colors.primary} />
                </View>
              )}
              <View style={{ flex: 1 }}>
                <Text style={styles.teacherName}>{teacher.first_name} {teacher.last_name}</Text>
                {teacher.school && (
                  <Text style={styles.teacherSchool}>{teacher.school}</Text>
                )}
              </View>
              <Ionicons name="chevron-forward" size={20} color={colors.textTertiary} />
            </Pressable>
          ))}
        </View>
      )}

      {!hasSubscription && user?.user_metadata?.role !== 'teacher' && (
        <View style={styles.enrollContainer}>
          <Pressable 
            style={[styles.backButton, { width: '100%', alignItems: 'center', borderRadius: borderRadius.full }]}
            onPress={() => router.push(`/checkout/${course.id}`)}
          >
            <Text style={[styles.backButtonText, { fontSize: typography.sizes.md }]}>
              Enroll with EcoCash - ${course.price}
            </Text>
          </Pressable>
        </View>
      )}

      <Text style={styles.sectionTitle}>Syllabus</Text>
      
      {!course.topics || course.topics.length === 0 ? (
        <Text style={styles.emptyText}>No topics available yet.</Text>
      ) : (
        course.topics.map((topic: any, index: number) => {
          const isExpanded = expandedTopicId === topic.id;
          const totalSubtopics = topic.subtopics?.length || 0;
          
          // Calculate mastered count based on user_progress
          const masteredCount = topic.subtopics?.filter((st: any) => 
            st.user_progress?.[0]?.status === 'Mastered'
          ).length || 0;

          return (
            <View key={topic.id} style={styles.topicCard}>
              <Pressable 
                style={styles.topicHeader}
                onPress={() => toggleTopic(topic.id)}
              >
                <View style={styles.topicHeaderLeft}>
                  <Text style={styles.topicIndex}>{index + 1}</Text>
                  <View style={styles.topicInfo}>
                    <Text style={styles.topicTitle}>{topic.title}</Text>
                    <Text style={styles.topicSubtitle}>
                      {masteredCount}/{totalSubtopics} Mastered
                    </Text>
                  </View>
                </View>
                <Feather 
                  name={isExpanded ? "chevron-up" : "chevron-down"} 
                  size={24} 
                  color={colors.textSecondary} 
                />
              </Pressable>

              {isExpanded && (
                <View style={styles.subtopicsContainer}>
                  {topic.subtopics?.map((subtopic: any) => {
                    const status = subtopic.user_progress?.[0]?.status || 'Not Started';
                    
                    return (
                      <Pressable
                        key={subtopic.id}
                        style={[styles.subtopicRow, !hasSubscription && { opacity: 0.6 }]}
                        onPress={() => {
                          if (hasSubscription) {
                            router.push(`/topic/${subtopic.id}`);
                          } else {
                            Alert.alert('Locked', 'Please enroll in this course to access the content.', [
                              { text: 'Cancel', style: 'cancel' },
                              { text: 'Enroll Now', onPress: () => router.push(`/checkout/${course.id}`) }
                            ]);
                          }
                        }}
                      >
                        <View style={styles.subtopicLeft}>
                          <View style={[styles.statusDot, { backgroundColor: STATUS_COLORS[status] || STATUS_COLORS['Not Started'] }]} />
                          <View>
                            <Text style={styles.subtopicTitle}>{subtopic.title}</Text>
                            <View style={styles.subtopicMetaRow}>
                              <Text style={[styles.subtopicDifficulty, { color: DIFFICULTY_COLORS[subtopic.difficulty] || colors.textSecondary }]}>
                                {subtopic.difficulty}
                              </Text>
                              <Text style={styles.subtopicMetaDot}>•</Text>
                              <Text style={styles.subtopicTime}>
                                <Feather name="clock" size={10} color={colors.textSecondary} /> {subtopic.estimated_time}
                              </Text>
                            </View>
                          </View>
                        </View>
                        <Feather name={hasSubscription ? "chevron-right" : "lock"} size={20} color={colors.textTertiary} />
                      </Pressable>
                    );
                  })}
                </View>
              )}
            </View>
          );
        })
      )}
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
    padding: spacing.xl,
    backgroundColor: colors.background,
  },
  content: {
    padding: spacing.xl,
    paddingTop: spacing.xxxl,
  },
  backNav: {
    marginBottom: spacing.lg,
  },
  header: {
    alignItems: 'center',
    marginBottom: spacing.xxxl,
  },
  coverImage: {
    width: '100%',
    aspectRatio: 16 / 9,
    height: undefined,
    borderRadius: borderRadius.lg,
    marginBottom: spacing.lg,
  },
  iconContainer: {
    width: 80,
    height: 80,
    borderRadius: borderRadius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  courseTitle: {
    fontSize: typography.sizes.xxl,
    fontWeight: typography.weights.bold,
    color: colors.text,
    marginBottom: spacing.xs,
  },
  courseMeta: {
    fontSize: typography.sizes.sm,
    color: colors.textSecondary,
    fontWeight: typography.weights.medium,
  },
  sectionTitle: {
    fontSize: typography.sizes.lg,
    fontWeight: typography.weights.semibold,
    color: colors.text,
    marginBottom: spacing.lg,
  },
  enrollContainer: {
    marginBottom: spacing.xl,
    paddingHorizontal: spacing.md,
  },
  topicCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.md,
    overflow: 'hidden',
  },
  topicHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.lg,
    backgroundColor: colors.surface,
  },
  topicHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  topicIndex: {
    fontSize: typography.sizes.xl,
    fontWeight: typography.weights.bold,
    color: colors.textSecondary,
    marginRight: spacing.md,
    width: 28,
  },
  topicInfo: {
    flex: 1,
  },
  topicTitle: {
    fontSize: typography.sizes.md,
    fontWeight: typography.weights.semibold,
    color: colors.text,
  },
  topicSubtitle: {
    fontSize: typography.sizes.xs,
    color: colors.textSecondary,
    marginTop: 2,
  },
  subtopicsContainer: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.background,
  },
  subtopicRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.surfaceHighlight,
  },
  subtopicLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: spacing.md,
  },
  subtopicTitle: {
    fontSize: typography.sizes.sm,
    fontWeight: typography.weights.medium,
    color: colors.text,
    marginBottom: 4,
  },
  subtopicMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  subtopicDifficulty: {
    fontSize: 10,
    fontWeight: typography.weights.bold,
    textTransform: 'uppercase',
  },
  subtopicMetaDot: {
    fontSize: 10,
    color: colors.textSecondary,
    marginHorizontal: 4,
  },
  subtopicTime: {
    fontSize: 10,
    color: colors.textSecondary,
  },
  errorText: {
    fontSize: typography.sizes.lg,
    color: colors.error,
    marginBottom: spacing.md,
  },
  backButton: {
    padding: spacing.md,
    backgroundColor: colors.primary,
    borderRadius: borderRadius.md,
  },
  backButtonText: {
    color: colors.background,
    fontWeight: typography.weights.bold,
  },
  emptyText: {
    fontSize: typography.sizes.md,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: spacing.xl,
  },

  // Teachers Section
  teachersSection: {
    marginBottom: spacing.xl,
  },
  teacherRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    padding: spacing.md,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.sm,
  },
  teacherAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    marginRight: spacing.md,
  },
  teacherAvatarFallback: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  teacherName: {
    fontSize: typography.sizes.md,
    fontWeight: typography.weights.semibold,
    fontFamily: 'Outfit_600SemiBold',
    color: colors.text,
  },
  teacherSchool: {
    fontSize: typography.sizes.xs,
    fontFamily: 'Outfit_400Regular',
    color: colors.textSecondary,
    marginTop: 2,
  },
});
