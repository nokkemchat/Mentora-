import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TextInput, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, router } from 'expo-router';
import { Search, Filter, ChevronRight, BookOpen } from 'lucide-react-native';
import { useThemeColors, typography, spacing, borderRadius } from '@/constants/theme';

export default function PastPapersScreen() {
  const colors = useThemeColors();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSubject, setSelectedSubject] = useState<string | null>('All');

  const subjects = ['All', 'Physics', 'Mathematics', 'Chemistry', 'Biology', 'Computer Science'];

  // Mock data representing the structured OCR database
  const mockPapers = [
    { id: '1', title: 'ZIMSEC Physics Paper 1', year: 2023, session: 'November', questions: 40, difficulty: 'Hard' },
    { id: '2', title: 'Cambridge Mathematics P3', year: 2022, session: 'June', questions: 12, difficulty: 'Medium' },
    { id: '3', title: 'ZIMSEC Chemistry Paper 2', year: 2023, session: 'June', questions: 8, difficulty: 'Hard' },
  ];

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      <Stack.Screen options={{ 
        title: 'AI Past Papers',
        headerStyle: { backgroundColor: colors.background },
        headerTintColor: colors.text,
        headerShadowVisible: false,
      }} />

      {/* Search Header */}
      <View style={styles.header}>
        <View style={[styles.searchBar, { backgroundColor: colors.surface }]}>
          <Search color={colors.textSecondary} size={20} />
          <TextInput
            style={[styles.searchInput, { color: colors.text }]}
            placeholder="Search papers, topics, or concepts..."
            placeholderTextColor={colors.textSecondary}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          <Pressable style={styles.filterButton}>
            <Filter color={colors.primary} size={20} />
          </Pressable>
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
        <Text style={[styles.sectionTitle, { color: colors.text }]}>Recently Processed by AI</Text>
        
        {mockPapers.map((paper) => (
          <Pressable
            key={paper.id}
            style={[styles.paperCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
            onPress={() => router.push(`/papers/${paper.id}`)}
          >
            <View style={styles.paperIconContainer}>
              <BookOpen color={colors.primary} size={24} />
            </View>
            <View style={styles.paperInfo}>
              <Text style={[styles.paperTitle, { color: colors.text }]}>{paper.title}</Text>
              <Text style={[styles.paperMeta, { color: colors.textSecondary }]}>
                {paper.session} {paper.year} • {paper.questions} AI Questions extracted
              </Text>
              <View style={styles.badgeContainer}>
                <View style={[styles.badge, { backgroundColor: `${colors.primary}15` }]}>
                  <Text style={[styles.badgeText, { color: colors.primary }]}>{paper.difficulty}</Text>
                </View>
              </View>
            </View>
            <ChevronRight color={colors.textSecondary} size={20} />
          </Pressable>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    padding: spacing.lg,
    paddingTop: spacing.md,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    height: 50,
    borderRadius: borderRadius.full,
    marginBottom: spacing.md,
  },
  searchInput: {
    flex: 1,
    marginLeft: spacing.sm,
    fontSize: typography.sizes.md,
  },
  filterButton: {
    padding: spacing.xs,
  },
  filterScroll: {
    flexDirection: 'row',
  },
  filterPill: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.full,
    borderWidth: 1,
    marginRight: spacing.sm,
  },
  filterText: {
    fontSize: typography.sizes.sm,
    fontWeight: typography.weights.medium,
  },
  listContainer: {
    flex: 1,
    paddingHorizontal: spacing.lg,
  },
  sectionTitle: {
    fontSize: typography.sizes.lg,
    fontWeight: typography.weights.bold,
    marginBottom: spacing.md,
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
    width: 48,
    height: 48,
    borderRadius: borderRadius.md,
    backgroundColor: 'rgba(0,0,0,0.05)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  paperInfo: {
    flex: 1,
  },
  paperTitle: {
    fontSize: typography.sizes.md,
    fontWeight: typography.weights.semibold,
    marginBottom: 4,
  },
  paperMeta: {
    fontSize: typography.sizes.xs,
    marginBottom: 8,
  },
  badgeContainer: {
    flexDirection: 'row',
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: borderRadius.sm,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: typography.weights.bold,
    textTransform: 'uppercase',
  },
});
