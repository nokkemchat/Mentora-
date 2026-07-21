import React, { useMemo, useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, SafeAreaView, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { spacing, typography, borderRadius, useThemeColors } from '@/constants/theme';
import { Feather, MaterialIcons } from '@expo/vector-icons';

export default function TeacherDashboardScreen() {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const router = useRouter();

  const [stats, setStats] = useState<any>({
    total_revenue: 0,
    pending_payout: 0,
    total_students: 0,
    average_rating: 0.0,
    teacher_courses: []
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchDashboard = async () => {
      setLoading(true);
      
      // Note: This relies on Supabase Auth. If no user is logged in, 
      // RLS will return 0 rows.
      const { data: session } = await supabase.auth.getSession();
      
      if (session?.session?.user) {
        const { data, error } = await supabase
          .from('teacher_stats')
          .select(`
            *,
            teacher_courses (*)
          `)
          .eq('teacher_id', session.session.user.id)
          .single();

        if (!error && data) {
          setStats(data);
        }
      }
      setLoading(false);
    };

    fetchDashboard();
  }, []);

  if (loading) {
    return (
      <SafeAreaView style={[styles.safeArea, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </SafeAreaView>
    );
  }

  const { total_revenue, pending_payout, total_students, average_rating, teacher_courses } = stats;

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        
        {/* Header */}
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={styles.backNav}>
            <Feather name="arrow-left" size={24} color={colors.text} />
          </Pressable>
          <View style={styles.headerTitleContainer}>
            <Text style={styles.headerTitle}>Teacher Portal</Text>
            <View style={styles.proBadge}>
              <Text style={styles.proBadgeText}>PRO CREATOR</Text>
            </View>
          </View>
        </View>

        {/* Financial Summary Card */}
        <View style={styles.financeCard}>
          <Text style={styles.financeLabel}>Total Earnings</Text>
          <Text style={styles.financeAmount}>${(total_revenue || 0).toFixed(2)}</Text>
          
          <View style={styles.financeDivider} />
          
          <View style={styles.financeStatsRow}>
            <View style={styles.financeStatItem}>
              <Text style={styles.financeStatValue}>${(pending_payout || 0).toFixed(2)}</Text>
              <Text style={styles.financeStatLabel}>Next Payout</Text>
            </View>
            <View style={styles.financeStatItem}>
              <Text style={styles.financeStatValue}>{total_students || 0}</Text>
              <Text style={styles.financeStatLabel}>Active Students</Text>
            </View>
            <View style={styles.financeStatItem}>
              <Text style={styles.financeStatValue}>⭐ {average_rating || '0.0'}</Text>
              <Text style={styles.financeStatLabel}>Avg Rating</Text>
            </View>
          </View>
        </View>

        {/* Quick Actions Grid */}
        <Text style={styles.sectionTitle}>Quick Actions</Text>
        <View style={styles.actionGrid}>

          
          <Pressable style={styles.actionCard}>
            <View style={[styles.actionIconContainer, { backgroundColor: 'rgba(16, 185, 129, 0.1)' }]}>
              <Feather name="video" size={24} color="#10B981" />
            </View>
            <Text style={styles.actionCardTitle}>Go Live</Text>
          </Pressable>
          
          <Pressable style={styles.actionCard}>
            <View style={[styles.actionIconContainer, { backgroundColor: 'rgba(139, 92, 246, 0.1)' }]}>
              <Feather name="pie-chart" size={24} color="#8B5CF6" />
            </View>
            <Text style={styles.actionCardTitle}>Analytics</Text>
          </Pressable>
          
          <Pressable style={styles.actionCard}>
            <View style={[styles.actionIconContainer, { backgroundColor: 'rgba(245, 158, 11, 0.1)' }]}>
              <MaterialIcons name="payments" size={24} color="#F59E0B" />
            </View>
            <Text style={styles.actionCardTitle}>Payouts</Text>
          </Pressable>
        </View>

        {/* Active Courses */}
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionTitle}>Your Courses</Text>
          <Pressable>
            <Text style={styles.viewAllText}>View All</Text>
          </Pressable>
        </View>

        {teacher_courses?.length === 0 ? (
          <Text style={{ color: colors.textSecondary, textAlign: 'center', marginTop: 20 }}>
            You haven't created any courses yet.
          </Text>
        ) : (
          teacher_courses?.map((course: any) => (
            <View key={course.id} style={styles.courseCard}>
              <View style={styles.courseCardHeader}>
                <Text style={styles.courseTitle}>{course.title}</Text>
                <View style={[styles.statusBadge, course.status === 'Published' ? styles.statusPublished : styles.statusDraft]}>
                  <Text style={[styles.statusText, course.status === 'Published' ? styles.statusTextPublished : styles.statusTextDraft]}>
                    {course.status}
                  </Text>
                </View>
              </View>
              
              <View style={styles.courseMetricsRow}>
                <View style={styles.courseMetric}>
                  <Feather name="users" size={14} color={colors.textSecondary} />
                  <Text style={styles.courseMetricText}>{course.active_students} students</Text>
                </View>
                <View style={styles.courseMetric}>
                  <Feather name="star" size={14} color={colors.warning} />
                  <Text style={styles.courseMetricText}>{course.rating}</Text>
                </View>
                <View style={styles.courseMetric}>
                  <Feather name="dollar-sign" size={14} color={colors.success} />
                  <Text style={styles.courseMetricText}>${(course.revenue_generated || 0).toFixed(2)}</Text>
                </View>
              </View>
              
              <View style={styles.courseCardActions}>
                <Pressable style={styles.courseEditBtn}>
                  <Feather name="edit-2" size={16} color={colors.primary} />
                  <Text style={styles.courseEditBtnText}>Edit Course</Text>
                </Pressable>
              </View>
            </View>
          ))
        )}

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
    marginBottom: spacing.xxl,
  },
  backNav: {
    marginRight: spacing.md,
  },
  headerTitleContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  headerTitle: {
    fontSize: typography.sizes.xl,
    fontWeight: typography.weights.bold,
    color: colors.text,
  },
  proBadge: {
    backgroundColor: colors.warning,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  proBadgeText: {
    color: colors.background,
    fontSize: 10,
    fontWeight: typography.weights.bold,
  },
  financeCard: {
    backgroundColor: colors.primary,
    borderRadius: borderRadius.lg,
    padding: spacing.xl,
    marginBottom: spacing.xxl,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
  },
  financeLabel: {
    color: 'rgba(255, 255, 255, 0.8)',
    fontSize: typography.sizes.md,
    fontWeight: typography.weights.medium,
  },
  financeAmount: {
    color: colors.background,
    fontSize: 40,
    fontWeight: typography.weights.bold,
    marginTop: spacing.xs,
  },
  financeDivider: {
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    marginVertical: spacing.lg,
  },
  financeStatsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  financeStatItem: {
    alignItems: 'flex-start',
  },
  financeStatValue: {
    color: colors.background,
    fontSize: typography.sizes.lg,
    fontWeight: typography.weights.bold,
  },
  financeStatLabel: {
    color: 'rgba(255, 255, 255, 0.8)',
    fontSize: typography.sizes.xs,
    marginTop: 2,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  sectionTitle: {
    fontSize: typography.sizes.lg,
    fontWeight: typography.weights.bold,
    color: colors.text,
    marginBottom: spacing.md,
  },
  viewAllText: {
    color: colors.primary,
    fontSize: typography.sizes.sm,
    fontWeight: typography.weights.semibold,
  },
  actionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
    marginBottom: spacing.xxxl,
  },
  actionCard: {
    width: '47%',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  actionIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  actionCardTitle: {
    fontSize: typography.sizes.sm,
    fontWeight: typography.weights.semibold,
    color: colors.text,
  },
  courseCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.md,
  },
  courseCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: spacing.md,
  },
  courseTitle: {
    flex: 1,
    fontSize: typography.sizes.md,
    fontWeight: typography.weights.bold,
    color: colors.text,
    marginRight: spacing.md,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  statusPublished: {
    backgroundColor: '#E8F5E9',
  },
  statusDraft: {
    backgroundColor: colors.surfaceHighlight,
  },
  statusText: {
    fontSize: 10,
    fontWeight: typography.weights.bold,
    textTransform: 'uppercase',
  },
  statusTextPublished: {
    color: colors.success,
  },
  statusTextDraft: {
    color: colors.textSecondary,
  },
  courseMetricsRow: {
    flexDirection: 'row',
    gap: spacing.lg,
    marginBottom: spacing.lg,
  },
  courseMetric: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  courseMetricText: {
    fontSize: typography.sizes.sm,
    color: colors.textSecondary,
    fontWeight: typography.weights.medium,
  },
  courseCardActions: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.md,
  },
  courseEditBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primaryLight,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.sm,
    gap: spacing.sm,
  },
  courseEditBtnText: {
    color: colors.primary,
    fontWeight: typography.weights.bold,
    fontSize: typography.sizes.sm,
  },
});

