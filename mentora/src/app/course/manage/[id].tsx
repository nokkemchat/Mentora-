import React, { useEffect, useState, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, TextInput, Alert, Modal, KeyboardAvoidingView, Platform } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { spacing, typography, borderRadius, useThemeColors } from '@/constants/theme';
import { Feather, MaterialCommunityIcons, Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import * as WebBrowser from 'expo-web-browser';
import * as FileSystem from 'expo-file-system/legacy';
import { FileSystemUploadType } from 'expo-file-system/legacy';
import { decode } from 'base64-arraybuffer';
import { calculateSubtopicMinutes, calculateTopicMinutes, formatStudyTime } from '@/lib/time';

type Topic = {
  id: string;
  title: string;
  subtopics: any[];
};

type Course = {
  id: string;
  title: string;
  board: string;
  level: string;
  icon: string;
  color: string;
  topics: Topic[];
};

export default function ManageCourseScreen() {
  const { id } = useLocalSearchParams();
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const router = useRouter();

  const [course, setCourse] = useState<Course | null>(null);
  const [loading, setLoading] = useState(true);

  // Add Topic Modal State
  const [isAddTopicVisible, setAddTopicVisible] = useState(false);
  const [newTopicTitle, setNewTopicTitle] = useState('');
  const [addingTopic, setAddingTopic] = useState(false);

  // Add Subtopic Modal State
  const [isAddSubtopicVisible, setAddSubtopicVisible] = useState(false);
  const [activeTopicId, setActiveTopicId] = useState<string | null>(null);
  const [newSubtopicTitle, setNewSubtopicTitle] = useState('');
  const [newSubtopicDifficulty, setNewSubtopicDifficulty] = useState('Medium');
  const [newSubtopicTime, setNewSubtopicTime] = useState('15m');
  const [selectedVideo, setSelectedVideo] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [addingSubtopic, setAddingSubtopic] = useState(false);

  useEffect(() => {
    fetchCourseData();
  }, [id]);

  const fetchCourseData = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('courses')
      .select(`
        *,
        topics (
          *,
          subtopics (
            id, title, difficulty, estimated_time, estimated_quiz_minutes, workspace_template,
            subtopic_materials (estimated_minutes),
            questions (id)
          )
        )
      `)
      .eq('id', id)
      .single();

    if (error) {
      console.error(error);
      Alert.alert('Error fetching course', error.message);
    } else {
      // Sort topics by creation ideally, or just use as is
      setCourse(data as any);
    }
    setLoading(false);
  };

  const handleAddTopic = async () => {
    if (!newTopicTitle.trim()) {
      Alert.alert('Error', 'Topic title cannot be empty');
      return;
    }

    setAddingTopic(true);
    const { error } = await supabase
      .from('topics')
      .insert({
        course_id: id,
        title: newTopicTitle.trim()
      });

    setAddingTopic(false);

    if (error) {
      Alert.alert('Error adding topic', error.message);
    } else {
      setNewTopicTitle('');
      setAddTopicVisible(false);
      fetchCourseData(); // Refresh list
    }
  };

  const [uploadingChapterId, setUploadingChapterId] = useState<string | null>(null);

  const handleUploadChapterSummary = async (topicId: string) => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: 'application/pdf',
        copyToCacheDirectory: true,
      });

      if (result.canceled || !result.assets || result.assets.length === 0) return;

      const asset = result.assets[0];
      setUploadingChapterId(topicId);

      const fileExt = asset.name.split('.').pop() || 'pdf';
      const fileName = `chapter_${topicId}_${Date.now()}.${fileExt}`;

      let fileBody: any;
      if (Platform.OS === 'web') {
        fileBody = asset.file;
        if (!fileBody) {
          const response = await fetch(asset.uri);
          fileBody = await response.blob();
        }
      } else {
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

      const topic = course?.topics?.find((t: any) => t.id === topicId);
      let existingTemplate = (topic as any)?.workspace_template;
      if (typeof existingTemplate === 'string') {
        try { existingTemplate = JSON.parse(existingTemplate); } catch (e) { existingTemplate = {}; }
      } else if (!existingTemplate || typeof existingTemplate !== 'object') {
        existingTemplate = {};
      }

      const newFile = {
        display_name: asset.name.replace(/\.[^/.]+$/, '') || 'Chapter Document',
        file_name: asset.name,
        url: fileUrl,
        uploaded_at: new Date().toISOString(),
        size: asset.size,
        type: 'pdf_resources',
        estimated_minutes: 15,
      };
      const existingContent = Array.isArray(existingTemplate.content) ? existingTemplate.content : [];

      const updatedTemplate = {
        ...existingTemplate,
        content: [...existingContent.filter((f: any) => f.url !== fileUrl), newFile],
        chapter_pdf_url: fileUrl,
        chapter_pdf_name: asset.name || 'Chapter Document'
      };

      const { error: dbError } = await supabase
        .from('topics')
        .update({ workspace_template: updatedTemplate })
        .eq('id', topicId);

      if (dbError) throw dbError;

      Alert.alert('Success', 'Chapter document uploaded successfully!');
      fetchCourseData();
    } catch (err: any) {
      Alert.alert('Upload Failed', err.message || 'Could not upload document');
    } finally {
      setUploadingChapterId(null);
    }
  };

  const handlePickVideo = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission Denied', 'We need gallery permissions to upload a video.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Videos,
      quality: 1,
    });

    if (!result.canceled && result.assets && result.assets.length > 0) {
      const selectedAsset = result.assets[0];
      
      // Check file size (max 50MB for Free tier)
      const MAX_SIZE_BYTES = 50 * 1024 * 1024;
      let fileSize = selectedAsset.fileSize;
      
      if (!fileSize) {
        const fileInfo = await FileSystem.getInfoAsync(selectedAsset.uri);
        if (fileInfo.exists) {
          fileSize = fileInfo.size;
        }
      }
      
      if (fileSize && fileSize > MAX_SIZE_BYTES) {
        Alert.alert('File Too Large', 'Because you are on the Supabase Free Tier, the maximum allowed file size is 50 MB. Please compress your video.');
        return;
      }

      setSelectedVideo(selectedAsset);
    }
  };

  const handleAddSubtopic = async () => {
    if (!newSubtopicTitle.trim() || !activeTopicId) {
      Alert.alert('Error', 'Subtopic title cannot be empty');
      return;
    }

    setAddingSubtopic(true);
    let videoUrl = null;

    if (selectedVideo) {
      try {
        const fileName = `course_${id}/topic_${activeTopicId}/${Date.now()}.mp4`;
        
        // Get the current user session for authorization
        const { data: { session } } = await supabase.auth.getSession();
        
        const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
        const supabaseKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
        
        // Use FileSystem.uploadAsync to handle large video files without crashing the JS bridge
        const uploadResult = await FileSystem.uploadAsync(
          `${supabaseUrl}/storage/v1/object/videos/${fileName}`,
          selectedVideo.uri,
          {
            httpMethod: 'POST',
            uploadType: FileSystemUploadType.BINARY_CONTENT,
            headers: {
              Authorization: `Bearer ${session?.access_token ?? supabaseKey}`,
              apikey: supabaseKey as string,
              'Content-Type': 'video/mp4',
              'x-upsert': 'true',
            },
          }
        );

        if (uploadResult.status !== 200) {
          throw new Error(`Upload failed with status ${uploadResult.status}: ${uploadResult.body}`);
        }

        const { data: publicUrlData } = supabase.storage
          .from('videos')
          .getPublicUrl(fileName);
          
        videoUrl = publicUrlData.publicUrl;
      } catch (error: any) {
        Alert.alert('Upload Error', error.message || 'Failed to upload video');
        setAddingSubtopic(false);
        return;
      }
    }

    const { error } = await supabase
      .from('subtopics')
      .insert({
        topic_id: activeTopicId,
        title: newSubtopicTitle.trim(),
        difficulty: newSubtopicDifficulty,
        estimated_time: newSubtopicTime,
        video_url: videoUrl
      });

    setAddingSubtopic(false);

    if (error) {
      Alert.alert('Error adding subtopic', error.message);
    } else {
      setNewSubtopicTitle('');
      setNewSubtopicDifficulty('Medium');
      setNewSubtopicTime('15m');
      setSelectedVideo(null);
      setActiveTopicId(null);
      setAddSubtopicVisible(false);
      fetchCourseData();
    }
  };

  if (loading && !course) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (!course) {
    return (
      <View style={styles.container}>
        <Text style={{ color: colors.text }}>Course not found.</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.replace('/(tabs)')} style={styles.backButton}>
          <Feather name="arrow-left" size={24} color={colors.text} />
        </Pressable>
        <Text style={styles.headerTitle}>Course Manager</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Course Info Card */}
        <View style={[styles.courseHeaderCard, { borderColor: course.color }]}>
          <View style={[styles.courseIconContainer, { backgroundColor: course.color }]}>
            <MaterialCommunityIcons name={course.icon as any} size={36} color={colors.background} />
          </View>
          <View style={styles.courseInfo}>
            <Text style={styles.courseSubject}>{course.board} • {course.level}</Text>
            <Text style={styles.courseTitle}>{course.title}</Text>
          </View>
          <Pressable style={styles.editButton}>
            <Feather name="edit-2" size={20} color={colors.textSecondary} />
          </Pressable>
        </View>

        {/* Topics List */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Syllabus Outline</Text>
          <Pressable 
            style={styles.addBtn}
            onPress={() => setAddTopicVisible(true)}
          >
            <Feather name="plus" size={16} color={colors.primary} />
            <Text style={styles.addBtnText}>Add Topic</Text>
          </Pressable>
        </View>

        {course.topics?.length === 0 ? (
          <View style={styles.emptyState}>
            <Feather name="list" size={48} color={colors.border} />
            <Text style={styles.emptyStateTitle}>No Topics Yet</Text>
            <Text style={styles.emptyStateSubtitle}>Break your course down into major topics.</Text>
            <Pressable 
              style={styles.primaryButton}
              onPress={() => setAddTopicVisible(true)}
            >
              <Text style={styles.primaryButtonText}>Create First Topic</Text>
            </Pressable>
          </View>
        ) : (
          course.topics?.map((topic, index) => {
            const topicTotalMins = calculateTopicMinutes(topic);
            const topicTimeStr = formatStudyTime(topicTotalMins);

            return (
              <View key={topic.id} style={styles.topicCard}>
                <View style={styles.topicHeader}>
                  <View style={styles.topicTitleRow}>
                    <View style={styles.topicNumberBadge}>
                      <Text style={styles.topicNumberText}>{index + 1}</Text>
                    </View>
                    <View>
                      <Text style={styles.topicTitle}>{topic.title}</Text>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 }}>
                        <Feather name="clock" size={11} color={colors.primary} />
                        <Text style={{ color: colors.primary, fontSize: typography.sizes.xs, fontWeight: '600' }}>
                          {topicTimeStr} total
                        </Text>
                      </View>
                    </View>
                  </View>
                  <Pressable>
                    <Feather name="more-vertical" size={20} color={colors.textSecondary} />
                  </Pressable>
                </View>

                {/* Chapter Materials / Overview Resources Block */}
                <View style={styles.chapterSummaryBox}>
                  <View style={styles.chapterSummaryInfo}>
                    <Ionicons name="folder-open" size={18} color={colors.primary} />
                    <View style={{ flex: 1, marginLeft: 8 }}>
                      <Text style={styles.chapterSummaryTitle}>Chapter Materials & Resources</Text>
                      <Text style={styles.chapterSummarySub} numberOfLines={1}>
                        {(topic as any).workspace_template?.chapter_pdf_name || (topic as any).workspace_template?.content?.[0]?.display_name || 'Upload overview notes & revision guide for this chapter'}
                      </Text>
                    </View>
                  </View>
                  <Pressable 
                    style={styles.uploadChapterBtn}
                    onPress={() => handleUploadChapterSummary(topic.id)}
                    disabled={uploadingChapterId === topic.id}
                  >
                    {uploadingChapterId === topic.id ? (
                      <ActivityIndicator size="small" color="#FFFFFF" />
                    ) : (
                      <>
                        <Feather name="upload" size={12} color="#FFFFFF" style={{ marginRight: 4 }} />
                        <Text style={styles.uploadChapterBtnText}>
                          {(topic as any).workspace_template?.chapter_pdf_url ? 'Replace Notes' : 'Upload PDF'}
                        </Text>
                      </>
                    )}
                  </Pressable>
                </View>

                <View style={styles.subtopicsContainer}>
                  {topic.subtopics?.map((sub) => {
                    const subMins = calculateSubtopicMinutes(sub);
                    const subTimeStr = formatStudyTime(subMins, sub.estimated_time);

                    return (
                      <Pressable key={sub.id} style={styles.subtopicItem}>
                        <Feather name="file-text" size={16} color={colors.textSecondary} />
                        <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                          <Text style={styles.subtopicTitle}>{sub.title}</Text>
                          <Text style={{ fontSize: typography.sizes.xs, color: colors.textSecondary, marginLeft: spacing.sm }}>
                            <Feather name="clock" size={10} color={colors.textSecondary} /> {subTimeStr}
                          </Text>
                        </View>
                      </Pressable>
                    );
                  })}
                
                <Pressable 
                  style={styles.addSubtopicBtn}
                  onPress={() => {
                    setActiveTopicId(topic.id);
                    setAddSubtopicVisible(true);
                  }}
                >
                  <Feather name="plus" size={16} color={colors.textSecondary} />
                  <Text style={styles.addSubtopicText}>Add Subtopic</Text>
                </Pressable>
              </View>
            </View>
          );
        })
        )}
      </ScrollView>

      {/* Add Topic Modal */}
      <Modal
        visible={isAddTopicVisible}
        transparent={true}
        animationType="fade"
      >
        <KeyboardAvoidingView 
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Add New Topic</Text>
              <Pressable onPress={() => setAddTopicVisible(false)}>
                <Feather name="x" size={24} color={colors.textSecondary} />
              </Pressable>
            </View>
            
            <View style={styles.modalBody}>
              <Text style={styles.label}>Topic Title</Text>
              <TextInput
                style={styles.input}
                value={newTopicTitle}
                onChangeText={setNewTopicTitle}
                placeholder="e.g. Algebraic Fractions"
                placeholderTextColor={colors.textSecondary}
                autoFocus
              />

              <Pressable 
                style={[styles.primaryButton, addingTopic && { opacity: 0.7 }]}
                onPress={handleAddTopic}
                disabled={addingTopic}
              >
                {addingTopic ? (
                  <ActivityIndicator color={colors.background} />
                ) : (
                  <Text style={styles.primaryButtonText}>Save Topic</Text>
                )}
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Add Subtopic Modal */}
      <Modal
        visible={isAddSubtopicVisible}
        transparent={true}
        animationType="fade"
      >
        <KeyboardAvoidingView 
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Add New Subtopic</Text>
              <Pressable onPress={() => {
                setAddSubtopicVisible(false);
                setSelectedVideo(null);
              }}>
                <Feather name="x" size={24} color={colors.textSecondary} />
              </Pressable>
            </View>
            
            <ScrollView style={styles.modalBody} showsVerticalScrollIndicator={false}>
              <Text style={styles.label}>Subtopic Title</Text>
              <TextInput
                style={styles.input}
                value={newSubtopicTitle}
                onChangeText={setNewSubtopicTitle}
                placeholder="e.g. Solving quadratics by factoring"
                placeholderTextColor={colors.textSecondary}
              />

              <Text style={styles.label}>Difficulty</Text>
              <View style={{ flexDirection: 'row', gap: 8, marginBottom: spacing.md }}>
                {['Easy', 'Medium', 'Hard'].map((diff) => (
                  <Pressable 
                    key={diff}
                    style={[
                      styles.difficultyBtn, 
                      newSubtopicDifficulty === diff && { backgroundColor: colors.primary, borderColor: colors.primary }
                    ]}
                    onPress={() => setNewSubtopicDifficulty(diff)}
                  >
                    <Text style={[
                      styles.difficultyBtnText,
                      newSubtopicDifficulty === diff && { color: colors.background }
                    ]}>{diff}</Text>
                  </Pressable>
                ))}
              </View>

              <Text style={styles.label}>Course Video</Text>
              <Pressable style={styles.videoPickerBtn} onPress={handlePickVideo}>
                <Ionicons name={selectedVideo ? "checkmark-circle" : "videocam-outline"} size={24} color={colors.primary} />
                <Text style={styles.videoPickerText}>
                  {selectedVideo ? "Video Selected (Tap to change)" : "Upload Video from Gallery"}
                </Text>
              </Pressable>

              <Pressable 
                style={[styles.primaryButton, { marginTop: spacing.lg }, addingSubtopic && { opacity: 0.7 }]}
                onPress={handleAddSubtopic}
                disabled={addingSubtopic}
              >
                {addingSubtopic ? (
                  <ActivityIndicator color={colors.background} />
                ) : (
                  <Text style={styles.primaryButtonText}>Upload & Save</Text>
                )}
              </Pressable>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

    </View>
  );
}

