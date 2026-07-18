import React, { useMemo, useState, useCallback, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, Alert, Platform, Modal, TextInput, Linking } from 'react-native';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { spacing, typography, borderRadius, useThemeColors } from '@/constants/theme';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as WebBrowser from 'expo-web-browser';
import { decode } from 'base64-arraybuffer';

const STATUS_COLORS: Record<string, string> = {
  'Not Started': '#9CA3AF',
  'In Progress': '#F59E0B',
  'Mastered': '#10B981',
  'Needs Revision': '#EF4444'
};

export default function TopicDetailScreen() {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuth();

  const [subtopic, setSubtopic] = useState<any>(null);
  const [materials, setMaterials] = useState<any[]>([]);
  const [questionsCount, setQuestionsCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Upload States
  const [uploading, setUploading] = useState(false);
  const [generatingAI, setGeneratingAI] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [uploadType, setUploadType] = useState<string>(''); // 'video', 'notes_text', 'notes_pdf', 'past_paper'
  const [noteText, setNoteText] = useState('');
  const isPickingRef = useRef(false);

  const fetchSubtopicData = async () => {
    if (!id || !user) return;
    setLoading(true);
    
    try {
      // Fetch Subtopic details
      const { data, error } = await supabase
        .from('subtopics')
        .select(`
          *,
          topics (
            title,
            courses (
              title
            )
          ),
          user_progress (status)
        `)
        .eq('id', id)
        .single();

      if (!error && data) {
        setSubtopic(data);
      }

      // Fetch subtopic materials
      const { data: materialsData, error: matError } = await supabase
        .from('subtopic_materials')
        .select('*')
        .eq('subtopic_id', id);

      if (!matError && materialsData) {
        setMaterials(materialsData);
      }

      // Fetch questions count
      const { count: qCount, error: qError } = await supabase
        .from('questions')
        .select('*', { count: 'exact', head: true })
        .eq('subtopic_id', id);

      if (!qError && qCount !== null) {
        setQuestionsCount(qCount);
      }

    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      fetchSubtopicData();
    }, [id, user])
  );

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (!subtopic) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>Topic not found.</Text>
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <Text style={styles.backButtonText}>Go Back</Text>
        </Pressable>
      </View>
    );
  }

  const parentTopic = subtopic.topics;
  const parentCourse = parentTopic?.courses;
  const status = subtopic.user_progress?.[0]?.status || 'Not Started';
  const isTeacher = user?.user_metadata?.role === 'teacher';

  // Find existing materials
  const videoMaterials = materials.filter(m => m.type === 'video');
  const pastPaperMaterials = materials.filter(m => m.type === 'past_paper');
  const notesMaterials = materials.filter(m => m.type === 'notes_text' || m.type === 'notes_pdf');

  const handleDeleteMaterial = async (materialId: string) => {
    Alert.alert(
      'Delete Material',
      'Are you sure you want to delete this material?',
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Delete', 
          style: 'destructive',
          onPress: async () => {
            try {
              setUploading(true);
              const { error } = await supabase.from('subtopic_materials').delete().eq('id', materialId);
              if (error) throw error;
              Alert.alert('Success', 'Material deleted.');
              fetchSubtopicData();
            } catch (err: any) {
              console.error(err);
              Alert.alert('Error', err.message);
            } finally {
              setUploading(false);
            }
          }
        }
      ]
    );
  };

  const handleAIGenerate = async () => {
    const pdfUrl = notesMaterials.find(m => m.type === 'notes_pdf')?.content_url;
    if (!pdfUrl) {
      Alert.alert('Missing Notes', 'Please upload a PDF study note first.');
      return;
    }

    try {
      setGeneratingAI(true);
      const { data, error } = await supabase.functions.invoke('generate-quiz', {
        body: { subtopic_id: subtopic.id, file_url: pdfUrl }
      });
      if (error) throw error;
      Alert.alert('AI Magic Complete ✨', data.message || 'Questions generated successfully!');
      fetchSubtopicData(); // Refresh the counts
    } catch (error: any) {
      console.error(error);
      Alert.alert('AI Generation Failed', error.message || 'Could not generate questions.');
    } finally {
      setGeneratingAI(false);
    }
  };

  const uploadFileToSupabase = async (fileUri: string, bucket: string, folder: string, mimeType: string) => {
    const fileExt = fileUri.split('.').pop() || (mimeType.includes('pdf') ? 'pdf' : 'mp4');
    const fileName = `${folder}/${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;

    let fileBody: any;
    
    if (Platform.OS === 'web') {
      const response = await fetch(fileUri);
      fileBody = await response.blob();
    } else {
      const base64 = await FileSystem.readAsStringAsync(fileUri, { encoding: 'base64' });
      fileBody = decode(base64);
    }

    const { error: uploadError } = await supabase.storage
      .from(bucket)
      .upload(fileName, fileBody, {
        contentType: mimeType,
        upsert: true
      });

    if (uploadError) throw uploadError;

    const { data: publicUrlData } = supabase.storage.from(bucket).getPublicUrl(fileName);
    return publicUrlData.publicUrl;
  };

  const handlePickFile = async (type: string) => {
    if (uploading) {
      Alert.alert('Please wait', 'An upload is already in progress.');
      return;
    }
    if (isPickingRef.current) {
      console.log('Already picking, ignoring tap');
      return;
    }
    
    try {
      isPickingRef.current = true;
      
      // Close modal if open
      setModalVisible(false);
      
      // Wait for modal to disappear to prevent native crashes
      await new Promise(resolve => setTimeout(resolve, 600));

      let mimeTypes = ['application/pdf'];
      let bucket = 'materials';
      let title = '';

      if (type === 'video') {
        mimeTypes = ['video/mp4', 'video/quicktime'];
        bucket = 'videos';
      }

      // Important fix for Android: Wait for the React Native Modal close animation 
      // to completely finish before launching the Native Android Intent. 
      // Opening an Intent during a Modal animation can permanently freeze the picker!
      await new Promise(resolve => setTimeout(resolve, 500));

      const result = await DocumentPicker.getDocumentAsync({
        type: mimeTypes,
        copyToCacheDirectory: true,
      });

      if (result.canceled || !result.assets || result.assets.length === 0) {
        isPickingRef.current = false; // explicitly reset here
        return;
      }

      setUploading(true);
      const asset = result.assets[0];
      
      const fileUrl = await uploadFileToSupabase(asset.uri, bucket, subtopic.id, asset.mimeType || mimeTypes[0]);

      // Save to database
      const { error: dbError } = await supabase
        .from('subtopic_materials')
        .insert({
          subtopic_id: subtopic.id,
          type: type,
          title: asset.name || (type === 'video' ? 'Video Lesson' : type === 'past_paper' ? 'Past Paper' : 'Study Notes'),
          content_url: fileUrl
        });

      if (dbError) throw dbError;

      Alert.alert('Success', `${title} uploaded successfully!`);
      fetchSubtopicData();

    } catch (error: any) {
      console.error(error);
      Alert.alert('Upload Failed', error.message);
    } finally {
      setUploading(false);
      isPickingRef.current = false;
    }
  };

  const handleSaveTextNotes = async () => {
    if (!noteText.trim()) {
      Alert.alert('Error', 'Please enter some notes before saving.');
      return;
    }

    try {
      setUploading(true);

      const { error: dbError } = await supabase
        .from('subtopic_materials')
        .insert({
          subtopic_id: subtopic.id,
          type: 'notes_text',
          title: `Study Notes - ${new Date().toLocaleDateString()}`,
          content_text: noteText
        });

      if (dbError) throw dbError;

      Alert.alert('Success', 'Study notes saved successfully!');
      setModalVisible(false);
      setNoteText('');
      fetchSubtopicData();
    } catch (error: any) {
      console.error(error);
      Alert.alert('Save Failed', error.message);
    } finally {
      setUploading(false);
    }
  };

  const openUploadModal = (type: string) => {
    setUploadType(type);
    if (type === 'notes_text') {
      const existingText = materials.find(m => m.type === 'notes_text')?.content_text || '';
      setNoteText(existingText);
    }
    setModalVisible(true);
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Header */}
      <Pressable onPress={() => router.back()} style={styles.backNav}>
        <Feather name="arrow-left" size={24} color={colors.text} />
      </Pressable>

      <View style={styles.header}>
        <View style={styles.breadcrumb}>
          <Text style={styles.breadcrumbText}>{parentCourse?.title} • {parentTopic?.title}</Text>
        </View>
        <Text style={styles.title}>{subtopic.title}</Text>
        
        <View style={styles.metaRow}>
          <View style={[styles.statusBadge, { backgroundColor: STATUS_COLORS[status] || STATUS_COLORS['Not Started'] }]}>
            <Text style={styles.statusText}>{status}</Text>
          </View>
          <View style={styles.metaItem}>
            <Feather name="clock" size={14} color={colors.textSecondary} />
            <Text style={styles.metaText}>{subtopic.estimated_time}</Text>
          </View>
        </View>
      </View>

      {uploading && (
        <View style={{ marginBottom: spacing.md, flexDirection: 'row', alignItems: 'center' }}>
          <ActivityIndicator size="small" color={colors.primary} />
          <Text style={{ marginLeft: spacing.sm, color: colors.primary, fontWeight: 'bold' }}>Uploading material...</Text>
        </View>
      )}

      {/* Action Cards */}
      <View style={styles.grid}>
        
        {/* Video Lessons */}
        <View style={styles.categoryCard}>
          <View style={styles.categoryHeader}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
              <View style={[styles.categoryIcon, { backgroundColor: 'rgba(59, 130, 246, 0.1)' }]}>
                <Feather name="play-circle" size={20} color="#3B82F6" />
              </View>
              <Text style={styles.categoryTitle}>Video Lessons</Text>
            </View>
            {isTeacher && (
              <Pressable style={styles.categoryAddButton} onPress={() => handlePickFile('video')}>
                <Feather name="plus" size={16} color={colors.background} />
              </Pressable>
            )}
          </View>
          {videoMaterials.length === 0 ? (
            <Text style={styles.emptyText}>{isTeacher ? 'No videos uploaded' : 'Coming soon'}</Text>
          ) : (
            videoMaterials.map(mat => (
              <View key={mat.id} style={styles.materialRow}>
                <Pressable style={styles.materialRowContent} onPress={() => WebBrowser.openBrowserAsync(mat.content_url)}>
                  <Feather name="film" size={16} color={colors.textSecondary} />
                  <Text style={styles.materialTitle} numberOfLines={1}>{mat.title}</Text>
                </Pressable>
                {isTeacher && (
                  <Pressable style={styles.deleteButton} onPress={() => handleDeleteMaterial(mat.id)}>
                    <Feather name="trash-2" size={16} color={colors.error} />
                  </Pressable>
                )}
              </View>
            ))
          )}
        </View>

        {/* Study Notes */}
        <View style={styles.categoryCard}>
          <View style={styles.categoryHeader}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
              <View style={[styles.categoryIcon, { backgroundColor: 'rgba(16, 185, 129, 0.1)' }]}>
                <Feather name="file-text" size={20} color="#10B981" />
              </View>
              <Text style={styles.categoryTitle}>Study Notes</Text>
            </View>
            {isTeacher && (
              <Pressable style={[styles.categoryAddButton, { backgroundColor: '#10B981' }]} onPress={() => openUploadModal('notes_picker')}>
                <Feather name="plus" size={16} color={colors.background} />
              </Pressable>
            )}
          </View>
          {notesMaterials.length === 0 ? (
            <Text style={styles.emptyText}>{isTeacher ? 'No notes added' : 'Coming soon'}</Text>
          ) : (
            notesMaterials.map(mat => (
              <View key={mat.id} style={styles.materialRow}>
                <Pressable 
                  style={styles.materialRowContent} 
                  onPress={() => {
                    if (mat.type === 'notes_pdf' && mat.content_url) {
                      WebBrowser.openBrowserAsync(mat.content_url);
                    } else if (mat.type === 'notes_text') {
                      Alert.alert('Study Notes', mat.content_text || 'No content');
                    }
                  }}
                >
                  <Feather name={mat.type === 'notes_pdf' ? 'file' : 'align-left'} size={16} color={colors.textSecondary} />
                  <Text style={styles.materialTitle} numberOfLines={1}>{mat.title}</Text>
                </Pressable>
                {isTeacher && (
                  <Pressable style={styles.deleteButton} onPress={() => handleDeleteMaterial(mat.id)}>
                    <Feather name="trash-2" size={16} color={colors.error} />
                  </Pressable>
                )}
              </View>
            ))
          )}
        </View>

        {/* Interactive Quiz */}
        <View style={styles.categoryCard}>
          <View style={styles.categoryHeader}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
              <View style={[styles.categoryIcon, { backgroundColor: 'rgba(245, 158, 11, 0.1)' }]}>
                <Feather name="check-circle" size={20} color="#F59E0B" />
              </View>
              <View>
                <Text style={styles.categoryTitle}>Interactive Quiz</Text>
                <Text style={{ fontSize: typography.sizes.xs, color: colors.textSecondary }}>{questionsCount} Questions</Text>
              </View>
            </View>
            <View style={{ flexDirection: 'row', gap: spacing.sm }}>
              <Pressable style={[styles.categoryAddButton, { backgroundColor: '#F59E0B', opacity: questionsCount > 0 ? 1 : 0.5 }]} onPress={() => questionsCount > 0 ? router.push(`/quiz/${subtopic.id}`) : null}>
                <Feather name="play" size={16} color={colors.background} />
              </Pressable>
              {isTeacher && (
                <Pressable style={[styles.categoryAddButton, { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }]} onPress={() => router.push(`/topic/${subtopic.id}/quiz-editor`)}>
                  <Feather name="settings" size={16} color={colors.text} />
                </Pressable>
              )}
            </View>
          </View>
          
          {isTeacher && questionsCount === 0 && (
            <View style={{ marginTop: spacing.xs }}>
              {notesMaterials.some(m => m.type === 'notes_pdf') ? (
                <Pressable 
                  style={[styles.aiButton, generatingAI && { opacity: 0.7 }]} 
                  onPress={handleAIGenerate}
                  disabled={generatingAI}
                >
                  {generatingAI ? (
                    <ActivityIndicator size="small" color="#FFF" />
                  ) : (
                    <>
                      <Feather name="zap" size={16} color="#FFF" />
                      <Text style={styles.aiButtonText}>Auto-Generate Quiz with AI</Text>
                    </>
                  )}
                </Pressable>
              ) : (
                <Text style={styles.emptyText}>Upload PDF notes above to auto-generate a quiz!</Text>
              )}
            </View>
          )}
        </View>

        {/* Past Papers */}
        <View style={styles.categoryCard}>
          <View style={styles.categoryHeader}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
              <View style={[styles.categoryIcon, { backgroundColor: 'rgba(139, 92, 246, 0.1)' }]}>
                <MaterialCommunityIcons name="book-open-variant" size={20} color="#8B5CF6" />
              </View>
              <Text style={styles.categoryTitle}>Past Papers</Text>
            </View>
            {isTeacher && (
              <Pressable style={[styles.categoryAddButton, { backgroundColor: '#8B5CF6' }]} onPress={() => handlePickFile('past_paper')}>
                <Feather name="plus" size={16} color={colors.background} />
              </Pressable>
            )}
          </View>
          {pastPaperMaterials.length === 0 ? (
            <Text style={styles.emptyText}>{isTeacher ? 'No past papers' : 'Coming soon'}</Text>
          ) : (
            pastPaperMaterials.map(mat => (
              <View key={mat.id} style={styles.materialRow}>
                <Pressable style={styles.materialRowContent} onPress={() => WebBrowser.openBrowserAsync(mat.content_url)}>
                  <Feather name="file-text" size={16} color={colors.textSecondary} />
                  <Text style={styles.materialTitle} numberOfLines={1}>{mat.title}</Text>
                </Pressable>
                {isTeacher && (
                  <Pressable style={styles.deleteButton} onPress={() => handleDeleteMaterial(mat.id)}>
                    <Feather name="trash-2" size={16} color={colors.error} />
                  </Pressable>
                )}
              </View>
            ))
          )}
        </View>
      </View>



      {/* Upload/Type Notes Modal */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={modalVisible}
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.background }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Manage Study Notes</Text>
              <Pressable onPress={() => setModalVisible(false)}>
                <Feather name="x" size={24} color={colors.text} />
              </Pressable>
            </View>

            {uploadType === 'notes_picker' && (
              <View style={{ gap: spacing.md }}>
                <Text style={{ color: colors.textSecondary, marginBottom: spacing.sm }}>
                  Choose how you want to provide study notes for this topic.
                </Text>
                
                <Pressable 
                  style={styles.modalOptionButton}
                  onPress={() => setUploadType('notes_text')}
                >
                  <Feather name="edit-3" size={20} color={colors.primary} />
                  <Text style={[styles.modalOptionText, { color: colors.text }]}>Type Notes (Text)</Text>
                </Pressable>

                <Pressable 
                  style={styles.modalOptionButton}
                  onPress={() => handlePickFile('notes_pdf')}
                >
                  <Feather name="upload-cloud" size={20} color={colors.primary} />
                  <Text style={[styles.modalOptionText, { color: colors.text }]}>Upload PDF Document</Text>
                </Pressable>
              </View>
            )}

            {uploadType === 'notes_text' && (
              <View style={{ flex: 1 }}>
                <TextInput
                  style={[styles.textArea, { color: colors.text, borderColor: colors.border }]}
                  placeholder="Type your study notes here... (Markdown supported)"
                  placeholderTextColor={colors.textTertiary}
                  multiline
                  textAlignVertical="top"
                  value={noteText}
                  onChangeText={setNoteText}
                />
                <Pressable style={[styles.primaryButton, { backgroundColor: colors.primary }]} onPress={handleSaveTextNotes}>
                  <Text style={styles.primaryButtonText}>Save Notes</Text>
                </Pressable>
              </View>
            )}
          </View>
        </View>
      </Modal>

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
    marginBottom: spacing.xxl,
  },
  breadcrumb: {
    marginBottom: spacing.xs,
  },
  breadcrumbText: {
    fontSize: typography.sizes.sm,
    color: colors.textTertiary,
    fontWeight: typography.weights.medium,
    textTransform: 'uppercase',
  },
  title: {
    fontSize: typography.sizes.xxl,
    fontWeight: typography.weights.bold,
    color: colors.text,
    marginBottom: spacing.md,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  statusBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: borderRadius.sm,
  },
  statusText: {
    fontSize: typography.sizes.xs,
    color: '#FFF',
    fontWeight: typography.weights.bold,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  metaText: {
    fontSize: typography.sizes.sm,
    color: colors.textSecondary,
    fontWeight: typography.weights.medium,
  },
  grid: {
    gap: spacing.md,
    marginBottom: spacing.xxl,
  },
  categoryCard: {
    backgroundColor: colors.surface,
    padding: spacing.lg,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  categoryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  categoryIcon: {
    width: 36,
    height: 36,
    borderRadius: borderRadius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  categoryTitle: {
    fontSize: typography.sizes.md,
    fontWeight: typography.weights.bold,
    color: colors.text,
  },
  categoryAddButton: {
    backgroundColor: colors.primary,
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    fontSize: typography.sizes.sm,
    color: colors.textTertiary,
    fontStyle: 'italic',
  },
  materialRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  materialRowContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  materialTitle: {
    fontSize: typography.sizes.sm,
    color: colors.text,
    flex: 1,
  },
  deleteButton: {
    padding: spacing.xs,
  },
  aiButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#8B5CF6', // Purple for AI
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.md,
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  aiButtonText: {
    color: '#FFF',
    fontSize: typography.sizes.sm,
    fontWeight: typography.weights.bold,
  },
  aiCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primaryLight,
    padding: spacing.lg,
    borderRadius: borderRadius.lg,
    gap: spacing.md,
  },
  aiIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  aiInfo: {
    flex: 1,
  },
  aiTitle: {
    fontSize: typography.sizes.md,
    fontWeight: typography.weights.bold,
    color: colors.text,
  },
  aiSubtitle: {
    fontSize: typography.sizes.sm,
    color: colors.textSecondary,
    marginTop: 2,
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
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    borderTopLeftRadius: borderRadius.xl,
    borderTopRightRadius: borderRadius.xl,
    padding: spacing.xl,
    paddingBottom: spacing.xxxl,
    minHeight: 300,
    maxHeight: '80%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  modalTitle: {
    fontSize: typography.sizes.lg,
    fontWeight: typography.weights.bold,
    color: '#1F2937',
  },
  modalOptionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: borderRadius.md,
    gap: spacing.md,
  },
  modalOptionText: {
    fontSize: typography.sizes.md,
    fontWeight: typography.weights.medium,
  },
  textArea: {
    flex: 1,
    borderWidth: 1,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    fontSize: typography.sizes.md,
    minHeight: 200,
    marginBottom: spacing.lg,
  },
  primaryButton: {
    padding: spacing.md,
    borderRadius: borderRadius.md,
    alignItems: 'center',
  },
  primaryButtonText: {
    color: '#FFF',
    fontSize: typography.sizes.md,
    fontWeight: typography.weights.bold,
  },
});
