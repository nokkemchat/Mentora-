import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Pressable, ActivityIndicator, Alert, Platform } from 'react-native';
import { Feather } from '@expo/vector-icons';
import * as FileSystem from 'expo-file-system/legacy';
import * as WebBrowser from 'expo-web-browser';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { typography, spacing } from '@/constants/theme';

interface Material {
  id: string;
  title: string;
  content_url: string;
  type: string;
  content_text?: string;
}

interface DownloadableMaterialProps {
  material: Material;
  isTeacher: boolean;
  onDelete: (id: string) => void;
  iconName: any;
  colors: any;
  onPressTextNotes?: () => void;
}

export default function DownloadableMaterial({ material, isTeacher, onDelete, iconName, colors, onPressTextNotes }: DownloadableMaterialProps) {
  const [isDownloaded, setIsDownloaded] = useState(false);
  const [localUri, setLocalUri] = useState<string | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);

  const storageKey = `@downloaded_material_${material.id}`;

  useEffect(() => {
    checkDownloadStatus();
  }, [material.id]);

  const checkDownloadStatus = async () => {
    try {
      const storedUri = await AsyncStorage.getItem(storageKey);
      if (storedUri) {
        // Verify file still exists on disk
        const fileInfo = await FileSystem.getInfoAsync(storedUri);
        if (fileInfo.exists) {
          setLocalUri(storedUri);
          setIsDownloaded(true);
        } else {
          // Clean up orphaned reference
          await AsyncStorage.removeItem(storageKey);
          setIsDownloaded(false);
          setLocalUri(null);
        }
      }
    } catch (e) {
      console.error('Error checking download status:', e);
    }
  };

  const handlePress = async () => {
    if (material.type === 'notes_text' && onPressTextNotes) {
      onPressTextNotes();
      return;
    }

    if (isDownloaded && localUri) {
      if (Platform.OS === 'web') {
        WebBrowser.openBrowserAsync(material.content_url);
      } else {
        // We'll use WebBrowser to handle local file URIs as well
        WebBrowser.openBrowserAsync(localUri).catch(() => {
          Alert.alert('Cannot Open File', 'Your device does not have an app to open this file.');
        });
      }
    } else {
      // Not downloaded, stream from web
      WebBrowser.openBrowserAsync(material.content_url);
    }
  };

  const downloadFile = async () => {
    if (Platform.OS === 'web') {
      Alert.alert('Not Supported', 'Offline downloads are only supported on the mobile app.');
      return;
    }
    
    if (isDownloading) return;

    try {
      setIsDownloading(true);
      setDownloadProgress(0);

      // Extract file extension from URL or fallback
      const extMatch = material.content_url.match(/\.([a-z0-9]+)(?:[\?#]|$)/i);
      const ext = extMatch ? extMatch[1] : (material.type === 'video' ? 'mp4' : 'pdf');
      
      const fileUri = `${FileSystem.documentDirectory}${material.id}.${ext}`;
      
      const downloadResumable = FileSystem.createDownloadResumable(
        material.content_url,
        fileUri,
        {},
        (downloadProgress) => {
          const progress = downloadProgress.totalBytesWritten / downloadProgress.totalBytesExpectedToWrite;
          setDownloadProgress(progress);
        }
      );

      const result = await downloadResumable.downloadAsync();
      
      if (result && result.uri) {
        await AsyncStorage.setItem(storageKey, result.uri);
        setLocalUri(result.uri);
        setIsDownloaded(true);
        Alert.alert('Download Complete', `${material.title} is now available offline.`);
      }
    } catch (e) {
      console.error('Download failed:', e);
      Alert.alert('Download Failed', 'Could not download the file.');
    } finally {
      setIsDownloading(false);
      setDownloadProgress(0);
    }
  };

  const removeDownload = async () => {
    Alert.alert(
      'Remove Download',
      'Remove this file from offline storage?',
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Remove', 
          style: 'destructive',
          onPress: async () => {
            if (localUri) {
              try {
                await FileSystem.deleteAsync(localUri, { idempotent: true });
                await AsyncStorage.removeItem(storageKey);
                setIsDownloaded(false);
                setLocalUri(null);
              } catch (e) {
                console.error('Remove failed:', e);
              }
            }
          }
        }
      ]
    );
  };

  const canDownload = material.content_url && material.type !== 'notes_text';

  return (
    <View style={[styles.materialRow, { borderTopColor: colors.border }]}>
      <Pressable style={styles.materialRowContent} onPress={handlePress}>
        <Feather name={iconName} size={16} color={colors.textSecondary} />
        <View style={{ flex: 1 }}>
          <Text style={[styles.materialTitle, { color: colors.text }]} numberOfLines={1}>
            {material.title}
          </Text>
          {isDownloading && (
            <View style={styles.progressContainer}>
              <View style={[styles.progressBar, { backgroundColor: colors.border }]}>
                <View style={[styles.progressFill, { backgroundColor: colors.primary, width: `${Math.max(5, downloadProgress * 100)}%` }]} />
              </View>
              <Text style={[styles.progressText, { color: colors.textSecondary }]}>
                {Math.round(downloadProgress * 100)}%
              </Text>
            </View>
          )}
        </View>
      </Pressable>
      
      <View style={styles.actionsRow}>
        {canDownload && !isDownloading && (
          isDownloaded ? (
            <Pressable style={styles.actionButton} onPress={removeDownload}>
              <Feather name="check-circle" size={16} color="#10B981" />
            </Pressable>
          ) : (
            <Pressable style={styles.actionButton} onPress={downloadFile}>
              <Feather name="download-cloud" size={16} color={colors.primary} />
            </Pressable>
          )
        )}
        
        {isDownloading && (
          <ActivityIndicator size="small" color={colors.primary} style={styles.actionButton} />
        )}

        {isTeacher && (
          <Pressable style={styles.actionButton} onPress={() => onDelete(material.id)}>
            <Feather name="trash-2" size={16} color={colors.error} />
          </Pressable>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  materialRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
    borderTopWidth: 1,
  },
  materialRowContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  materialTitle: {
    fontSize: typography.sizes.sm,
  },
  actionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  actionButton: {
    padding: spacing.xs,
  },
  progressContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: 2,
  },
  progressBar: {
    flex: 1,
    height: 4,
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 2,
  },
  progressText: {
    fontSize: 10,
    width: 24,
  }
});
