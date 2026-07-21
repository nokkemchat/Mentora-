import React, { useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { BlurView } from 'expo-blur';
import { Feather } from '@expo/vector-icons';
import { spacing, typography, borderRadius, useThemeColors } from '@/constants/theme';
import { GlobalWatermark } from '@/components/GlobalWatermark';

export default function PrivacyPolicyScreen() {
  const router = useRouter();
  const colors = useThemeColors();
  const isLightMode = colors.background === '#F8FAFC';
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <GlobalWatermark />
      
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <Feather name="arrow-left" size={24} color={colors.text} />
        </Pressable>
        <Text style={styles.headerTitle}>Privacy Policy</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.section}>
          <BlurView intensity={75} tint={isLightMode ? "light" : "dark"} style={StyleSheet.absoluteFillObject} />
          
          <View style={styles.documentBody}>
            <Text style={styles.lastUpdated}>Last Updated: July 2026</Text>
            
            <Text style={styles.h1}>1. Information We Collect</Text>
            <Text style={styles.paragraph}>
              Mentora collects information you provide directly to us when you create an account, such as your name, email address, and academic syllabus (e.g., ZIMSEC, Cambridge). We also collect performance data, such as quiz scores and mock exam results, to power our AI Exam Intelligence.
            </Text>
            
            <Text style={styles.h1}>2. How We Use Your Information</Text>
            <Text style={styles.paragraph}>
              We use the information we collect to provide, maintain, and improve our educational services. Your quiz and exam data is processed by our AI to identify your weak points and generate personalized study plans and high-probability mock exams specifically tailored to your needs.
            </Text>

            <Text style={styles.h1}>3. Information Sharing</Text>
            <Text style={styles.paragraph}>
              Mentora does not sell your personal data to third parties. We may share aggregated, non-personally identifiable information publicly and with our partners (such as overall pass rates by syllabus). If you participate in Live Rooms or the Career Hub, your profile information (like your username) will be visible to other members.
            </Text>

            <Text style={styles.h1}>4. Data Security</Text>
            <Text style={styles.paragraph}>
              We take reasonable measures to help protect information about you from loss, theft, misuse, and unauthorized access. However, no data transmission over the internet or storage system can be guaranteed to be 100% secure.
            </Text>

            <Text style={styles.h1}>5. Your Choices</Text>
            <Text style={styles.paragraph}>
              You may update, correct, or delete your account information at any time by navigating to your Account Settings. If you wish to delete your account permanently, you can use the 'Danger Zone' section in Account Settings. Note that we may retain certain information as required by law or for legitimate business purposes.
            </Text>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
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
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  headerTitle: {
    fontSize: typography.sizes.lg,
    fontWeight: typography.weights.bold,
    color: colors.text,
  },
  content: {
    padding: spacing.xl,
    paddingBottom: 100,
  },
  section: {
    backgroundColor: 'transparent',
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.xl,
    overflow: 'hidden',
  },
  documentBody: {
    padding: spacing.xl,
  },
  lastUpdated: {
    fontSize: typography.sizes.sm,
    color: colors.textTertiary,
    marginBottom: spacing.xl,
    fontStyle: 'italic',
  },
  h1: {
    fontSize: typography.sizes.md,
    fontWeight: typography.weights.bold,
    color: colors.primary,
    marginBottom: spacing.sm,
  },
  paragraph: {
    fontSize: typography.sizes.sm,
    color: colors.textSecondary,
    lineHeight: 22,
    marginBottom: spacing.xl,
  }
});
