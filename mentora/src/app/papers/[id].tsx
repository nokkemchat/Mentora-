import React, { useEffect } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useThemeColors } from '@/constants/theme';

export default function PaperRedirectScreen() {
  const params = useLocalSearchParams<{ id: string; title?: string; subject?: string; curriculum?: string }>();
  const router = useRouter();
  const colors = useThemeColors();

  useEffect(() => {
    // Automatically redirect to the full PDF viewer with Question Paper Tutor Modal
    router.replace({
      pathname: '/viewer',
      params: {
        uri: 'https://akjbejexhdawelrfygub.supabase.co/storage/v1/object/public/past_papers/pending/Pending_ox21_qp.pdf',
        type: 'pdf',
        title: params.title || 'Cambridge Chemistry Paper 4',
        paperId: params.id || '21f06556-c22c-4890-bec6-6e7119ffb86e',
        subject: params.subject || 'Chemistry',
        curriculum: params.curriculum || 'Cambridge'
      }
    } as any);
  }, [params.id]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center' }}>
      <ActivityIndicator size="small" color={colors.primary} />
    </View>
  );
}
