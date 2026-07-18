import React, { useMemo, useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, SafeAreaView, Image, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { spacing, typography, borderRadius, useThemeColors } from '@/constants/theme';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';

export default function CareerHubScreen() {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const router = useRouter();

  const [careers, setCareers] = useState<any[]>([]);
  const [universities, setUniversities] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      
      const [careersRes, unisRes] = await Promise.all([
        supabase.from('careers').select('*'),
        supabase.from('universities').select('*')
      ]);

      if (careersRes.data) setCareers(careersRes.data);
      if (unisRes.data) setUniversities(unisRes.data);
      
      setLoading(false);
    };

    fetchData();
  }, []);

  if (loading) {
    return (
      <SafeAreaView style={[styles.safeArea, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color={colors.primary} />
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
          <Text style={styles.headerTitle}>Career Hub</Text>
        </View>

        {/* Hero Section */}
        <View style={styles.heroCard}>
          <View style={styles.heroInfo}>
            <Text style={styles.heroTitle}>Plan Your Future</Text>
            <Text style={styles.heroSubtitle}>Explore careers, find the perfect university, and discover scholarships.</Text>
          </View>
          <Feather name="compass" size={64} color="rgba(255,255,255,0.2)" style={styles.heroIcon} />
        </View>

        {/* Career Explorer */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Explore Careers</Text>
            <Pressable>
              <Text style={styles.viewAll}>View All</Text>
            </Pressable>
          </View>
          
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.horizontalScroll}>
            {careers.map((career) => (
              <Pressable 
                key={career.id} 
                style={styles.careerCard}
                onPress={() => router.push(`/careers/${career.id}`)}
              >
                <View style={[styles.iconContainer, { backgroundColor: career.color }]}>
                  <Feather name={career.icon as any} size={28} color={colors.background} />
                </View>
                <Text style={styles.careerTitle}>{career.title}</Text>
                <View style={styles.salaryBadge}>
                  <Text style={styles.salaryText}>Est. ${career.expected_salary_entry.toLocaleString()}/yr</Text>
                </View>
              </Pressable>
            ))}
          </ScrollView>
        </View>

        {/* University Finder */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Top Universities</Text>
            <Pressable>
              <Text style={styles.viewAll}>Search All</Text>
            </Pressable>
          </View>
          
          {universities.map((uni) => (
            <Pressable key={uni.id} style={styles.uniCard}>
              <Image source={{ uri: uni.image }} style={styles.uniImage} />
              <View style={styles.uniInfo}>
                <Text style={styles.uniName}>{uni.name}</Text>
                <View style={styles.uniLocationRow}>
                  <Feather name="map-pin" size={12} color={colors.textSecondary} />
                  <Text style={styles.uniLocation}>{uni.location}</Text>
                </View>
                <View style={styles.uniTagsContainer}>
                  {uni.top_programs?.map((program: string, index: number) => (
                    <View key={index} style={styles.uniTag}>
                      <Text style={styles.uniTagText}>{program}</Text>
                    </View>
                  ))}
                </View>
              </View>
            </Pressable>
          ))}
        </View>

        {/* Scholarships */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Featured Scholarships</Text>
          
          <Pressable style={styles.scholarshipCard}>
            <View style={styles.scholarshipIconContainer}>
              <MaterialCommunityIcons name="seal" size={32} color="#F59E0B" />
            </View>
            <View style={styles.scholarshipInfo}>
              <Text style={styles.scholarshipTitle}>Presidential STEM Scholarship</Text>
              <Text style={styles.scholarshipSubtitle}>Full tuition for top Mathematics students.</Text>
              <Text style={styles.scholarshipDeadline}>Deadline: Oct 15, 2026</Text>
            </View>
            <Feather name="chevron-right" size={24} color={colors.textSecondary} />
          </Pressable>
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
    paddingTop: spacing.xxxl,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  backNav: {
    marginRight: spacing.md,
  },
  headerTitle: {
    fontSize: typography.sizes.xl,
    fontWeight: typography.weights.bold,
    color: colors.text,
  },
  heroCard: {
    flexDirection: 'row',
    backgroundColor: colors.primary,
    borderRadius: borderRadius.lg,
    padding: spacing.xl,
    marginBottom: spacing.xxxl,
    overflow: 'hidden',
    position: 'relative',
  },
  heroInfo: {
    flex: 1,
    zIndex: 1,
  },
  heroTitle: {
    fontSize: typography.sizes.xl,
    fontWeight: typography.weights.bold,
    color: colors.background,
    marginBottom: spacing.xs,
  },
  heroSubtitle: {
    fontSize: typography.sizes.sm,
    color: 'rgba(255, 255, 255, 0.8)',
    lineHeight: 20,
  },
  heroIcon: {
    position: 'absolute',
    right: -10,
    bottom: -10,
    zIndex: 0,
  },
  section: {
    marginBottom: spacing.xxxl,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  sectionTitle: {
    fontSize: typography.sizes.lg,
    fontWeight: typography.weights.bold,
    color: colors.text,
  },
  viewAll: {
    fontSize: typography.sizes.sm,
    fontWeight: typography.weights.bold,
    color: colors.primary,
  },
  horizontalScroll: {
    paddingRight: spacing.xl,
    gap: spacing.md,
  },
  careerCard: {
    width: 160,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  iconContainer: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  careerTitle: {
    fontSize: typography.sizes.md,
    fontWeight: typography.weights.bold,
    color: colors.text,
    marginBottom: spacing.md,
  },
  salaryBadge: {
    backgroundColor: colors.surfaceHighlight,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: borderRadius.sm,
    alignSelf: 'flex-start',
  },
  salaryText: {
    fontSize: 10,
    fontWeight: typography.weights.bold,
    color: colors.success,
  },
  uniCard: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.md,
    overflow: 'hidden',
  },
  uniImage: {
    width: 100,
    height: '100%',
  },
  uniInfo: {
    flex: 1,
    padding: spacing.md,
  },
  uniName: {
    fontSize: typography.sizes.md,
    fontWeight: typography.weights.bold,
    color: colors.text,
    marginBottom: 4,
  },
  uniLocationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: spacing.md,
  },
  uniLocation: {
    fontSize: typography.sizes.xs,
    color: colors.textSecondary,
  },
  uniTagsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  uniTag: {
    backgroundColor: colors.primaryLight,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: borderRadius.sm,
  },
  uniTagText: {
    fontSize: 10,
    fontWeight: typography.weights.bold,
    color: colors.primary,
  },
  scholarshipCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  scholarshipIconContainer: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(245, 158, 11, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  scholarshipInfo: {
    flex: 1,
  },
  scholarshipTitle: {
    fontSize: typography.sizes.md,
    fontWeight: typography.weights.bold,
    color: colors.text,
    marginBottom: 4,
  },
  scholarshipSubtitle: {
    fontSize: typography.sizes.xs,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
  },
  scholarshipDeadline: {
    fontSize: 10,
    fontWeight: typography.weights.bold,
    color: colors.error,
  },
});
