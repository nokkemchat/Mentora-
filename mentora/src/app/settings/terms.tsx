import React, { useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { BlurView } from 'expo-blur';
import { Feather } from '@expo/vector-icons';
import { spacing, typography, borderRadius, useThemeColors } from '@/constants/theme';
import { GlobalWatermark } from '@/components/GlobalWatermark';

export default function TermsOfServiceScreen() {
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
        <Text style={styles.headerTitle}>Terms of Service</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.section}>
          <BlurView intensity={75} tint={isLightMode ? "light" : "dark"} style={StyleSheet.absoluteFillObject} />
          
          <View style={styles.documentBody}>
            <Text style={styles.lastUpdated}>Last Updated: July 2026</Text>
            
            <Text style={styles.h1}>1. Acceptance of Terms</Text>
            <Text style={styles.paragraph}>
              By accessing and using Mentora, you accept and agree to be bound by the terms and provision of this agreement. 
              In addition, when using these particular services, you shall be subject to any posted guidelines or rules applicable to such services.
            </Text>
            
            <Text style={styles.h1}>2. Description of Service</Text>
            <Text style={styles.paragraph}>
              Mentora provides users with access to a rich collection of educational resources, including AI-driven exam intelligence, video courses, live study rooms, and community forums. 
              You understand and agree that the service is provided "AS-IS" and that Mentora assumes no responsibility for the timeliness, deletion, mis-delivery, or failure to store any user communications or personalization settings.
            </Text>

            <Text style={styles.h1}>3. User Conduct</Text>
            <Text style={styles.paragraph}>
              You understand that all information, data, text, software, music, sound, photographs, graphics, video, messages, or other materials ("Content"), whether publicly posted or privately transmitted, are the sole responsibility of the person from which such Content originated. 
              This means that you, and not Mentora, are entirely responsible for all Content that you upload, post, email, transmit, or otherwise make available via the Service.
            </Text>

            <Text style={styles.h1}>4. Mentora Pro Subscriptions</Text>
            <Text style={styles.paragraph}>
              Certain premium features (like advanced AI mock exams) require a Mentora Pro subscription. 
              Subscriptions are billed in advance on a monthly or annual basis and are non-refundable for the subscription period they are purchased for. 
              You may cancel your subscription at any time through the Account Settings.
            </Text>

            <Text style={styles.h1}>5. Termination</Text>
            <Text style={styles.paragraph}>
              You agree that Mentora may, under certain circumstances and without prior notice, immediately terminate your Mentora account and access to the Service. 
              Cause for such termination shall include, but not be limited to: breaches or violations of the Terms of Service or other incorporated agreements or guidelines; requests by law enforcement or other government agencies; a request by you; or unexpected technical or security issues.
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
