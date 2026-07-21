import React, { useState, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, Linking, Alert, LayoutAnimation, UIManager, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { BlurView } from 'expo-blur';
import { Feather } from '@expo/vector-icons';
import { spacing, typography, borderRadius, useThemeColors } from '@/constants/theme';
import { GlobalWatermark } from '@/components/GlobalWatermark';

// Enable LayoutAnimation on Android
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const FAQ_DATA = [
  {
    question: "How do I switch from ZIMSEC to Cambridge?",
    answer: "You can switch your syllabus at any time by going to your Profile, tapping 'Account Settings', and updating your 'Academic Journey' preferences. The dashboard will instantly update to show relevant courses."
  },
  {
    question: "How does the AI Exam Intelligence work?",
    answer: "Mentora's AI analyzes thousands of past papers to determine which topics appear most frequently. It builds custom mock exams for you based strictly on high-probability questions to maximize your study efficiency."
  },
  {
    question: "How do I cancel my Mentora Pro subscription?",
    answer: "If you have a Pro subscription, go to Account Settings > Subscription, and tap 'Manage Plan'. You can cancel at any time, and you will retain Pro access until the end of your billing cycle."
  },
  {
    question: "I found a bug in a quiz, what should I do?",
    answer: "Please use the 'Email Us' button below and let us know exactly which quiz you were taking. We'll fix it right away!"
  }
];

export default function SupportScreen() {
  const router = useRouter();
  const colors = useThemeColors();
  const isLightMode = colors.background === '#F8FAFC';
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [expandedFAQ, setExpandedFAQ] = useState<number | null>(null);

  const toggleFAQ = (index: number) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpandedFAQ(expandedFAQ === index ? null : index);
  };

  const handleEmailSupport = () => {
    Linking.openURL('mailto:support@mentora.com?subject=Mentora%20Support%20Request');
  };

  const handleLiveChat = () => {
    Alert.alert("Live Chat", "Connecting to an agent... (This is a placeholder for Intercom/Crisp integration).");
  };

  const handleCommunityGuidelines = () => {
    Alert.alert("Community Guidelines", "Be respectful, keep discussions academic, and do not share personal information. (This would open a full policy page).");
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <GlobalWatermark />
      
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <Feather name="arrow-left" size={24} color={colors.text} />
        </Pressable>
        <Text style={styles.headerTitle}>Help & Support</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        
        {/* Quick Contact Row */}
        <View style={styles.contactRow}>
          <Pressable style={styles.contactCard} onPress={handleEmailSupport}>
            <BlurView intensity={75} tint={isLightMode ? "light" : "dark"} style={StyleSheet.absoluteFillObject} />
            <View style={styles.contactIconContainer}>
              <Feather name="mail" size={24} color={colors.primary} />
            </View>
            <Text style={styles.contactTitle}>Email Us</Text>
            <Text style={styles.contactSubtitle}>Get help within 24h</Text>
          </Pressable>

          <Pressable style={styles.contactCard} onPress={handleLiveChat}>
            <BlurView intensity={75} tint={isLightMode ? "light" : "dark"} style={StyleSheet.absoluteFillObject} />
            <View style={styles.contactIconContainer}>
              <Feather name="message-circle" size={24} color={colors.primary} />
            </View>
            <Text style={styles.contactTitle}>Live Chat</Text>
            <Text style={styles.contactSubtitle}>Chat with a human</Text>
          </Pressable>
        </View>

        {/* FAQs */}
        <View style={styles.section}>
          <BlurView intensity={75} tint={isLightMode ? "light" : "dark"} style={StyleSheet.absoluteFillObject} />
          <View style={styles.sectionHeader}>
            <Feather name="help-circle" size={20} color={colors.primary} />
            <Text style={styles.sectionTitle}>Frequently Asked Questions</Text>
          </View>
          
          <View style={styles.faqContainer}>
            {FAQ_DATA.map((faq, index) => {
              const isExpanded = expandedFAQ === index;
              return (
                <View key={index} style={[styles.faqItem, index === FAQ_DATA.length - 1 && styles.lastFaqItem]}>
                  <Pressable 
                    style={styles.faqQuestionRow} 
                    onPress={() => toggleFAQ(index)}
                  >
                    <Text style={[styles.faqQuestion, isExpanded && { color: colors.primary }]}>
                      {faq.question}
                    </Text>
                    <Feather 
                      name={isExpanded ? "chevron-up" : "chevron-down"} 
                      size={20} 
                      color={isExpanded ? colors.primary : colors.textSecondary} 
                    />
                  </Pressable>
                  {isExpanded && (
                    <Text style={styles.faqAnswer}>{faq.answer}</Text>
                  )}
                </View>
              );
            })}
          </View>
        </View>

        {/* Guidelines & Legal */}
        <View style={styles.section}>
          <BlurView intensity={75} tint={isLightMode ? "light" : "dark"} style={StyleSheet.absoluteFillObject} />
          <Pressable style={styles.menuItem} onPress={handleCommunityGuidelines}>
            <Feather name="shield" size={20} color={colors.text} />
            <Text style={styles.menuItemText}>Community Guidelines</Text>
            <Feather name="chevron-right" size={20} color={colors.textSecondary} />
          </Pressable>
          <Pressable 
            style={styles.menuItem}
            onPress={() => router.push('/settings/terms')}
          >
            <Feather name="file-text" size={20} color={colors.text} />
            <Text style={styles.menuItemText}>Terms of Service</Text>
            <Feather name="chevron-right" size={20} color={colors.textSecondary} />
          </Pressable>
          <Pressable 
            style={[styles.menuItem, styles.lastMenuItem]}
            onPress={() => router.push('/settings/privacy')}
          >
            <Feather name="lock" size={20} color={colors.text} />
            <Text style={styles.menuItemText}>Privacy Policy</Text>
            <Feather name="chevron-right" size={20} color={colors.textSecondary} />
          </Pressable>
        </View>

        {/* System Status Footer */}
        <View style={styles.footer}>
          <View style={styles.statusRow}>
            <View style={styles.statusDot} />
            <Text style={styles.statusText}>All systems operational</Text>
          </View>
          <Text style={styles.versionText}>Mentora App v1.0.0</Text>
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
  contactRow: {
    flexDirection: 'row',
    gap: spacing.md,
    marginBottom: spacing.xl,
  },
  contactCard: {
    flex: 1,
    backgroundColor: 'transparent',
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  contactIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  contactTitle: {
    fontSize: typography.sizes.md,
    fontWeight: typography.weights.bold,
    color: colors.text,
    marginBottom: 4,
  },
  contactSubtitle: {
    fontSize: typography.sizes.xs,
    color: colors.textSecondary,
  },
  section: {
    backgroundColor: 'transparent',
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.xl,
    overflow: 'hidden',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    gap: spacing.sm,
  },
  sectionTitle: {
    fontSize: typography.sizes.md,
    fontWeight: typography.weights.bold,
    color: colors.text,
  },
  faqContainer: {
    padding: spacing.md,
  },
  faqItem: {
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingVertical: spacing.md,
  },
  lastFaqItem: {
    borderBottomWidth: 0,
    paddingBottom: spacing.xs,
  },
  faqQuestionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.sm,
  },
  faqQuestion: {
    flex: 1,
    fontSize: typography.sizes.sm,
    fontWeight: typography.weights.semibold,
    color: colors.text,
    marginRight: spacing.md,
  },
  faqAnswer: {
    fontSize: typography.sizes.sm,
    color: colors.textSecondary,
    lineHeight: 20,
    marginTop: spacing.md,
    paddingHorizontal: spacing.sm,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  lastMenuItem: {
    borderBottomWidth: 0,
  },
  menuItemText: {
    flex: 1,
    marginLeft: spacing.md,
    fontSize: typography.sizes.md,
    color: colors.text,
    fontWeight: typography.weights.medium,
  },
  footer: {
    alignItems: 'center',
    marginTop: spacing.md,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.full,
    marginBottom: spacing.sm,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.success,
    marginRight: spacing.sm,
  },
  statusText: {
    fontSize: typography.sizes.xs,
    fontWeight: typography.weights.semibold,
    color: colors.success,
  },
  versionText: {
    fontSize: typography.sizes.xs,
    color: colors.textTertiary,
  },
});
