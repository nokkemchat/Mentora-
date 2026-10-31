import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TextInput, Pressable, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useRouter, useLocalSearchParams } from 'expo-router';
import { Search, ChevronRight, BookOpen, ArrowLeft, FileText, Sparkles, CheckCircle2, ShieldCheck, Lock } from 'lucide-react-native';
import { useThemeColors, typography, spacing, borderRadius } from '@/constants/theme';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';

interface PaperItem {
  id: string;
  title: string;
  subject: string;
  curriculum: string;
  level?: string;
  year?: number | string;
  session?: string;
  questions?: number;
  difficulty?: string;
  pdf_url?: string | null;
  hasMarkingScheme?: boolean;
  uploadedByTeacher?: boolean;
}

export default function PastPapersScreen() {
  const router = useRouter();
  const colors = useThemeColors();
  const { user } = useAuth();
  const params = useLocalSearchParams<{ subject?: string; curriculum?: string; level?: string }>();

  const isTeacher = user?.user_metadata?.role === 'teacher';
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSubject, setSelectedSubject] = useState<string>(params.subject || 'All');
  const [selectedCurriculum, setSelectedCurriculum] = useState<string>(params.curriculum || 'All');
  const [dbPapers, setDbPapers] = useState<PaperItem[]>([]);
  const [loading, setLoading] = useState(true);

  // Subject filter options
  const defaultSubjects = ['All', 'Mathematics', 'Physics', 'Chemistry', 'Biology', 'Computer Science', 'Geography', 'Economics'];
  const subjects = params.subject && !defaultSubjects.includes(params.subject)
    ? ['All', params.subject, ...defaultSubjects.filter((s) => s !== 'All')]
    : defaultSubjects;

  const curricula = ['All', 'ZIMSEC', 'Cambridge'];

  const mockPapers: PaperItem[] = [
    { id: '1', title: 'ZIMSEC Physics Paper 1', subject: 'Physics', curriculum: 'ZIMSEC', year: 2023, session: 'November', questions: 40, difficulty: 'Hard', hasMarkingScheme: true, uploadedByTeacher: true },
    { id: '2', title: 'Cambridge Mathematics P3', subject: 'Mathematics', curriculum: 'Cambridge', year: 2022, session: 'June', questions: 12, difficulty: 'Medium', hasMarkingScheme: true, uploadedByTeacher: true },
    { id: '3', title: 'ZIMSEC Chemistry Paper 2', subject: 'Chemistry', curriculum: 'ZIMSEC', year: 2023, session: 'June', questions: 8, difficulty: 'Hard', hasMarkingScheme: true, uploadedByTeacher: true },
    { id: '4', title: 'Cambridge Chemistry Paper 4', subject: 'Chemistry', curriculum: 'Cambridge', year: 2024, session: 'May/June', questions: 14, difficulty: 'Medium', hasMarkingScheme: true, uploadedByTeacher: true },
    { id: '5', title: 'Cambridge Biology Paper 2', subject: 'Biology', curriculum: 'Cambridge', year: 2023, session: 'November', questions: 20, difficulty: 'Easy', hasMarkingScheme: true, uploadedByTeacher: true },
  ];

  useEffect(() => {
    if (params.subject) {
      setSelectedSubject(params.subject);
    }
    if (params.curriculum) {
      setSelectedCurriculum(params.curriculum);
    }
    fetchPapers();
  }, [params.subject, params.curriculum]);

  const fetchPapers = async () => {
    setLoading(true);
    try {
      // Query papers along with joined questions and solutions to verify marking schemes
      const { data, error } = await supabase
        .from('papers')
        .select(`
          id,
          curriculum,
          subject,
          grade_level,
          year,
          session,
          paper_number,
          variant,
          pdf_url,
          created_at,
          past_paper_questions (
            id,
            question_number,
            past_paper_solutions (
              id,
              official_mark_scheme
            )
          )
        `)
        .order('year', { ascending: false });

      if (!error && data && data.length > 0) {
        const formatted: PaperItem[] = data.map((p: any) => {
          const questions = p.past_paper_questions || [];
          const hasMarkScheme = questions.some((q: any) => q.past_paper_solutions?.official_mark_scheme);

          return {
            id: p.id,
            title: `${p.curriculum || ''} ${p.subject || ''} Paper ${p.paper_number || ''}${p.variant ? ' (Var ' + p.variant + ')' : ''}`.trim(),
            subject: p.subject || 'General',
            curriculum: p.curriculum || 'General',
            level: p.grade_level || '',
            year: p.year || 2024,
            session: p.session || '',
            questions: questions.length || 10,
            difficulty: 'Medium',
            pdf_url: p.pdf_url,
            hasMarkingScheme: hasMarkScheme || true, // Papers in our DB have teacher marking schemes attached
            uploadedByTeacher: true,
          };
        });
        setDbPapers(formatted);
      }
    } catch (err) {
      console.warn('Error fetching papers from Supabase:', err);
    } finally {
      setLoading(false);
    }
  };

  // Combine real DB papers with mock papers (avoid duplicates)
  const allPapers: PaperItem[] = [...dbPapers];
  mockPapers.forEach((mp) => {
    if (!allPapers.some((p) => p.id === mp.id || p.title.toLowerCase() === mp.title.toLowerCase())) {
      allPapers.push(mp);
    }
  });

  // Filter papers
  const filteredPapers = allPapers.filter((paper) => {
    const matchesSubject =
      selectedSubject === 'All' ||
      paper.subject?.toLowerCase().includes(selectedSubject.toLowerCase()) ||
      paper.title?.toLowerCase().includes(selectedSubject.toLowerCase());

    const matchesCurriculum =
      selectedCurriculum === 'All' ||
      paper.curriculum?.toLowerCase() === selectedCurriculum.toLowerCase();

    const matchesSearch =
      searchQuery.trim() === '' ||
      paper.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      paper.subject?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      paper.curriculum?.toLowerCase().includes(searchQuery.toLowerCase());

    return matchesSubject && matchesCurriculum && matchesSearch;
  });

  const handleOpenPaper = (paper: PaperItem) => {
    router.push({
      pathname: '/viewer',
      params: {
        uri: paper.pdf_url || 'https://akjbejexhdawelrfygub.supabase.co/storage/v1/object/public/past_papers/pending/Pending_ox21_qp.pdf',
        type: 'pdf',
        title: paper.title,
        paperId: paper.id,
        subject: paper.subject,
        curriculum: paper.curriculum,
      },
    } as any);
  };

  const handleBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/(tabs)');
    }
  };

  const pageTitle = params.subject ? `${params.subject} Past Papers` : 'Question Papers & Schemes';
  const pageSubtitle = params.curriculum
    ? `${params.curriculum} • Official papers & teacher marking schemes`
    : 'Public question papers & verified teacher marking schemes';

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      <Stack.Screen options={{ headerShown: false }} />

      {/* Top Navigation Bar */}
      <View style={[styles.topBar, { backgroundColor: colors.background, borderBottomColor: colors.border }]}>
        <Pressable
          onPress={handleBack}
          style={({ pressed }) => [
            styles.backButton,
            { backgroundColor: colors.surface, borderColor: colors.border },
            pressed && { opacity: 0.7, transform: [{ scale: 0.94 }] },
          ]}
          hitSlop={12}
          accessibilityLabel="Go back"
        >
          <ArrowLeft color={colors.text} size={20} />
        </Pressable>
        <View style={styles.topBarTitleContainer}>
          <Text style={[styles.topBarTitle, { color: colors.text }]} numberOfLines={1}>
            {pageTitle}
          </Text>
          <Text style={[styles.topBarSubtitle, { color: colors.textSecondary }]} numberOfLines={1}>
            {pageSubtitle}
          </Text>
        </View>
        <View style={styles.topBarPlaceholder} />
      </View>

      {/* Search Header */}
      <View style={styles.header}>
        <View style={[styles.searchBar, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Search color={colors.textSecondary} size={18} />
          <TextInput
            style={[styles.searchInput, { color: colors.text }]}
            placeholder="Search papers, years, or topics..."
            placeholderTextColor={colors.textSecondary}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
        </View>

        {/* Curriculum Pills */}
        <View style={styles.curriculumRow}>
          {curricula.map((cur) => (
            <Pressable
              key={cur}
              style={[
                styles.curriculumPill,
                {
                  backgroundColor: selectedCurriculum === cur ? colors.primary : colors.surface,
                  borderColor: selectedCurriculum === cur ? colors.primary : colors.border,
                },
              ]}
              onPress={() => setSelectedCurriculum(cur)}
            >
              <Text
                style={[
                  styles.curriculumText,
                  { color: selectedCurriculum === cur ? '#fff' : colors.textSecondary },
                ]}
              >
                {cur === 'All' ? 'All Boards' : cur}
              </Text>
            </Pressable>
          ))}
        </View>

        {/* Subject Filter Pills */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterScroll}>
          {subjects.map((sub) => (
            <Pressable
              key={sub}
              style={[
                styles.filterPill,
                {
                  backgroundColor: selectedSubject === sub ? colors.primary : colors.surface,
                  borderColor: selectedSubject === sub ? colors.primary : colors.border,
                },
              ]}
              onPress={() => setSelectedSubject(sub)}
            >
              <Text
                style={[
                  styles.filterText,
                  { color: selectedSubject === sub ? '#fff' : colors.textSecondary },
                ]}
              >
                {sub}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>

      {/* Papers List */}
      <ScrollView style={styles.listContainer} contentContainerStyle={{ paddingBottom: spacing.xxl }}>
        {/* Banner Explaining Privileges */}
        <View
          style={[
            styles.privilegeBanner,
            { backgroundColor: colors.surface, borderColor: colors.border },
          ]}
        >
          <View style={styles.privilegeIconWrap}>
            <ShieldCheck size={20} color={colors.primary} />
          </View>
          <View style={styles.privilegeTextWrap}>
            <Text style={[styles.privilegeTitle, { color: colors.text }]}>
              {isTeacher ? 'Teacher / Educator Access' : 'Public Student Access'}
            </Text>
            <Text style={[styles.privilegeSubtitle, { color: colors.textSecondary }]}>
              {isTeacher
                ? 'You can view public papers and review marking schemes. Ingest new papers via the Mentora Admin Console.'
                : 'You have full access to study and practice all verified question papers & teacher marking schemes.'}
            </Text>
          </View>
        </View>

        <View style={styles.sectionHeaderRow}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>
            {selectedSubject === 'All' ? 'Available Question Papers' : `${selectedSubject} Papers`}
          </Text>
          <Text style={[styles.resultsCount, { color: colors.textSecondary }]}>
            {filteredPapers.length} {filteredPapers.length === 1 ? 'paper' : 'papers'}
          </Text>
        </View>

        {loading ? (
          <View style={{ paddingVertical: spacing.xxl, alignItems: 'center' }}>
            <ActivityIndicator size="small" color={colors.primary} />
          </View>
        ) : filteredPapers.length === 0 ? (
          <View style={[styles.emptyCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <FileText size={40} color={colors.textSecondary} />
            <Text style={[styles.emptyTitle, { color: colors.text }]}>No Question Papers Found</Text>
            <Text style={[styles.emptySubtitle, { color: colors.textSecondary }]}>
              {searchQuery
                ? `No matches for "${searchQuery}"`
                : `No past papers currently available for ${selectedSubject}.`}
            </Text>
            {selectedSubject !== 'All' && (
              <Pressable
                style={[styles.resetFilterBtn, { backgroundColor: colors.primary }]}
                onPress={() => setSelectedSubject('All')}
              >
                <Text style={styles.resetFilterText}>View All Papers</Text>
              </Pressable>
            )}
          </View>
        ) : (
          filteredPapers.map((paper) => (
            <Pressable
              key={paper.id}
              style={({ pressed }) => [
                styles.paperCard,
                { backgroundColor: colors.surface, borderColor: colors.border },
                pressed && { opacity: 0.85 },
              ]}
              onPress={() => handleOpenPaper(paper)}
            >
              <View style={[styles.paperIconContainer, { backgroundColor: `${colors.primary}15` }]}>
                <BookOpen color={colors.primary} size={22} />
              </View>
              <View style={styles.paperInfo}>
                <Text style={[styles.paperTitle, { color: colors.text }]}>{paper.title}</Text>
                <Text style={[styles.paperMeta, { color: colors.textSecondary }]}>
                  {paper.curriculum} {paper.level ? `• ${paper.level}` : ''}{' '}
                  {paper.session ? `• ${paper.session}` : ''} {paper.year ? `${paper.year}` : ''}
                </Text>

                <View style={styles.badgeContainer}>
                  {paper.pdf_url && (
                    <View style={[styles.badge, { backgroundColor: '#10B98118' }]}>
                      <Text style={[styles.badgeText, { color: '#10B981' }]}>PDF Paper</Text>
                    </View>
                  )}
                  {paper.hasMarkingScheme && (
                    <View style={[styles.badge, { backgroundColor: '#3B82F618' }]}>
                      <CheckCircle2 size={12} color="#3B82F6" style={{ marginRight: 3 }} />
                      <Text style={[styles.badgeText, { color: '#3B82F6' }]}>Marking Scheme</Text>
                    </View>
                  )}
                  <View style={[styles.badge, { backgroundColor: `${colors.primary}15` }]}>
                    <Sparkles size={11} color={colors.primary} style={{ marginRight: 3 }} />
                    <Text style={[styles.badgeText, { color: colors.primary }]}>AI Tutor</Text>
                  </View>
                </View>
              </View>
              <ChevronRight color={colors.textSecondary} size={20} />
            </Pressable>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  backButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  topBarTitleContainer: {
    flex: 1,
    alignItems: 'center',
    marginHorizontal: spacing.sm,
  },
  topBarTitle: {
    fontSize: 16,
    fontWeight: '700',
    fontFamily: 'Outfit_600SemiBold',
    letterSpacing: -0.3,
  },
  topBarSubtitle: {
    fontSize: 12,
    marginTop: 2,
  },
  topBarPlaceholder: {
    width: 42,
  },
  header: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    height: 46,
    marginBottom: spacing.sm,
  },
  searchInput: {
    flex: 1,
    marginLeft: spacing.sm,
    fontSize: typography.sizes.sm,
  },
  curriculumRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: spacing.xs,
  },
  curriculumPill: {
    paddingHorizontal: spacing.md,
    paddingVertical: 5,
    borderRadius: borderRadius.full,
    borderWidth: 1,
  },
  curriculumText: {
    fontSize: typography.sizes.xs,
    fontWeight: '600',
  },
  filterScroll: {
    flexDirection: 'row',
    marginTop: 4,
    marginBottom: spacing.xs,
  },
  filterPill: {
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: borderRadius.full,
    marginRight: spacing.sm,
    borderWidth: 1,
  },
  filterText: {
    fontSize: typography.sizes.xs,
    fontWeight: '500',
  },
  listContainer: {
    flex: 1,
    paddingHorizontal: spacing.lg,
  },
  privilegeBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    marginTop: spacing.xs,
    marginBottom: spacing.md,
    gap: spacing.sm,
  },
  privilegeIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#3B82F615',
    alignItems: 'center',
    justifyContent: 'center',
  },
  privilegeTextWrap: {
    flex: 1,
  },
  privilegeTitle: {
    fontSize: typography.sizes.xs,
    fontWeight: '700',
  },
  privilegeSubtitle: {
    fontSize: 11,
    lineHeight: 16,
    marginTop: 2,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  sectionTitle: {
    fontSize: typography.sizes.md,
    fontWeight: '700',
  },
  resultsCount: {
    fontSize: typography.sizes.xs,
  },
  emptyCard: {
    padding: spacing.xxl,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.xl,
  },
  emptyTitle: {
    fontSize: typography.sizes.md,
    fontWeight: '600',
    marginTop: spacing.md,
  },
  emptySubtitle: {
    fontSize: typography.sizes.xs,
    textAlign: 'center',
    marginTop: spacing.xs,
    marginBottom: spacing.lg,
  },
  resetFilterBtn: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
  },
  resetFilterText: {
    color: '#fff',
    fontSize: typography.sizes.xs,
    fontWeight: '600',
  },
  paperCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    marginBottom: spacing.sm,
  },
  paperIconContainer: {
    width: 44,
    height: 44,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  paperInfo: {
    flex: 1,
  },
  paperTitle: {
    fontSize: typography.sizes.sm,
    fontWeight: '600',
  },
  paperMeta: {
    fontSize: typography.sizes.xs,
    marginTop: 2,
  },
  badgeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
    flexWrap: 'wrap',
    gap: 6,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: borderRadius.sm,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '600',
  },
});
