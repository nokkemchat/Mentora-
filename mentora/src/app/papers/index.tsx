import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TextInput, Pressable, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useRouter, useLocalSearchParams } from 'expo-router';
import { Search, Filter, ChevronRight, BookOpen, ArrowLeft, FileText, Sparkles } from 'lucide-react-native';
import { useThemeColors, typography, spacing, borderRadius } from '@/constants/theme';
import { supabase } from '@/lib/supabase';

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
}

export default function PastPapersScreen() {
  const router = useRouter();
  const colors = useThemeColors();
  const params = useLocalSearchParams<{ subject?: string; curriculum?: string; level?: string }>();

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSubject, setSelectedSubject] = useState<string>(params.subject || 'All');
  const [dbPapers, setDbPapers] = useState<PaperItem[]>([]);
  const [loading, setLoading] = useState(true);

  // Subject filter options
  const defaultSubjects = ['All', 'Mathematics', 'Physics', 'Chemistry', 'Biology', 'Computer Science', 'Geography', 'Economics'];
  const subjects = params.subject && !defaultSubjects.includes(params.subject)
    ? ['All', params.subject, ...defaultSubjects.filter(s => s !== 'All')]
    : defaultSubjects;

  const mockPapers: PaperItem[] = [
    { id: '1', title: 'ZIMSEC Physics Paper 1', subject: 'Physics', curriculum: 'ZIMSEC', year: 2023, session: 'November', questions: 40, difficulty: 'Hard' },
    { id: '2', title: 'Cambridge Mathematics P3', subject: 'Mathematics', curriculum: 'Cambridge', year: 2022, session: 'June', questions: 12, difficulty: 'Medium' },
    { id: '3', title: 'ZIMSEC Chemistry Paper 2', subject: 'Chemistry', curriculum: 'ZIMSEC', year: 2023, session: 'June', questions: 8, difficulty: 'Hard' },
    { id: '4', title: 'Cambridge Chemistry Paper 4', subject: 'Chemistry', curriculum: 'Cambridge', year: 2024, session: 'May/June', questions: 14, difficulty: 'Medium' },
    { id: '5', title: 'Cambridge Biology Paper 2', subject: 'Biology', curriculum: 'Cambridge', year: 2023, session: 'November', questions: 20, difficulty: 'Easy' },
  ];

  useEffect(() => {
    if (params.subject) {
      setSelectedSubject(params.subject);
    }
    fetchPapers();
  }, [params.subject, params.curriculum]);

  const fetchPapers = async () => {
    setLoading(true);
    try {
      let query = supabase.from('papers').select('*');
      
      const { data, error } = await query;
      if (!error && data && data.length > 0) {
        const formatted: PaperItem[] = data.map((p: any) => ({
          id: p.id,
          title: p.title || `${p.curriculum || ''} ${p.subject || ''} Paper ${p.paper_number || ''} ${p.variant ? 'v' + p.variant : ''}`.trim(),
          subject: p.subject || 'General',
          curriculum: p.curriculum || 'General',
          level: p.grade_level || p.level || '',
          year: p.year || 2024,
          session: p.session || '',
          questions: p.questions_count || 10,
          difficulty: p.difficulty || 'Medium',
          pdf_url: p.pdf_url
        }));
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
  mockPapers.forEach(mp => {
    if (!allPapers.some(p => p.id === mp.id || p.title.toLowerCase() === mp.title.toLowerCase())) {
      allPapers.push(mp);
    }
  });

  // Filter papers
  const filteredPapers = allPapers.filter(paper => {
    const matchesSubject = selectedSubject === 'All' || 
      paper.subject?.toLowerCase().includes(selectedSubject.toLowerCase()) ||
      paper.title?.toLowerCase().includes(selectedSubject.toLowerCase());
    
    const matchesSearch = searchQuery.trim() === '' ||
      paper.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      paper.subject?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      paper.curriculum?.toLowerCase().includes(searchQuery.toLowerCase());

    return matchesSubject && matchesSearch;
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
        curriculum: paper.curriculum
      }
    } as any);
  };

  const handleBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/(tabs)');
    }
  };

  const pageTitle = params.subject ? `${params.subject} Past Papers` : 'Question Papers';
  const pageSubtitle = params.curriculum
    ? `${params.curriculum} • Past papers with AI tutor`
    : 'Practice past questions with AI tutor guidance';

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      <Stack.Screen options={{ headerShown: false }} />

      {/* Sleek Top Navigation Bar */}
      <View style={[styles.topBar, { backgroundColor: colors.background, borderBottomColor: colors.border }]}>
        <Pressable 
          onPress={handleBack} 
          style={({ pressed }) => [styles.backButton, { backgroundColor: colors.surface, borderColor: colors.border }, pressed && { opacity: 0.7, transform: [{ scale: 0.94 }] }]}
          hitSlop={12}
          accessibilityLabel="Go back"
        >
          <ArrowLeft color={colors.text} size={20} />
        </Pressable>
        <View style={styles.topBarTitleContainer}>
          <Text style={[styles.topBarTitle, { color: colors.text }]} numberOfLines={1}>{pageTitle}</Text>
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

        {/* Filter Pills */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterScroll}>
          {subjects.map((sub) => (
            <Pressable
              key={sub}
              style={[
                styles.filterPill,
                { 
                  backgroundColor: selectedSubject === sub ? colors.primary : colors.surface,
                  borderColor: selectedSubject === sub ? colors.primary : colors.border
                }
              ]}
              onPress={() => setSelectedSubject(sub)}
            >
              <Text style={[
                styles.filterText,
                { color: selectedSubject === sub ? '#fff' : colors.textSecondary }
              ]}>
                {sub}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>

      {/* Papers List */}
      <ScrollView style={styles.listContainer} contentContainerStyle={{ paddingBottom: spacing.xxl }}>
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
              {searchQuery ? `No matches for "${searchQuery}"` : `No past papers currently available for ${selectedSubject}.`}
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
                pressed && { opacity: 0.85 }
              ]}
              onPress={() => handleOpenPaper(paper)}
            >
              <View style={[styles.paperIconContainer, { backgroundColor: `${colors.primary}15` }]}>
                <BookOpen color={colors.primary} size={22} />
              </View>
              <View style={styles.paperInfo}>
                <Text style={[styles.paperTitle, { color: colors.text }]}>{paper.title}</Text>
                <Text style={[styles.paperMeta, { color: colors.textSecondary }]}>
                  {paper.curriculum} {paper.level ? `• ${paper.level}` : ''} {paper.session ? `• ${paper.session}` : ''} {paper.year ? `${paper.year}` : ''}
                </Text>
                <View style={styles.badgeContainer}>
                  {paper.pdf_url ? (
                    <View style={[styles.badge, { backgroundColor: '#10B98118' }]}>
                      <Text style={[styles.badgeText, { color: '#10B981' }]}>PDF Available</Text>
                    </View>
                  ) : (
                    <View style={[styles.badge, { backgroundColor: `${colors.primary}15` }]}>
                      <Text style={[styles.badgeText, { color: colors.primary }]}>AI Interactive</Text>
                    </View>
                  )}
                  {paper.difficulty && (
                    <View style={[styles.badge, { backgroundColor: `${colors.textSecondary}15`, marginLeft: 6 }]}>
                      <Text style={[styles.badgeText, { color: colors.textSecondary }]}>{paper.difficulty}</Text>
                    </View>
                  )}
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
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#102A6B',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 2,
  },
  topBarTitleContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.sm,
  },
  topBarTitle: {
    fontSize: 16,
    fontWeight: '700',
    fontFamily: 'Outfit_600SemiBold',
    textAlign: 'center',
    letterSpacing: -0.3,
  },
  topBarSubtitle: {
    fontSize: 11,
    fontWeight: '600',
    fontFamily: 'Outfit_500Medium',
    marginTop: 2,
    textAlign: 'center',
    letterSpacing: 0.2,
  },
  topBarPlaceholder: {
    width: 42,
    height: 42,
  },
  header: {
    padding: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    height: 44,
    borderRadius: borderRadius.full,
    borderWidth: 1,
    marginBottom: spacing.sm,
  },
  searchInput: {
    flex: 1,
    marginLeft: spacing.sm,
    fontSize: typography.sizes.sm,
  },
  filterScroll: {
    flexDirection: 'row',
    paddingVertical: 4,
  },
  filterPill: {
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: borderRadius.full,
    borderWidth: 1,
    marginRight: spacing.sm,
  },
  filterText: {
    fontSize: typography.sizes.xs,
    fontWeight: typography.weights.medium,
  },
  listContainer: {
    flex: 1,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  sectionTitle: {
    fontSize: typography.sizes.md,
    fontWeight: typography.weights.bold,
  },
  resultsCount: {
    fontSize: typography.sizes.xs,
  },
  paperCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    marginBottom: spacing.md,
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
    fontWeight: typography.weights.semibold,
    marginBottom: 3,
  },
  paperMeta: {
    fontSize: typography.sizes.xs,
    marginBottom: 6,
  },
  badgeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  badge: {
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: borderRadius.sm,
  },
  badgeText: {
    fontSize: 9,
    fontWeight: typography.weights.bold,
    textTransform: 'uppercase',
  },
  emptyCard: {
    padding: spacing.xl,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: spacing.lg,
    gap: spacing.sm,
  },
  emptyTitle: {
    fontSize: typography.sizes.md,
    fontWeight: typography.weights.bold,
    marginTop: spacing.xs,
  },
  emptySubtitle: {
    fontSize: typography.sizes.xs,
    textAlign: 'center',
    maxWidth: 260,
  },
  resetFilterBtn: {
    marginTop: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.full,
  },
  resetFilterText: {
    color: '#FFF',
    fontSize: typography.sizes.xs,
    fontWeight: typography.weights.semibold,
  },
});