const createStyles = (colors: any) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: spacing.xxxl,
    paddingBottom: spacing.lg,
    paddingHorizontal: spacing.xl,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.surface,
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'flex-start',
  },
  headerTitle: {
    fontSize: typography.sizes.lg,
    fontWeight: typography.weights.bold,
    color: colors.text,
  },
  scrollContent: {
    padding: spacing.xl,
    paddingBottom: spacing.xxxl,
  },
  courseHeaderCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    padding: spacing.xl,
    borderRadius: borderRadius.lg,
    borderWidth: 2,
    marginBottom: spacing.xxl,
  },
  courseIconContainer: {
    width: 56,
    height: 56,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
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
  courseTitle: {
    fontSize: typography.sizes.lg,
    fontWeight: typography.weights.bold,
    color: colors.text,
    marginTop: 2,
  },
  editButton: {
    padding: spacing.sm,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  sectionTitle: {
    fontSize: typography.sizes.lg,
    fontWeight: typography.weights.bold,
    color: colors.text,
  },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primaryLight,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.full,
    gap: 4,
  },
  addBtnText: {
    fontSize: typography.sizes.sm,
    fontWeight: typography.weights.semibold,
    color: colors.primary,
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
    marginTop: spacing.md,
  },
  emptyStateTitle: {
    fontSize: typography.sizes.lg,
    fontWeight: typography.weights.bold,
    color: colors.text,
    marginTop: spacing.md,
  },
  emptyStateSubtitle: {
    fontSize: typography.sizes.sm,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: 4,
    marginBottom: spacing.xl,
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
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: spacing.md,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  topicTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  topicNumberBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  topicNumberText: {
    fontSize: typography.sizes.sm,
    fontWeight: typography.weights.bold,
    color: colors.primary,
  },
  topicTitle: {
    fontSize: typography.sizes.md,
    fontWeight: typography.weights.semibold,
    color: colors.text,
    flex: 1,
  },
  subtopicsContainer: {
    padding: spacing.md,
    backgroundColor: colors.background,
  },
  subtopicItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    gap: spacing.sm,
  },
  subtopicTitle: {
    fontSize: typography.sizes.sm,
    color: colors.text,
  },
  addSubtopicBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    marginTop: spacing.xs,
    gap: spacing.sm,
  },
  addSubtopicText: {
    fontSize: typography.sizes.sm,
    color: colors.textSecondary,
    fontWeight: typography.weights.medium,
  },
  
  // Modal Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  modalContent: {
    backgroundColor: colors.background,
    borderRadius: borderRadius.lg,
    overflow: 'hidden',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: spacing.xl,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  modalTitle: {
    fontSize: typography.sizes.lg,
    fontWeight: typography.weights.bold,
    color: colors.text,
  },
  modalBody: {
    padding: spacing.xl,
  },
  label: {
    fontSize: typography.sizes.sm,
    fontWeight: typography.weights.medium,
    color: colors.text,
    marginBottom: spacing.xs,
  },
  input: {
    backgroundColor: colors.surfaceHighlight,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.sm,
    padding: spacing.md,
    color: colors.text,
    fontFamily: 'Outfit_400Regular',
    fontSize: typography.sizes.md,
    marginBottom: spacing.lg,
  },
  difficultyBtn: {
    flex: 1,
    paddingVertical: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.sm,
    alignItems: 'center',
  },
  difficultyBtnText: {
    fontFamily: 'Outfit_500Medium',
    color: colors.textSecondary,
    fontSize: typography.sizes.sm,
  },
  videoPickerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.primary,
    borderStyle: 'dashed',
    borderRadius: borderRadius.sm,
    backgroundColor: colors.primaryLight + '20',
    marginBottom: spacing.md,
  },
  videoPickerText: {
    fontFamily: 'Outfit_500Medium',
    color: colors.primary,
    fontSize: typography.sizes.sm,
  },
  primaryButton: {
    backgroundColor: colors.primary,
    paddingVertical: spacing.lg,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonText: {
    color: colors.background,
    fontSize: typography.sizes.md,
    fontWeight: typography.weights.semibold,
  },
  chapterSummaryBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
    marginHorizontal: 16,
    marginBottom: 10,
    borderRadius: 12,
    backgroundColor: colors.surfaceHighlight,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chapterSummaryInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 10,
  },
  chapterSummaryTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.text,
    fontFamily: 'Outfit_600SemiBold',
  },
  chapterSummarySub: {
    fontSize: 11,
    color: colors.textSecondary,
    marginTop: 1,
  },
  uploadChapterBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: colors.primary,
  },
  uploadChapterBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});
