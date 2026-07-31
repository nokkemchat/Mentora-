import React from 'react';
import { View, StyleSheet, Text, Pressable, SafeAreaView } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Video, ResizeMode } from 'expo-av';
import { WebView } from 'react-native-webview';
import { Ionicons, Feather } from '@expo/vector-icons';
import { spacing, typography, useThemeColors, borderRadius } from '@/constants/theme';

export default function MediaViewerScreen() {
  const { uri, type, title } = useLocalSearchParams<{ uri: string, type: string, title: string }>();
  const router = useRouter();
  const colors = useThemeColors();

  const isVideo = type?.includes('video') || type?.includes('mp4');
  const isPdf = type?.includes('pdf') || type?.includes('document');

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <Feather name="arrow-left" size={24} color={colors.text} />
        </Pressable>
        <Text style={[styles.title, { color: colors.text }]} numberOfLines={1}>
          {title || 'Offline Viewer'}
        </Text>
        <View style={{ width: 40 }} />
      </View>

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
            source={{ uri: uri as string }} 
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

      {/* Contextual AI Tutor FAB (Only for PDFs) */}
      {isPdf && (
        <Pressable 
          style={[styles.fab, { backgroundColor: colors.primary }]}
          onPress={() => router.push({ pathname: '/papers/1', params: { title } })}
        >
          <Ionicons name="sparkles" size={24} color="#FFF" />
        </Pressable>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.md,
    borderBottomWidth: 1,
    paddingTop: 40,
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    flex: 1,
    fontSize: typography.sizes.md,
    fontWeight: '600',
    textAlign: 'center',
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
  }
});
