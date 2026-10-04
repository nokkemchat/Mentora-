import React, { useState, useEffect } from 'react';
import { View, StyleSheet, Text, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Video, ResizeMode } from 'expo-av';
import { WebView } from 'react-native-webview';
import { Ionicons, Feather } from '@expo/vector-icons';
import { Bot, Sparkles } from 'lucide-react-native';
import { spacing, typography, useThemeColors, borderRadius } from '@/constants/theme';
import { QuestionPaperTutorModal } from '@/components/QuestionPaperTutorModal';

export default function MediaViewerScreen() {
  const { uri, type, title, paperId, subject, curriculum, openTutor } = useLocalSearchParams<{
    uri: string;
    type: string;
    title: string;
    paperId?: string;
    subject?: string;
    curriculum?: string;
    openTutor?: string;
  }>();
  const router = useRouter();
  const colors = useThemeColors();

  const [tutorModalVisible, setTutorModalVisible] = useState(openTutor === 'true');

  useEffect(() => {
    if (openTutor === 'true') {
      setTutorModalVisible(true);
    }
  }, [openTutor]);

  const handleBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/(tabs)');
    }
  };

  const isVideo = type?.includes('video') || type?.includes('mp4');
  const isPdf = type?.includes('pdf') || type?.includes('document') || !type;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      {/* Sleek Top Navigation Bar */}
      <View style={[styles.header, { borderBottomColor: colors.border, backgroundColor: colors.background }]}>
        <Pressable 
          onPress={handleBack} 
          style={({ pressed }) => [styles.backButton, { backgroundColor: colors.surface, borderColor: colors.border }, pressed && { opacity: 0.7, transform: [{ scale: 0.94 }] }]}
          hitSlop={12}
          accessibilityLabel="Go back"
        >
          <Feather name="chevron-left" size={22} color={colors.text} />
        </Pressable>
        <Text style={[styles.title, { color: colors.text }]} numberOfLines={1}>
          {title || 'Question Paper PDF'}
        </Text>
        <View style={styles.headerPlaceholder} />
      </View>

      {/* PDF / Video View */}
      <View style={styles.content}>
        {isVideo ? (
          <Video
            source={{ uri: uri as string }}
            style={styles.video}
            useNativeControls
            resizeMode={ResizeMode.CONTAIN}
            shouldPlay
          />
        ) : isPdf ? (
          <WebView 
            source={{ uri: uri || 'https://akjbejexhdawelrfygub.supabase.co/storage/v1/object/public/past_papers/pending/Pending_ox21_qp.pdf' }} 
            style={styles.webview} 
            originWhitelist={['*']}
            allowFileAccess={true}
            allowUniversalAccessFromFileURLs={true}
          />
        ) : (
          <View style={styles.errorContainer}>
            <Feather name="alert-circle" size={48} color={colors.textSecondary} />
            <Text style={[styles.errorText, { color: colors.textSecondary }]}>Unsupported file format</Text>
            <Text style={{ color: colors.textTertiary, marginTop: spacing.sm }}>{type}</Text>
          </View>
        )}
      </View>

      {/* Floating AI Assistant Tutor Button (Opens Modal Chat) */}
      {isPdf && (
        <Pressable 
          style={({ pressed }) => [
            styles.fab,
            { backgroundColor: colors.primary },
            pressed && { transform: [{ scale: 0.95 }] }
          ]}
          onPress={() => setTutorModalVisible(true)}
        >
          <Sparkles color="#FFF" size={26} />
        </Pressable>
      )}

      {/* Question Paper Tutor Agent Modal */}
      <QuestionPaperTutorModal
        visible={tutorModalVisible}
        onClose={() => setTutorModalVisible(false)}
        paperId={paperId || '21f06556-c22c-4890-bec6-6e7119ffb86e'}
        paperTitle={title || 'Cambridge Chemistry Paper 4'}
        subject={subject || 'Chemistry'}
        curriculum={curriculum || 'Cambridge'}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  backButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#102A6B',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 2,
  },
  title: {
    flex: 1,
    fontSize: 16,
    fontWeight: '700',
    fontFamily: 'Outfit_600SemiBold',
    textAlign: 'center',
    marginHorizontal: spacing.sm,
    letterSpacing: -0.3,
  },
  headerPlaceholder: {
    width: 42,
    height: 42,
  },
  content: {
    flex: 1,
  },
  video: {
    flex: 1,
    backgroundColor: '#000',
  },
  webview: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  errorContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
  },
  errorText: {
    fontSize: typography.sizes.md,
  },
  fab: {
    position: 'absolute',
    bottom: 30,
    right: 20,
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 5,
    elevation: 8,
    zIndex: 999,
  }
});
