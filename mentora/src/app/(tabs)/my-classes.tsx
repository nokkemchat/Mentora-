import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { spacing, typography, useThemeColors } from '@/constants/theme';
import { Ionicons } from '@expo/vector-icons';
import { GlobalWatermark } from '../../components/GlobalWatermark';

export default function MyClassesScreen() {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <GlobalWatermark />
      <View style={styles.content}>
        <Text style={styles.headerTitle}>My Classes</Text>
        <Text style={styles.headerSubtitle}>Subjects you are currently enrolled in.</Text>
        
        <View style={styles.emptyState}>
          <Ionicons name="book-outline" size={64} color={colors.border} />
          <Text style={styles.emptyTitle}>No active courses</Text>
          <Text style={styles.emptySubtitle}>You haven't enrolled in any courses yet. Head over to the Explore tab to find subjects tailored to your syllabus!</Text>
        </View>
      </View>
    </SafeAreaView>
  );
}

const createStyles = (colors: any) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.xl, paddingTop: spacing.xxxl, flex: 1 },
  headerTitle: { fontSize: typography.sizes.xxl, fontWeight: typography.weights.bold, color: colors.text },
  headerSubtitle: { fontSize: typography.sizes.md, color: colors.textSecondary, marginBottom: spacing.xxxl, marginTop: spacing.xs },
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xxxl },
  emptyTitle: { fontSize: typography.sizes.lg, fontWeight: typography.weights.bold, color: colors.text, marginTop: spacing.lg },
  emptySubtitle: { fontSize: typography.sizes.md, color: colors.textSecondary, textAlign: 'center', marginTop: spacing.sm, lineHeight: 24 },
});
