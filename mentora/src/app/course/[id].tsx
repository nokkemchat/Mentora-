import React, { useMemo, useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, LayoutAnimation, UIManager, Platform, ActivityIndicator, Alert, Linking, Image, Modal, RefreshControl, Animated, TextInput } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { useAppTheme } from '@/context/ThemeContext';
import { BlurView } from 'expo-blur';
import { spacing, typography, borderRadius, useThemeColors } from '@/constants/theme';
import { Feather, MaterialCommunityIcons, Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as WebBrowser from 'expo-web-browser';
import { LinearGradient } from 'expo-linear-gradient';
import { decode } from 'base64-arraybuffer';
import { calculateSubtopicMinutes, calculateTopicMinutes, formatStudyTime } from '@/lib/time';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getSubjectVisuals } from '@/lib/subjectVisuals';
import { 
  getCachedCourseSync, 
  getCachedCourse, 
  setCachedCourse, 
  resolveCourseId, 
  registerCourseAlias 
} from '@/lib/courseCache';

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
  const { isDark } = useAppTheme();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const { id: rawId } = useLocalSearchParams<{ id: string }>();
  const id = useMemo(() => resolveCourseId(rawId || ''), [rawId]);
  const router = useRouter();
  const { user } = useAuth();
  
  // 0ms instant display from memory cache
  const [course, setCourse] = useState<any>(() => (id ? getCachedCourseSync(id) : null));
  const [loading, setLoading] = useState(() => !(id && getCachedCourseSync(id)));
  const [expandedTopicId, setExpandedTopicId] = useState<string | null>(() => {
    if (!id) return null;
    const initial = getCachedCourseSync(id);
    if (initial?.topics && initial.topics.length > 0) {
      const sorted = [...initial.topics].sort((a: any, b: any) => {
        const orderA = a.order_index ?? a.workspace_template?.order_index ?? 0;
        const orderB = b.order_index ?? b.workspace_template?.order_index ?? 0;
        return orderA - orderB;
      });
      return sorted[0].id;
    }
    return null;
  });
  const [expandedSubtopicId, setExpandedSubtopicId] = useState<string | null>(null);
  const [lastStudiedChapter, setLastStudiedChapter] = useState<{
    topicId: string;
    topicTitle: string;
    subtopicId?: string;
    subtopicTitle?: string;
    form?: string | null;
  } | null>(null);
  const [activeNoteTextModal, setActiveNoteTextModal] = useState<{ title: string; content: string; subtopicId?: string } | null>(null);
  const [uploadingSyllabus, setUploadingSyllabus] = useState(false);
  const [hasSubscription, setHasSubscription] = useState(false);
  const [teachers, setTeachers] = useState<any[]>([]);
  const [pastPapers, setPastPapers] = useState<any[]>([]);
  const [selectedForm, setSelectedForm] = useState<string>('All');
  const [refreshing, setRefreshing] = useState(false);

  // Animated sticky search & header on scroll
  const scrollY = useRef(new Animated.Value(0)).current;
  const isScrolledRef = useRef(false);
  const [isScrolled, setIsScrolled] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const searchInputRef = useRef<TextInput>(null);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchCourseData();
    setRefreshing(false);
  };

  const extractSubtopicMaterials = (subtopic: any): any[] => {
    const list: any[] = [];
    if (Array.isArray(subtopic.subtopic_materials)) {
      list.push(...subtopic.subtopic_materials);
    }
    let tmpl = subtopic.workspace_template;
    if (typeof tmpl === 'string') {
      try { tmpl = JSON.parse(tmpl); } catch (e) { tmpl = null; }
    }
    if (tmpl) {
      const contentArr = tmpl.content || [];
      if (contentArr.length === 0 && tmpl.placeholders) {
        Object.keys(tmpl.placeholders).forEach(key => {
          const files = tmpl.placeholders[key];
          if (Array.isArray(files)) {
            files.forEach((f: any) => {
              contentArr.push({ ...f, type: key });
            });
          }
        });
      }
      contentArr.forEach((file: any) => {
        if (!file.url) return;
        if (list.some(m => m.content_url === file.url || m.id === file.url)) return;
        let type = 'notes_pdf';
        if (file.type === 'videos') type = 'video';
        else if (file.type === 'past_papers') type = 'past_paper';
        list.push({
          id: file.url,
          subtopic_id: subtopic.id,
          type: type,
          title: file.display_name || file.file_name || 'Study Resource',
          content_url: file.url,
          estimated_minutes: file.size ? Math.max(5, Math.ceil(file.size / (1024 * 1024 * 2))) : 5,
        });
      });
    }
    return list;
  };

  const getTopicForm = (topic: any): string | null => {
    if (topic.form) return topic.form;
    if (topic.workspace_template?.form) return topic.workspace_template.form;
    const title = (topic.title || '').trim();
    if (/form\s*3/i.test(title)) return 'Form 3';
    if (/form\s*4/i.test(title)) return 'Form 4';
    if (/form\s*1/i.test(title)) return 'Form 1';
    if (/form\s*2/i.test(title)) return 'Form 2';
    if (/form\s*5/i.test(title)) return 'Form 5';
    if (/form\s*6/i.test(title)) return 'Form 6';
    return null;
  };

  const availableForms = useMemo(() => {
    const forms = new Set<string>();

    if (course?.available_forms && Array.isArray(course.available_forms) && course.available_forms.length > 0) {
      course.available_forms.forEach((f: string) => forms.add(f));
    }
    if (course?.workspace_template?.available_forms && Array.isArray(course.workspace_template.available_forms)) {
      course.workspace_template.available_forms.forEach((f: string) => forms.add(f));
    }
    if (course?.topics) {
      course.topics.forEach((t: any) => {
        const f = getTopicForm(t);
        if (f) forms.add(f);
      });
    }

    if (forms.size === 0 && course?.board === 'ZIMSEC') {
      return ['Form 3', 'Form 4'];
    }

    return Array.from(forms).sort();
  }, [course]);

  const filteredTopics = useMemo(() => {
    if (!course?.topics) return [];
    const list = selectedForm === 'All'
      ? course.topics
      : course.topics.filter((t: any) => getTopicForm(t) === selectedForm);
    const sorted = [...list].sort((a: any, b: any) => {
      const orderA = a.order_index ?? a.workspace_template?.order_index ?? 0;
      const orderB = b.order_index ?? b.workspace_template?.order_index ?? 0;
      return orderA - orderB;
    });

    let result = sorted.map((t: any, idx: number) => ({
      ...t,
      chapterNumber: idx + 1,
    }));

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim();
      result = result.filter((t: any) => {
        const titleMatch = (t.title || '').toLowerCase().includes(query);
        const descMatch = (t.description || '').toLowerCase().includes(query);
        const subtopicMatch = (t.subtopics || []).some((st: any) => 
          (st.title || '').toLowerCase().includes(query) ||
          (st.description || '').toLowerCase().includes(query)
        );
        return titleMatch || descMatch || subtopicMatch;
      });
    }

    return result;
  }, [course?.topics, selectedForm, searchQuery]);

  // Auto-expand matching chapter when searching
  useEffect(() => {
    if (searchQuery.trim() && filteredTopics.length > 0) {
      const query = searchQuery.toLowerCase().trim();
      const firstMatch = filteredTopics.find((t: any) => {
        const titleMatch = (t.title || '').toLowerCase().includes(query);
        const subtopicMatch = (t.subtopics || []).some((st: any) => 
          (st.title || '').toLowerCase().includes(query)
        );
        return titleMatch || subtopicMatch;
      });
      if (firstMatch) {
        setExpandedTopicId(firstMatch.id);
      }
    }
  }, [searchQuery, filteredTopics]);

  const orderedTopics = useMemo(() => {
    if (!filteredTopics || filteredTopics.length === 0) return [];
    if (searchQuery.trim()) return filteredTopics;
    if (!lastStudiedChapter?.topicId) return filteredTopics;

    const activeIdx = filteredTopics.findIndex((t: any) => t.id === lastStudiedChapter.topicId);
    if (activeIdx <= 0) return filteredTopics;

    const activeTopic = filteredTopics[activeIdx];
    const otherTopics = filteredTopics.filter((_: any, idx: number) => idx !== activeIdx);
    return [activeTopic, ...otherTopics];
  }, [filteredTopics, lastStudiedChapter, searchQuery]);

  const fetchCourseData = async () => {
    if (!id) return;
    // Only show full-screen loader if there is NO cached data at all
    if (!course) {
      const cached = await getCachedCourse(id);
      if (cached) {
        setCourse(cached);
        setLoading(false);
      } else {
        setLoading(true);
      }
    }

    try {
      let { data, error } = await supabase
        .from('courses')
        .select(`
          *,
          topics (
            *,
            subtopics (
              *,
              user_progress (status),
              subtopic_materials (*),
              questions (id)
            )
          )
        `)
        .eq('id', id)
        .single();

      // Resilient fallback: If session token skew causes JWT error, fetch directly via public REST endpoint
      if (error) {
        console.warn('Primary course query error, trying REST fallback:', error.message);
        try {
          const fallbackResp = await fetch(
            `https://akjbejexhdawelrfygub.supabase.co/rest/v1/courses?select=*,topics(*,subtopics(*,user_progress(status),subtopic_materials(*),questions(id)))&id=eq.${id}`,
            {
              headers: {
                'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFramJlamV4aGRhd2VscmZ5Z3ViIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ3MjAwMTgsImV4cCI6MjEwMDI5NjAxOH0.L2t-AiTbkMOtadI6rNVII9QZ9qLVZqD3ep9ekHqvI7Y',
                'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFramJlamV4aGRhd2VscmZ5Z3ViIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ3MjAwMTgsImV4cCI6MjEwMDI5NjAxOH0.L2t-AiTbkMOtadI6rNVII9QZ9qLVZqD3ep9ekHqvI7Y'
              }
            }
          );
          if (fallbackResp.ok) {
            const arr = await fallbackResp.json();
            if (Array.isArray(arr) && arr.length > 0) {
              data = arr[0];
              error = null;
            }
          }
        } catch (_) {}
      }

      // If data was found but has 0 topics, check if an active course exists for the same title/subject
      if (data && (!data.topics || data.topics.length === 0) && data.title) {
        try {
          const { data: siblings } = await supabase
            .from('courses')
            .select(`
              *,
              topics (
                *,
                subtopics (
                  *,
                  user_progress (status),
                  subtopic_materials (*),
                  questions (id)
                )
              )
            `)
            .ilike('title', data.title)
            .neq('id', id);

          if (siblings && siblings.length > 0) {
            const withTopics = siblings.filter((s: any) => s.topics && s.topics.length > 0);
            if (withTopics.length > 0) {
              withTopics.sort((a: any, b: any) => b.topics.length - a.topics.length);
              const bestSibling = withTopics[0];
              registerCourseAlias(id, bestSibling.id);
              data = { ...data, ...bestSibling };
            }
          }
        } catch (_) {}
      }

      if (data) {
        setCourse((prev: any) => {
          // Never overwrite existing topics with an empty list
          if (prev?.topics?.length > 0 && (!data.topics || data.topics.length === 0)) {
            return { ...data, topics: prev.topics };
          }
          return data;
        });

        // Cache persistently to memory and AsyncStorage
        await setCachedCourse(id, data);
        if (data.id && data.id !== id) {
          await setCachedCourse(data.id, data);
        }

        if (data.topics && data.topics.length > 0) {
          const sorted = [...data.topics].sort((a: any, b: any) => {
            const orderA = a.order_index ?? a.workspace_template?.order_index ?? 0;
            const orderB = b.order_index ?? b.workspace_template?.order_index ?? 0;
            return orderA - orderB;
          });
          setExpandedTopicId(prev => prev || sorted[0].id);
        }
      }

      setHasSubscription(true);

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
        
        // Fetch past papers matching subject and board
        const { data: papersData } = await supabase
          .from('papers')
          .select('*')
          .ilike('subject', data.title)
          .ilike('curriculum', data.board);
          
        if (papersData) {
          setPastPapers(papersData);
        }
      }
    } catch (err) {
      console.warn('fetchCourseData error:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!id) return;
    let isMounted = true;

    async function initializeCourse() {
      // 1. If not yet in memory state, check persistent local storage immediately
      if (!course) {
        const cached = await getCachedCourse(id);
        if (cached && isMounted) {
          setCourse(cached);
          setLoading(false);
          if (cached.topics && cached.topics.length > 0) {
            const sorted = [...cached.topics].sort((a: any, b: any) => {
              const orderA = a.order_index ?? a.workspace_template?.order_index ?? 0;
              const orderB = b.order_index ?? b.workspace_template?.order_index ?? 0;
              return orderA - orderB;
            });
            setExpandedTopicId(prev => prev || sorted[0].id);
          }
        }
      }
      // 2. Fetch/revalidate silently in background
      await fetchCourseData();
    }

    initializeCourse();

    return () => {
      isMounted = false;
    };
  }, [id, user]);

  useEffect(() => {
    async function loadLastChapter() {
      if (!id) return;
      try {
        const stored = await AsyncStorage.getItem(`@last_chapter_${id}`);
        if (stored) {
          const parsed = JSON.parse(stored);
          if (parsed?.topicId) {
            setLastStudiedChapter(parsed);
            if (parsed.subtopicId) {
              setExpandedSubtopicId(parsed.subtopicId);
            }
            return;
          }
        }
      } catch (e) {
        console.warn('Failed to load last chapter:', e);
      }

      if (course?.topics && course.topics.length > 0) {
        for (const t of course.topics) {
          const inProgressSub = (t.subtopics || []).find((st: any) => st.user_progress?.[0]?.status === 'In Progress');
          if (inProgressSub) {
            setLastStudiedChapter({
              topicId: t.id,
              topicTitle: t.title,
              subtopicId: inProgressSub.id,
              subtopicTitle: inProgressSub.title,
              form: getTopicForm(t)
            });
            setExpandedSubtopicId(inProgressSub.id);
            return;
          }
        }
        const firstTopic = course.topics[0];
        const firstSub = firstTopic.subtopics?.[0];
        setLastStudiedChapter({
          topicId: firstTopic.id,
          topicTitle: firstTopic.title,
          subtopicId: firstSub?.id,
          subtopicTitle: firstSub?.title,
          form: getTopicForm(firstTopic)
        });
        if (firstSub?.id) {
          setExpandedSubtopicId(firstSub.id);
        }
      }
    }

    if (course) {
      loadLastChapter();
    }
  }, [id, course]);

  const recordLastStudied = async (topic: any, subtopic?: any) => {
    try {
      const data = {
        topicId: topic.id,
        topicTitle: topic.title,
        subtopicId: subtopic?.id,
        subtopicTitle: subtopic?.title,
        form: getTopicForm(topic),
        updatedAt: Date.now()
      };
      setLastStudiedChapter(data);
      await AsyncStorage.setItem(`@last_chapter_${id}`, JSON.stringify(data));
    } catch (err) {
      console.warn('Failed to save last studied chapter:', err);
    }
  };

  const handleToggleSubtopicStatus = async (subtopic: any) => {
    if (!user) {
      Alert.alert('Sign In Required', 'Please sign in to save your study progress.');
      return;
    }
    const currentStatus = subtopic.user_progress?.[0]?.status || 'Not Started';
    const newStatus = currentStatus === 'Mastered' ? 'In Progress' : 'Mastered';
    
    setCourse((prev: any) => {
      if (!prev) return prev;
      return {
        ...prev,
        topics: (prev.topics || []).map((t: any) => ({
          ...t,
          subtopics: (t.subtopics || []).map((st: any) => {
            if (st.id === subtopic.id) {
              return {
                ...st,
                user_progress: [{ status: newStatus }]
              };
            }
            return st;
          })
        }))
      };
    });

    try {
      const { data: existing } = await supabase
        .from('user_progress')
        .select('id')
        .eq('user_id', user.id)
        .eq('subtopic_id', subtopic.id)
        .maybeSingle();

      if (existing) {
        await supabase
          .from('user_progress')
          .update({ status: newStatus, updated_at: new Date().toISOString() })
          .eq('id', existing.id);
      } else {
        await supabase
          .from('user_progress')
          .insert({
            user_id: user.id,
            subtopic_id: subtopic.id,
            status: newStatus
          });
      }
    } catch (err) {
      console.warn('Failed to update progress in db:', err);
    }
  };

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
        let errorMessage = processError.message;
        try {
          if (processError.context && typeof processError.context.json === 'function') {
             const errJson = await processError.context.json();
             if (errJson && errJson.error) {
               errorMessage = errJson.error;
             }
          }
        } catch (e) {}
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

  const [uploadingChapterId, setUploadingChapterId] = useState<string | null>(null);

  const handleViewChapterNotes = (topic: any) => {
    let tmpl = topic.workspace_template;
    if (typeof tmpl === 'string') {
      try { tmpl = JSON.parse(tmpl); } catch (e) { tmpl = null; }
    }
    const pdfUrl = tmpl?.chapter_pdf_url;
    if (pdfUrl) {
      WebBrowser.openBrowserAsync(pdfUrl);
      return;
    }
    if (tmpl?.chapter_notes_text) {
      setActiveNoteTextModal({
        title: `${topic.title} - Notes`,
        content: tmpl.chapter_notes_text
      });
    }
  };

  const handleUploadChapterDocument = async (topicId: string) => {
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

      // Update topic workspace_template
      const topic = course?.topics?.find((t: any) => t.id === topicId);
      let existingTemplate = topic?.workspace_template;
      if (typeof existingTemplate === 'string') {
        try { existingTemplate = JSON.parse(existingTemplate); } catch (e) { existingTemplate = {}; }
      } else if (!existingTemplate || typeof existingTemplate !== 'object') {
        existingTemplate = {};
      }

      const updatedTemplate = {
        ...existingTemplate,
        chapter_pdf_url: fileUrl,
        chapter_pdf_name: asset.name || 'Chapter Summary Notes.pdf'
      };

      const { error: dbError } = await supabase
        .from('topics')
        .update({ workspace_template: updatedTemplate })
        .eq('id', topicId);

      if (dbError) throw dbError;

      Alert.alert('Success', 'Chapter summary notes uploaded successfully!');
      fetchCourseData();
    } catch (err: any) {
      Alert.alert('Upload Failed', err.message || 'Could not upload document');
    } finally {
      setUploadingChapterId(null);
    }
  };

  const handleOpenTopicContent = (topic: any, subtopic: any) => {
    recordLastStudied(topic, subtopic);

    if (!hasSubscription && user?.user_metadata?.role !== 'teacher') {
      Alert.alert('Enrollment Required', 'Please enroll in this course to access interactive lessons & practice questions.', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Enroll Now', onPress: () => router.push(`/checkout/${course.id}`) }
      ]);
      return;
    }

    const subMaterials = extractSubtopicMaterials(subtopic);
    const videoMaterial = subMaterials.find((m: any) => m.type === 'video');
    const noteMaterial = subMaterials.find((m: any) => m.type === 'notes_text' || m.type === 'notes_pdf');
    const questionsCount = subtopic.questions?.length || 0;

    if (questionsCount > 0) {
      router.push(`/quiz/${subtopic.id}`);
      return;
    } 
    
    if (videoMaterial?.content_url) {
      WebBrowser.openBrowserAsync(videoMaterial.content_url);
      return;
    } 
    
    if (noteMaterial?.content_url) {
      WebBrowser.openBrowserAsync(noteMaterial.content_url);
      return;
    }

    // Directly open the study notes / revision viewer modal
    const notesContent = noteMaterial?.content_text || subtopic.notes_content || subtopic.description ||
      `# ${subtopic.title}\n\nKey Concepts & Objectives:\n• Master the core definitions, formulas, and practical experiments related to ${subtopic.title}.\n• Understand key examination marking schemes and step-by-step problem-solving methods.\n\n### Syllabus Summary\nReview the fundamentals and practice past exam problems to achieve mastery in this unit.`;

    setActiveNoteTextModal({
      title: subtopic.title,
      content: notesContent,
      subtopicId: subtopic.id,
    });
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
      <View style={[styles.centered, { paddingHorizontal: 24, gap: 12 }]}>
        <MaterialCommunityIcons name="book-open-page-variant-outline" size={48} color={colors.textTertiary} />
        <Text style={[styles.errorText, { marginBottom: 4, textAlign: 'center', fontWeight: '700' }]}>Course Not Found</Text>
        <Text style={{ fontSize: 13, color: colors.textSecondary, textAlign: 'center', marginBottom: 12 }}>
          We couldn't load this subject right now. Please check your connection and try again.
        </Text>
        <View style={{ flexDirection: 'row', gap: 12 }}>
          <Pressable 
            onPress={() => {
              setLoading(true);
              fetchCourseData();
            }} 
            style={[styles.backButton, { backgroundColor: colors.primary }]}
          >
            <Text style={styles.backButtonText}>Retry</Text>
          </Pressable>
          <Pressable 
            onPress={() => router.canGoBack() ? router.back() : router.replace('/(tabs)')} 
            style={[styles.backButton, { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border }]}
          >
            <Text style={[styles.backButtonText, { color: colors.text }]}>Go Back</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  const toggleTopic = (topicId: string) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpandedTopicId(prev => prev === topicId ? null : topicId);
  };

  const { color: safeColor, icon: courseIcon } = getSubjectVisuals(course?.title, course?.color, course?.icon);

  const courseTotalMins = (course?.topics || []).reduce((acc: number, t: any) => acc + calculateTopicMinutes(t), 0);
  const courseTimeStr = formatStudyTime(courseTotalMins);

  const totalTopicsCount = course?.topics?.length || 0;
  const allSubtopics = (course?.topics || []).flatMap((t: any) => t.subtopics || []);
  const totalSubtopicsCount = allSubtopics.length;
  const masteredSubtopicsCount = allSubtopics.filter((st: any) => st.user_progress?.[0]?.status === 'Mastered').length;
  const progressPercent = totalSubtopicsCount > 0 ? Math.round((masteredSubtopicsCount / totalSubtopicsCount) * 100) : 0;

  const handleBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/(tabs)');
    }
  };

  const headerOpacity = scrollY.interpolate({
    inputRange: [20, 75],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  });

  const headerTranslateY = scrollY.interpolate({
    inputRange: [0, 75],
    outputRange: [-120, 0],
    extrapolate: 'clamp',
  });

  return (
    <View style={styles.container}>
      {/* Top Ambient Glow */}
      <LinearGradient
        colors={[`${safeColor}18`, `${colors.primaryLight}40`, 'transparent']}
        style={styles.ambientTopGlow}
        pointerEvents="none"
      />

      <Animated.ScrollView 
        style={styles.scrollView} 
        contentContainerStyle={[styles.content, { paddingTop: Math.max((insets?.top || 0) + 12, 52) }]}
        showsVerticalScrollIndicator={false}
        keyboardDismissMode="on-drag"
        scrollEventThrottle={16}
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { y: scrollY } } }],
          {
            useNativeDriver: true,
            listener: (event: any) => {
              const offsetY = event?.nativeEvent?.contentOffset?.y || 0;
              const active = offsetY > 30;
              if (active !== isScrolledRef.current) {
                isScrolledRef.current = active;
                setIsScrolled(active);
              }
            }
          }
        )}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        }
      >
        {/* Sleek Top Navigation Bar */}
        <View style={styles.topNavRow}>
          <Pressable 
            onPress={handleBack} 
            style={({ pressed }) => [styles.navCircleBtn, pressed && { opacity: 0.7, transform: [{ scale: 0.94 }] }]}
            hitSlop={12}
          >
            <Feather name="chevron-left" size={22} color={colors.text} />
          </Pressable>

          <View style={styles.navCenterCol}>
            <Text style={styles.navTitleText} numberOfLines={1}>
              {course.title}
            </Text>
            <Text style={styles.navSubtitleText} numberOfLines={1}>
              {course.board} • {course.level}
            </Text>
          </View>

          <Pressable 
            style={({ pressed }) => [styles.navCircleBtn, pressed && { opacity: 0.7, transform: [{ scale: 0.94 }] }]}
            onPress={() => router.push({
              pathname: '/papers',
              params: {
                subject: course.title,
                curriculum: course.board || '',
                level: course.level || '',
              }
            } as any)}
            hitSlop={12}
          >
            <Ionicons name="document-text-outline" size={19} color={colors.text} />
          </Pressable>
        </View>

        {/* Tactile Hero Card */}
        <View style={styles.heroCard}>
          <LinearGradient
            colors={[`${safeColor}18`, colors.card]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFillObject}
          />
          
          <View style={styles.heroHeaderRow}>
            <View style={[styles.heroIconBox, { backgroundColor: safeColor }]}>
              <MaterialCommunityIcons name={courseIcon as any} size={30} color="#FFFFFF" />
            </View>

            <View style={styles.heroBadgesCol}>
              <View style={styles.badgeRow}>
                <View style={styles.primaryPillBadge}>
                  <Text style={styles.primaryPillText}>{course.board || 'Syllabus'}</Text>
                </View>
                <View style={styles.secondaryPillBadge}>
                  <Text style={styles.secondaryPillText}>{course.level || 'Secondary'}</Text>
                </View>
              </View>

              <View style={styles.heroStatsRow}>
                <View style={styles.heroStatItem}>
                  <Feather name="layers" size={12} color={colors.textSecondary} />
                  <Text style={styles.heroStatText}>{totalTopicsCount} Topics</Text>
                </View>
                <Text style={styles.heroStatDivider}>•</Text>
                <View style={styles.heroStatItem}>
                  <Feather name="clock" size={12} color={colors.textSecondary} />
                  <Text style={styles.heroStatText}>{courseTimeStr}</Text>
                </View>
              </View>
            </View>
          </View>

          <Text style={styles.heroCourseTitle}>{course.title}</Text>
          {course.description ? (
            <Text style={styles.heroCourseDesc} numberOfLines={2}>
              {course.description}
            </Text>
          ) : null}

          {/* Course Progress Bar */}
          <View style={styles.progressContainer}>
            <View style={styles.progressLabelRow}>
              <Text style={styles.progressLabelText}>Syllabus Mastery</Text>
              <Text style={styles.progressPercentText}>{progressPercent}%</Text>
            </View>
            <View style={styles.progressBarTrack}>
              <View 
                style={[
                  styles.progressBarFill, 
                  { 
                    width: `${Math.max(progressPercent, 4)}%`,
                    backgroundColor: safeColor,
                  }
                ]} 
              />
            </View>
            <Text style={styles.progressSubtext}>
              {masteredSubtopicsCount} of {totalSubtopicsCount} subtopics mastered
            </Text>
          </View>

          {/* Quick Action Chips */}
          <View style={styles.heroActionChipsRow}>
            {course.syllabus_url && (
              <Pressable 
                style={({ pressed }) => [styles.actionChip, pressed && { opacity: 0.8 }]}
                onPress={handleViewSyllabus}
              >
                <Feather name="file-text" size={14} color={colors.primary} />
                <Text style={styles.actionChipText}>View PDF Syllabus</Text>
              </Pressable>
            )}

            <Pressable 
              style={({ pressed }) => [styles.actionChip, pressed && { opacity: 0.8 }]}
              onPress={() => router.push({
                pathname: '/papers',
                params: {
                  subject: course.title,
                  curriculum: course.board || '',
                  level: course.level || '',
                }
              } as any)}
            >
              <Ionicons name="folder-open-outline" size={14} color={colors.primary} />
              <Text style={styles.actionChipText}>Past Papers</Text>
            </Pressable>

            {user?.user_metadata?.role === 'teacher' && (
              <Pressable 
                style={({ pressed }) => [
                  styles.actionChipTeacher, 
                  uploadingSyllabus && { opacity: 0.6 },
                  pressed && { opacity: 0.8 }
                ]}
                onPress={handleUploadSyllabus}
                disabled={uploadingSyllabus}
              >
                {uploadingSyllabus ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <>
                    <Feather name="upload-cloud" size={14} color="#FFFFFF" />
                    <Text style={styles.actionChipTeacherText}>
                      {course.syllabus_url ? 'Re-Scan Syllabus' : 'Upload Syllabus'}
                    </Text>
                  </>
                )}
              </Pressable>
            )}
          </View>
        </View>

        {/* Teachers Section */}
        {teachers.length > 0 && (
          <View style={styles.sectionContainer}>
            <Text style={styles.sectionTitle}>Course Instructors</Text>
            {teachers.map((t) => (
              <Pressable 
                key={t.id} 
                style={({ pressed }) => [styles.teacherCard, pressed && { opacity: 0.85 }]}
                onPress={() => router.push(`/teacher/${t.id}`)}
              >
                <View style={styles.teacherAvatarBox}>
                  {t.avatar_url ? (
                    <Image source={{ uri: t.avatar_url }} style={styles.teacherAvatarImg} />
                  ) : (
                    <Ionicons name="person" size={20} color={colors.primary} />
                  )}
                </View>
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text style={styles.teacherName}>{t.first_name} {t.last_name}</Text>
                  <Text style={styles.teacherSchool}>{t.school || 'Verified Educator'}</Text>
                </View>
                <View style={styles.circleArrowBtn}>
                  <Feather name="chevron-right" size={16} color={colors.primary} />
                </View>
              </Pressable>
            ))}
          </View>
        )}

        {/* EcoCash Enrollment Card (If not subscribed and not teacher) */}
        {!hasSubscription && user?.user_metadata?.role !== 'teacher' && (
          <View style={styles.enrollCard}>
            <View style={styles.enrollTextCol}>
              <Text style={styles.enrollTitle}>Unlock Full Syllabus</Text>
              <Text style={styles.enrollSubtitle}>Access interactive AI practice, tests & notes</Text>
            </View>
            <Pressable 
              style={({ pressed }) => [styles.enrollBtn, pressed && { opacity: 0.9 }]}
              onPress={() => router.push(`/checkout/${course.id}`)}
            >
              <Text style={styles.enrollBtnText}>Enroll • ${course.price || '5'}</Text>
            </Pressable>
          </View>
        )}

        {/* Syllabus Section Header & Form Filter Pills */}
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionTitle}>Syllabus Units</Text>
          <Text style={styles.sectionUnitsCount}>
            {filteredTopics.length} {filteredTopics.length === 1 ? 'Chapter' : 'Chapters'}
          </Text>
        </View>

        {/* Tactile Form Selector Segmented Chips */}
        {availableForms.length > 0 && (
          <ScrollView 
            horizontal 
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.formPillsScroll}
          >
            <Pressable
              onPress={() => setSelectedForm('All')}
              style={({ pressed }) => [
                styles.formPillBase,
                selectedForm === 'All' ? styles.formPillActive : styles.formPillInactive,
                pressed && { opacity: 0.85 }
              ]}
            >
              {selectedForm === 'All' && (
                <LinearGradient
                  colors={['#2563EB', '#1D4ED8']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={StyleSheet.absoluteFillObject}
                />
              )}
              <Text style={[
                styles.formPillText, 
                selectedForm === 'All' ? styles.formPillTextActive : styles.formPillTextInactive
              ]}>
                All Units
              </Text>
              <View style={[
                styles.formPillCountBadge,
                selectedForm === 'All' ? styles.formPillCountBadgeActive : styles.formPillCountBadgeInactive
              ]}>
                <Text style={[
                  styles.formPillCountText,
                  selectedForm === 'All' ? styles.formPillCountTextActive : styles.formPillCountTextInactive
                ]}>
                  {course.topics?.length || 0}
                </Text>
              </View>
            </Pressable>

            {availableForms.map((formName: string) => {
              const count = (course.topics || []).filter((t: any) => getTopicForm(t) === formName).length;
              const isActive = selectedForm === formName;
              return (
                <Pressable
                  key={formName}
                  onPress={() => setSelectedForm(formName)}
                  style={({ pressed }) => [
                    styles.formPillBase,
                    isActive ? styles.formPillActive : styles.formPillInactive,
                    pressed && { opacity: 0.85 }
                  ]}
                >
                  {isActive && (
                    <LinearGradient
                      colors={['#2563EB', '#1D4ED8']}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={StyleSheet.absoluteFillObject}
                    />
                  )}
                  <Text style={[
                    styles.formPillText, 
                    isActive ? styles.formPillTextActive : styles.formPillTextInactive
                  ]}>
                    {formName}
                  </Text>
                  <View style={[
                    styles.formPillCountBadge,
                    isActive ? styles.formPillCountBadgeActive : styles.formPillCountBadgeInactive
                  ]}>
                    <Text style={[
                      styles.formPillCountText,
                      isActive ? styles.formPillCountTextActive : styles.formPillCountTextInactive
                    ]}>
                      {count}
                    </Text>
                  </View>
                </Pressable>
              );
            })}
          </ScrollView>
        )}

        {/* Topics List */}
        {!course.topics || course.topics.length === 0 ? (
          <View style={styles.emptyCard}>
            <Feather name="inbox" size={32} color={colors.textTertiary} />
            <Text style={styles.emptyText}>No syllabus topics available yet.</Text>
          </View>
        ) : filteredTopics.length === 0 ? (
          <View style={styles.emptyCard}>
            <Feather name={searchQuery.trim() ? "search" : "filter"} size={32} color={colors.textTertiary} />
            <Text style={styles.emptyText}>
              {searchQuery.trim()
                ? `No chapters or topics matching "${searchQuery}".`
                : `No topics found for ${selectedForm}.`}
            </Text>
            {searchQuery.trim() ? (
              <Pressable
                onPress={() => setSearchQuery('')}
                style={styles.clearSearchBtn}
              >
                <Text style={styles.clearSearchBtnText}>Clear Search</Text>
              </Pressable>
            ) : null}
          </View>
        ) : (
          orderedTopics.map((topic: any) => {
            const isExpanded = expandedTopicId === topic.id;
            const totalSubtopics = topic.subtopics?.length || 0;
            const masteredCount = topic.subtopics?.filter((st: any) => 
              st.user_progress?.[0]?.status === 'Mastered'
            ).length || 0;

            const topicTotalMins = calculateTopicMinutes(topic);
            const topicTimeStr = formatStudyTime(topicTotalMins);
            const topicForm = getTopicForm(topic);

            const chNum = topic.chapterNumber || 1;
            const indexStr = chNum < 10 ? `0${chNum}` : `${chNum}`;
            const isLastStudied = lastStudiedChapter?.topicId === topic.id;

            return (
              <View 
                key={topic.id} 
                style={[
                  styles.topicCard,
                  isLastStudied && { borderColor: `${safeColor}40` }
                ]}
              >
                <Pressable 
                  style={styles.topicHeader}
                  onPress={() => toggleTopic(topic.id)}
                  android_ripple={{ color: 'rgba(0,0,0,0.04)' }}
                >
                  <View style={[
                    styles.topicIndexBadge,
                    isLastStudied && { backgroundColor: `${safeColor}18` }
                  ]}>
                    <Text style={[
                      styles.topicIndexText,
                      isLastStudied && { color: safeColor, fontWeight: '700' }
                    ]}>
                      {indexStr}
                    </Text>
                  </View>

                  <View style={styles.topicInfoCol}>
                    <View style={styles.topicTitleRow}>
                      <Text style={styles.topicTitleText} numberOfLines={2}>
                        {topic.title}
                      </Text>
                    </View>

                    <View style={styles.topicMetaRow}>
                      <Text style={styles.topicMetaText}>
                        {masteredCount}/{totalSubtopics} Mastered
                      </Text>

                      <Text style={styles.topicMetaDivider}>•</Text>

                      <View style={styles.topicTimeBadge}>
                        <Feather name="clock" size={11} color={colors.primary} />
                        <Text style={styles.topicTimeText}>{topicTimeStr}</Text>
                      </View>
                    </View>
                  </View>

                  <View style={styles.topicHeaderRightActions}>
                    {isLastStudied && (
                      <Pressable 
                        style={({ pressed }) => [
                          styles.chapterResumeHeaderBtn, 
                          { backgroundColor: safeColor },
                          pressed && { opacity: 0.85, transform: [{ scale: 0.96 }] }
                        ]}
                        onPress={(e) => {
                          e.stopPropagation();
                          LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                          if (!isExpanded) {
                            setExpandedTopicId(topic.id);
                          }
                          if (topic.subtopics && topic.subtopics.length > 0) {
                            const target = topic.subtopics.find((st: any) => st.id === lastStudiedChapter?.subtopicId) || topic.subtopics[0];
                            handleOpenTopicContent(topic, target);
                          }
                        }}
                      >
                        <Text style={styles.chapterResumeHeaderBtnText}>Resume</Text>
                        <Feather name="arrow-right" size={12} color="#FFFFFF" />
                      </Pressable>
                    )}

                    <View style={[styles.topicToggleCircle, isExpanded && styles.topicToggleCircleActive]}>
                      <Feather 
                        name={isExpanded ? "chevron-up" : "chevron-down"} 
                        size={18} 
                        color={isExpanded ? colors.primary : colors.textSecondary} 
                      />
                    </View>
                  </View>
                </Pressable>

                {/* Expanded Chapter Content - Minimalist Uniform Cards */}
                {isExpanded && (
                  <View style={styles.subtopicsContainer}>
                    {/* Chapter Materials / Overview Documents (Uploaded Outside Generated Topics) */}
                    {(() => {
                      let tmpl = topic.workspace_template;
                      if (typeof tmpl === 'string') {
                        try { tmpl = JSON.parse(tmpl); } catch (e) { tmpl = null; }
                      }

                      // Collect all authentic uploaded files for this chapter
                      const chapterFiles: any[] = [];
                      if (Array.isArray(tmpl?.content)) {
                        chapterFiles.push(...tmpl.content);
                      }
                      if (tmpl?.chapter_pdf_url && !chapterFiles.some((f: any) => f.url === tmpl.chapter_pdf_url)) {
                        chapterFiles.unshift({
                          display_name: tmpl.chapter_pdf_name || 'Chapter Document',
                          url: tmpl.chapter_pdf_url,
                          type: 'pdf_resources'
                        });
                      }

                      // If no files uploaded, DO NOT render default dummy chapter summary notes
                      if (chapterFiles.length === 0) {
                        return null;
                      }

                      return (
                        <View style={{ marginBottom: 6 }}>
                          <View style={styles.chapterOverviewHeaderRow}>
                            <Ionicons name="folder-open" size={13} color={safeColor} />
                            <Text style={[styles.chapterOverviewHeaderText, { color: safeColor }]}>
                              Chapter Materials & Overview
                            </Text>
                          </View>

                          {chapterFiles.map((f: any, fIdx: number) => {
                            const isVideo = f.type === 'videos' || f.type === 'video';
                            const isPresentation = f.type === 'presentations';
                            const iconName: any = isVideo ? 'play-circle-outline' : isPresentation ? 'easel-outline' : 'document-text-outline';
                            const typeLabel = isVideo ? 'Chapter Video' : isPresentation ? 'Presentation Slides' : 'Chapter Document • PDF';

                            return (
                              <Pressable
                                key={f.url || `chap-file-${fIdx}`}
                                style={({ pressed }) => [
                                  styles.contentItemCard,
                                  { marginBottom: 6 },
                                  pressed && { opacity: 0.85 }
                                ]}
                                onPress={() => {
                                  if (f.url) {
                                    WebBrowser.openBrowserAsync(f.url);
                                  } else {
                                    handleViewChapterNotes(topic);
                                  }
                                }}
                              >
                                <View style={[styles.contentItemIconBox, { backgroundColor: `${safeColor}14` }]}>
                                  <Ionicons name={iconName} size={17} color={safeColor} />
                                </View>

                                <View style={{ flex: 1, paddingRight: 8 }}>
                                  <Text style={styles.contentItemTitle} numberOfLines={1}>
                                    {f.display_name || f.file_name || 'Chapter Resource'}
                                  </Text>
                                  <Text style={styles.contentItemSubtitle}>
                                    {typeLabel} {f.estimated_minutes ? `• ⏱️ ${f.estimated_minutes} mins` : ''}
                                  </Text>
                                </View>

                                <View style={styles.contentItemRightAction}>
                                  <Feather name="external-link" size={15} color={colors.textTertiary} />
                                </View>
                              </Pressable>
                            );
                          })}
                        </View>
                      );
                    })()}

                    {/* Topic Items (Same uniform card design) */}
                    {!topic.subtopics || topic.subtopics.length === 0 ? (
                      <View style={styles.inlineEmptyPlaceholder}>
                        <Feather name="book-open" size={18} color={colors.textTertiary} />
                        <Text style={styles.inlineEmptyTitle}>No topics listed yet</Text>
                        <Text style={styles.inlineEmptyDesc}>Study materials are being prepared for this chapter.</Text>
                      </View>
                    ) : (
                      [...topic.subtopics]
                        .sort((a: any, b: any) => {
                          const orderA = a.workspace_template?.order_index ?? a.order_index ?? 0;
                          const orderB = b.workspace_template?.order_index ?? b.order_index ?? 0;
                          if (orderA !== orderB) return orderA - orderB;
                          return a.title.localeCompare(b.title, undefined, { numeric: true });
                        })
                        .map((subtopic: any) => {
                          const status = subtopic.user_progress?.[0]?.status || 'Not Started';
                          const totalMins = calculateSubtopicMinutes(subtopic);
                          const subtopicTimeStr = formatStudyTime(totalMins, subtopic.estimated_time);
                          const isMastered = status === 'Mastered';
                          const questionsCount = subtopic.questions?.length || 0;

                          const subMaterials = extractSubtopicMaterials(subtopic);
                          const videoMaterial = subMaterials.find((m: any) => m.type === 'video');
                          const notesMaterial = subMaterials.find((m: any) => m.type === 'notes_text' || m.type === 'notes_pdf');

                          let iconName: any = 'book-outline';
                          let iconColor = safeColor;
                          let metaLabel = subtopicTimeStr;

                          if (questionsCount > 0) {
                            iconName = 'help-circle-outline';
                            iconColor = '#D97706';
                            metaLabel = `Practice Quiz • ${questionsCount} Questions`;
                          } else if (videoMaterial) {
                            iconName = 'play-outline';
                            iconColor = '#2563EB';
                            metaLabel = `Video Lesson • ${subtopicTimeStr}`;
                          } else if (notesMaterial) {
                            iconName = 'document-text-outline';
                            iconColor = '#059669';
                            metaLabel = `Study Notes • ${subtopicTimeStr}`;
                          } else {
                            iconName = 'book-outline';
                            iconColor = safeColor;
                            metaLabel = subtopicTimeStr;
                          }

                          return (
                            <Pressable
                              key={subtopic.id}
                              style={({ pressed }) => [
                                styles.contentItemCard,
                                pressed && { opacity: 0.85 }
                              ]}
                              onPress={() => handleOpenTopicContent(topic, subtopic)}
                            >
                              {/* Uniform Icon Box */}
                              <View style={[styles.contentItemIconBox, { backgroundColor: `${iconColor}14` }]}>
                                <Ionicons name={iconName} size={17} color={iconColor} />
                              </View>

                              {/* Title & Single Meta Line */}
                              <View style={{ flex: 1, paddingRight: 8 }}>
                                <Text style={styles.contentItemTitle} numberOfLines={1}>
                                  {subtopic.title}
                                </Text>
                                <Text style={styles.contentItemSubtitle}>
                                  {metaLabel}
                                </Text>
                              </View>

                              {/* Right: Clean Mastery Toggle Button */}
                              <Pressable
                                style={styles.contentItemRightAction}
                                onPress={(e) => {
                                  e.stopPropagation();
                                  handleToggleSubtopicStatus(subtopic);
                                }}
                                hitSlop={10}
                              >
                                <Ionicons
                                  name={isMastered ? "checkmark-circle" : "ellipse-outline"}
                                  size={21}
                                  color={isMastered ? "#10B981" : colors.textTertiary}
                                />
                              </Pressable>
                            </Pressable>
                          );
                        })
                    )}
                  </View>
                )}
              </View>
            );
          })
        )}

        <View style={{ height: 80 }} />
      </Animated.ScrollView>

      {/* Animated Sticky Top Bar with Back Button and Search Bar */}
      <Animated.View
        style={[
          styles.stickyHeaderContainer,
          {
            paddingTop: Math.max((insets?.top || 0) + 6, 44),
            opacity: searchQuery.trim().length > 0 ? 1 : headerOpacity,
            transform: [{ translateY: searchQuery.trim().length > 0 ? 0 : headerTranslateY }],
          }
        ]}
        pointerEvents={isScrolled || searchQuery.trim().length > 0 ? 'auto' : 'none'}
      >
        <BlurView
          intensity={85}
          tint={isDark ? 'dark' : 'light'}
          style={StyleSheet.absoluteFillObject}
          pointerEvents="none"
        />
        <View style={styles.stickyHeaderContent}>
          <Pressable 
            onPress={handleBack} 
            style={({ pressed }) => [styles.stickyBackBtn, pressed && { opacity: 0.7, transform: [{ scale: 0.94 }] }]}
            hitSlop={12}
          >
            <Feather name="chevron-left" size={22} color={colors.text} />
          </Pressable>

          <View style={styles.stickySearchWrapper}>
            <Feather name="search" size={17} color={colors.textSecondary} style={styles.stickySearchIcon} />
            <TextInput
              ref={searchInputRef}
              style={styles.stickySearchInput}
              placeholder="Search chapters or topics..."
              placeholderTextColor={colors.textTertiary}
              value={searchQuery}
              onChangeText={setSearchQuery}
              returnKeyType="search"
              autoCapitalize="none"
              autoCorrect={false}
            />
            {searchQuery.length > 0 && (
              <Pressable 
                onPress={() => setSearchQuery('')} 
                style={styles.stickyClearBtn}
                hitSlop={8}
              >
                <Feather name="x" size={14} color={colors.textSecondary} />
              </Pressable>
            )}
          </View>
        </View>
      </Animated.View>

      {/* Note Text Modal Viewer */}
      <Modal
        visible={!!activeNoteTextModal}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setActiveNoteTextModal(null)}
      >
        <View style={styles.noteModalOverlay}>
          <View style={styles.noteModalContent}>
            <View style={styles.noteModalHeader}>
              <View style={{ flex: 1, paddingRight: 10 }}>
                <Text style={styles.noteModalTitle} numberOfLines={1}>{activeNoteTextModal?.title || 'Study Notes'}</Text>
                <Text style={styles.noteModalSubtitle}>
                  {course?.title} • Study Notes
                </Text>
              </View>
              <Pressable onPress={() => setActiveNoteTextModal(null)} style={styles.noteModalCloseBtn} hitSlop={8}>
                <Feather name="x" size={20} color={colors.text} />
              </Pressable>
            </View>
            <ScrollView style={styles.noteModalBody} showsVerticalScrollIndicator={true}>
              <Text style={styles.noteModalText}>{activeNoteTextModal?.content}</Text>
              <View style={{ height: 24 }} />
            </ScrollView>
            {activeNoteTextModal?.subtopicId && (
              <View style={styles.noteModalFooter}>
                <Pressable
                  style={styles.noteModalQuizBtn}
                  onPress={() => {
                    const stId = activeNoteTextModal.subtopicId;
                    setActiveNoteTextModal(null);
                    router.push(`/quiz/${stId}`);
                  }}
                >
                  <Ionicons name="help-circle-outline" size={16} color="#FFFFFF" style={{ marginRight: 6 }} />
                  <Text style={styles.noteModalQuizBtnText}>Practice Quiz on this Topic</Text>
                </Pressable>
              </View>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const createStyles = (colors: any) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  ambientTopGlow: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 280,
  },
  scrollView: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'ios' ? 52 : 36,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    backgroundColor: colors.background,
  },

  // Animated Sticky Top Header
  stickyHeaderContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 100,
    overflow: 'hidden',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    shadowColor: '#102A6B',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4,
  },
  stickyHeaderContent: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 10,
    paddingTop: 4,
    gap: 10,
  },
  stickyBackBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#102A6B',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  stickySearchWrapper: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 12,
    shadowColor: '#102A6B',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 1,
  },
  stickySearchIcon: {
    marginRight: 8,
  },
  stickySearchInput: {
    flex: 1,
    height: '100%',
    fontSize: 13.5,
    fontFamily: 'Outfit_400Regular',
    color: colors.text,
    paddingVertical: 0,
  },
  stickyClearBtn: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.surfaceHighlight || colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 6,
  },
  clearSearchBtn: {
    marginTop: 14,
    paddingHorizontal: 18,
    paddingVertical: 9,
    borderRadius: 12,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  clearSearchBtnText: {
    fontSize: 13,
    fontWeight: '600',
    fontFamily: 'Outfit_600SemiBold',
    color: '#FFFFFF',
  },
  topNavRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
    paddingHorizontal: 4,
  },
  navCircleBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: '#102A6B',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 2,
  },
  navCenterCol: {
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
    paddingHorizontal: 12,
  },
  navTitleText: {
    fontSize: 17,
    fontWeight: '700',
    fontFamily: 'Outfit_600SemiBold',
    color: colors.text,
    textAlign: 'center',
    letterSpacing: -0.3,
  },
  navSubtitleText: {
    fontSize: 11,
    fontWeight: '600',
    fontFamily: 'Outfit_500Medium',
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: 2,
    letterSpacing: 0.3,
  },

  // Hero Card
  heroCard: {
    borderRadius: 24,
    backgroundColor: colors.card,
    borderWidth: 1.5,
    borderColor: colors.cardBorder,
    padding: 20,
    marginBottom: 20,
    overflow: 'hidden',
    shadowColor: '#102A6B',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 18,
    elevation: 4,
  },
  heroHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
  },
  heroIconBox: {
    width: 56,
    height: 56,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 4,
  },
  heroBadgesCol: {
    marginLeft: 14,
    flex: 1,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  primaryPillBadge: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 9999,
    backgroundColor: '#EEF2FF',
    borderWidth: 1,
    borderColor: '#C7D2FE',
  },
  primaryPillText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#2563EB',
    fontFamily: 'Outfit_600SemiBold',
  },
  secondaryPillBadge: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 9999,
    backgroundColor: '#F1F5F9',
  },
  secondaryPillText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#475569',
  },
  heroStatsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  heroStatItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  heroStatText: {
    fontSize: 12,
    color: '#64748B',
    fontWeight: '500',
  },
  heroStatDivider: {
    fontSize: 10,
    color: '#CBD5E1',
  },
  heroCourseTitle: {
    fontSize: 22,
    fontWeight: '800',
    fontFamily: 'Outfit_600SemiBold',
    color: colors.text,
    marginBottom: 4,
  },
  heroCourseDesc: {
    fontSize: 13,
    lineHeight: 18,
    color: colors.textSecondary,
    marginBottom: 14,
  },

  // Progress Bar
  progressContainer: {
    marginTop: 6,
    marginBottom: 16,
    padding: 14,
    borderRadius: 16,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  progressLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  progressLabelText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.text,
  },
  progressPercentText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#2563EB',
  },
  progressBarTrack: {
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.border,
    overflow: 'hidden',
    marginBottom: 6,
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 4,
  },
  progressSubtext: {
    fontSize: 11,
    color: colors.textTertiary || colors.textSecondary,
    fontWeight: '500',
  },

  // Action Chips
  heroActionChipsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  actionChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.border,
  },
  actionChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.text,
  },
  actionChipTeacher: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: '#2563EB',
  },
  actionChipTeacherText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFFFFF',
  },

  // Section Headers
  sectionContainer: {
    marginBottom: 20,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
    marginTop: 4,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '700',
    fontFamily: 'Outfit_600SemiBold',
    color: colors.text,
  },
  sectionUnitsCount: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textSecondary,
  },

  // Teachers Card
  teacherCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 18,
    backgroundColor: colors.card,
    borderWidth: 1.5,
    borderColor: colors.cardBorder,
    marginBottom: 8,
    shadowColor: '#102A6B',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.04,
    shadowRadius: 10,
    elevation: 2,
  },
  teacherAvatarBox: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.surfaceHighlight || colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  teacherAvatarImg: {
    width: '100%',
    height: '100%',
  },
  teacherName: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text,
    fontFamily: 'Outfit_600SemiBold',
  },
  teacherSchool: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 2,
  },
  circleArrowBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Enroll Card
  enrollCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderRadius: 20,
    backgroundColor: '#FEF3C7',
    borderWidth: 1.5,
    borderColor: '#FDE68A',
    marginBottom: 20,
  },
  enrollTextCol: {
    flex: 1,
    marginRight: 12,
  },
  enrollTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#92400E',
    fontFamily: 'Outfit_600SemiBold',
  },
  enrollSubtitle: {
    fontSize: 12,
    color: '#B45309',
    marginTop: 2,
  },
  enrollBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 14,
    backgroundColor: '#D97706',
  },
  enrollBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
  },

  // Form Filter Pills
  formPillsScroll: {
    gap: 8,
    paddingVertical: 6,
    marginBottom: 16,
  },
  formPillBase: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 9999,
    overflow: 'hidden',
  },
  formPillActive: {
    backgroundColor: '#2563EB',
    shadowColor: '#2563EB',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 4,
  },
  formPillInactive: {
    backgroundColor: colors.card,
    borderWidth: 1.5,
    borderColor: colors.border,
  },
  formPillText: {
    fontSize: 13,
    fontFamily: 'Outfit_600SemiBold',
  },
  formPillTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  formPillTextInactive: {
    color: colors.textSecondary,
    fontWeight: '600',
  },
  formPillCountBadge: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 9999,
  },
  formPillCountBadgeActive: {
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
  },
  formPillCountBadgeInactive: {
    backgroundColor: colors.surfaceHighlight || colors.surface,
  },
  formPillCountText: {
    fontSize: 11,
    fontWeight: '700',
  },
  formPillCountTextActive: {
    color: '#FFFFFF',
  },
  formPillCountTextInactive: {
    color: '#2563EB',
  },

  // Topic Accordion Card
  topicCard: {
    borderRadius: 18,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 10,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 6,
    elevation: 1,
  },
  topicHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    backgroundColor: colors.card,
  },
  topicIndexBadge: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: colors.surfaceHighlight || colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  topicIndexText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#2563EB',
    fontFamily: 'Outfit_600SemiBold',
  },
  topicInfoCol: {
    flex: 1,
  },
  topicTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  topicTitleText: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
    fontFamily: 'Outfit_600SemiBold',
    lineHeight: 20,
  },
  topicMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
  },
  topicFormTag: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
    backgroundColor: colors.surfaceHighlight || colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  topicFormTagText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#2563EB',
  },
  topicMetaText: {
    fontSize: 11,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  topicMetaDivider: {
    fontSize: 10,
    color: colors.border,
  },
  topicTimeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  topicTimeText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#2563EB',
  },
  topicToggleCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
  },
  topicToggleCircleActive: {
    backgroundColor: colors.surfaceHighlight || colors.surface,
    borderColor: colors.primary || '#2563EB',
  },


  subtopicRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  subtopicLeftCol: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 12,
  },
  subtopicStatusBox: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    backgroundColor: colors.surfaceHighlight || colors.surface,
  },
  subtopicStatusBoxMastered: {
    backgroundColor: '#ECFDF5',
  },
  subtopicStatusBoxProgress: {
    backgroundColor: '#FEF3C7',
  },
  subtopicNotStartedDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.border,
  },
  subtopicTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 4,
  },
  subtopicTagsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
  },
  difficultyBadge: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
  },
  difficultyEasy: {
    backgroundColor: '#ECFDF5',
  },
  difficultyEasyText: {
    color: '#059669',
  },
  difficultyMedium: {
    backgroundColor: '#FEF3C7',
  },
  difficultyMediumText: {
    color: '#D97706',
  },
  difficultyHard: {
    backgroundColor: '#FFE4E6',
  },
  difficultyHardText: {
    color: '#E11D48',
  },
  difficultyBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  subtopicTimeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  subtopicTimeChipText: {
    fontSize: 11,
    color: colors.textSecondary,
  },
  subtopicActionCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.surfaceHighlight || colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },

  // Empty state
  emptyCard: {
    padding: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 20,
    backgroundColor: colors.card,
    borderWidth: 1.5,
    borderColor: colors.cardBorder,
    marginTop: 12,
    gap: 8,
  },
  emptyText: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  errorText: {
    fontSize: 16,
    color: '#EF4444',
    marginBottom: 16,
  },
  backButton: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    backgroundColor: '#2563EB',
    borderRadius: 14,
  },
  backButtonText: {
    color: '#FFFFFF',
    fontWeight: '700',
  },

  // Last Studied & Chapter Header Resume
  topicLastStudiedPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
  },
  topicLastStudiedText: {
    fontSize: 9.5,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  pulseDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  topicHeaderRightActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  chapterResumeHeaderBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    gap: 4,
  },
  chapterResumeHeaderBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },

  chapterOverviewHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 4,
    paddingTop: 4,
    paddingBottom: 8,
  },
  chapterOverviewHeaderText: {
    fontSize: 11.5,
    fontWeight: '700',
    letterSpacing: 0.2,
    textTransform: 'uppercase',
  },

  // Subtopics container & Uniform Content Items
  subtopicsContainer: {
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.surfaceHighlight || colors.surface,
    gap: 6,
  },
  contentItemCard: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  contentItemIconBox: {
    width: 34,
    height: 34,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 11,
  },
  contentItemTitle: {
    fontSize: 13.5,
    fontWeight: '600',
    color: colors.text,
    lineHeight: 18,
  },
  contentItemSubtitle: {
    fontSize: 11.5,
    color: colors.textSecondary,
    marginTop: 2,
  },
  contentItemRightAction: {
    marginLeft: 6,
    padding: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  noteModalSubtitle: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 2,
  },
  noteModalFooter: {
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  noteModalQuizBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    backgroundColor: '#2563EB',
    borderRadius: 14,
  },
  noteModalQuizBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
  },

  // Empty placeholder
  inlineEmptyPlaceholder: {
    alignItems: 'center',
    padding: 16,
    margin: 12,
    borderRadius: 14,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 4,
  },
  inlineEmptyTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.text,
    marginTop: 4,
  },
  inlineEmptyDesc: {
    fontSize: 11,
    color: colors.textSecondary,
    textAlign: 'center',
  },

  // Note Modal
  noteModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  noteModalContent: {
    width: '100%',
    maxHeight: '80%',
    backgroundColor: colors.card,
    borderRadius: 24,
    padding: 20,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 8,
  },
  noteModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  noteModalTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
    fontFamily: 'Outfit_600SemiBold',
    flex: 1,
    marginRight: 10,
  },
  noteModalCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceHighlight || colors.surface,
  },
  noteModalBody: {
    marginTop: 14,
  },
  noteModalText: {
    fontSize: 14,
    lineHeight: 22,
    color: colors.text,
  },
});
