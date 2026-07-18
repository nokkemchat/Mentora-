import React, { useMemo, useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, SafeAreaView, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { spacing, typography, borderRadius, useThemeColors } from '@/constants/theme';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';

export default function CareerDetailsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [career, setCareer] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;

    const fetchCareer = async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from('careers')
        .select(`
          *,
          career_required_subjects (*),
          career_roadmaps (*)
        `)
        .eq('id', id)
        .single();

      if (!error && data) {
        // Sort roadmaps by step_order
        if (data.career_roadmaps) {
          data.career_roadmaps.sort((a: any, b: any) => a.step_order - b.step_order);
        }
        setCareer(data);
      }
      setLoading(false);
    };

    fetchCareer();
  }, [id]);

  if (loading) {
    return (
      <SafeAreaView style={[styles.safeArea, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </SafeAreaView>
    );
  }

  if (!career) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={styles.backNav}>
            <Feather name="arrow-left" size={24} color={colors.text} />
          </Pressable>
        </View>
        <Text style={{ color: colors.text, padding: 20 }}>Career not found.</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        
        {/* Header */}
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={styles.backNav}>
            <Feather name="arrow-left" size={24} color={colors.text} />
          </Pressable>
        </View>

        {/* Hero Section */}
        <View style={styles.heroSection}>
          <View style={[styles.heroIconContainer, { backgroundColor: career.color }]}>
            <Feather name={career.icon as any} size={48} color={colors.background} />
          </View>
          <Text style={styles.careerTitle}>{career.title}</Text>
          <Text style={styles.careerDescription}>{career.description}</Text>
          
          <View style={styles.badgesRow}>
            <View style={styles.demandBadge}>
              <Feather name="trending-up" size={14} color={colors.background} />
              <Text style={styles.demandText}>{career.demand_level} Demand</Text>
            </View>
          </View>
        </View>

        {/* Salary Insights */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Salary Insights</Text>
          <View style={styles.salaryCard}>
            <View style={styles.salaryItem}>
              <Text style={styles.salaryLabel}>Entry Level</Text>
              <Text style={styles.salaryAmount}>${career.expected_salary_entry?.toLocaleString()}</Text>
              <Text style={styles.salarySub}>per year</Text>
            </View>
            <View style={styles.salaryDivider} />
            <View style={styles.salaryItem}>
              <Text style={styles.salaryLabel}>Senior Level</Text>
              <Text style={styles.salaryAmount}>${career.expected_salary_senior?.toLocaleString()}</Text>
              <Text style={styles.salarySub}>per year</Text>
            </View>
          </View>
        </View>

        {/* Required Subjects */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Required Subjects</Text>
          <View style={styles.subjectsCard}>
            {career.career_required_subjects?.map((subject: any, index: number) => (
              <View key={subject.id || index}>
                <View style={styles.subjectRow}>
                  <View style={styles.subjectInfo}>
                    <Text style={styles.subjectName}>{subject.subject}</Text>
                    <Text style={styles.subjectLevel}>{subject.level}</Text>
                  </View>
                  <View style={styles.gradeBadge}>
                    <Text style={styles.gradeText}>Min. {subject.minimum_grade}</Text>
                  </View>
                </View>
                {index < career.career_required_subjects.length - 1 && <View style={styles.divider} />}
              </View>
            ))}
          </View>
        </View>

        {/* Career Roadmap */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>The Roadmap</Text>
          <View style={styles.roadmapContainer}>
            {career.career_roadmaps?.map((step: any, index: number) => (
              <View key={step.id || index} style={styles.roadmapStep}>
                {/* Timeline Line */}
                <View style={styles.timelineCol}>
                  <View style={[styles.timelineDot, { backgroundColor: career.color }]} />
                  {index < career.career_roadmaps.length - 1 && <View style={[styles.timelineLine, { backgroundColor: career.color }]} />}
                </View>
                
                {/* Content */}
                <View style={styles.stepContent}>
                  <Text style={styles.stepTitle}>{step.title}</Text>
                  <Text style={styles.stepDuration}>{step.duration}</Text>
                  <Text style={styles.stepDescription}>{step.description}</Text>
                </View>
              </View>
            ))}
          </View>
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}

const createStyles = (colors: any) => StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  container: {
    flex: 1,
  },
  content: {
    padding: spacing.xl,
    paddingTop: spacing.xxl,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  backNav: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  heroSection: {
    alignItems: 'center',
    marginBottom: spacing.xxxl,
    paddingHorizontal: spacing.md,
  },
  heroIconContainer: {
    width: 96,
    height: 96,
    borderRadius: 48,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  careerTitle: {
    fontSize: typography.sizes.xxl,
    fontWeight: typography.weights.bold,
    color: colors.text,
    textAlign: 'center',
    marginBottom: spacing.xs,
  },
  careerDescription: {
    fontSize: typography.sizes.md,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.lg,
    lineHeight: 22,
  },
  badgesRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  demandBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.full,
    gap: spacing.xs,
  },
  demandText: {
    color: colors.background,
    fontWeight: typography.weights.bold,
    fontSize: typography.sizes.sm,
  },
  section: {
    marginBottom: spacing.xxxl,
  },
  sectionTitle: {
    fontSize: typography.sizes.lg,
    fontWeight: typography.weights.bold,
    color: colors.text,
    marginBottom: spacing.md,
  },
  salaryCard: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.xl,
  },
  salaryItem: {
    flex: 1,
    alignItems: 'center',
  },
  salaryLabel: {
    fontSize: typography.sizes.sm,
    color: colors.textSecondary,
    fontWeight: typography.weights.semibold,
    marginBottom: spacing.xs,
  },
  salaryAmount: {
    fontSize: typography.sizes.xl,
    fontWeight: typography.weights.bold,
    color: colors.success,
  },
  salarySub: {
    fontSize: 10,
    color: colors.textSecondary,
    marginTop: 2,
  },
  salaryDivider: {
    width: 1,
    backgroundColor: colors.border,
    marginHorizontal: spacing.lg,
  },
  subjectsCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
  },
  subjectRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.sm,
  },
  subjectInfo: {
    flex: 1,
  },
  subjectName: {
    fontSize: typography.sizes.md,
    fontWeight: typography.weights.bold,
    color: colors.text,
  },
  subjectLevel: {
    fontSize: typography.sizes.xs,
    color: colors.textSecondary,
    marginTop: 2,
  },
  gradeBadge: {
    backgroundColor: colors.primaryLight,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: borderRadius.sm,
  },
  gradeText: {
    fontSize: typography.sizes.sm,
    fontWeight: typography.weights.bold,
    color: colors.primary,
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: spacing.xs,
  },
  roadmapContainer: {
    paddingLeft: spacing.sm,
  },
  roadmapStep: {
    flexDirection: 'row',
    marginBottom: spacing.lg,
  },
  timelineCol: {
    width: 32,
    alignItems: 'center',
    marginRight: spacing.md,
  },
  timelineDot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 4,
    borderColor: colors.primaryLight,
    zIndex: 1,
  },
  timelineLine: {
    width: 2,
    flex: 1,
    opacity: 0.2,
    marginTop: -8,
    marginBottom: -24,
  },
  stepContent: {
    flex: 1,
    backgroundColor: colors.surface,
    padding: spacing.lg,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  stepTitle: {
    fontSize: typography.sizes.md,
    fontWeight: typography.weights.bold,
    color: colors.text,
  },
  stepDuration: {
    fontSize: typography.sizes.xs,
    color: colors.textSecondary,
    fontWeight: typography.weights.semibold,
    marginTop: 4,
    marginBottom: spacing.sm,
  },
  stepDescription: {
    fontSize: typography.sizes.sm,
    color: colors.textSecondary,
    lineHeight: 20,
  },
});
