import React, { useEffect, useState, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, TextInput, Dimensions, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuth } from '@/context/AuthContext';
import { spacing, typography, borderRadius, shadows, useThemeColors } from '@/constants/theme';
import { Feather, Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import ExploreCourses from './ExploreCourses';

export default function StudentDashboard() {
  const colors = useThemeColors();
  const isLight = colors.background === '#F8FAFC' || colors.background === '#FFFFFF';
  const styles = useMemo(() => createStyles(colors, isLight), [colors, isLight]);

  const { user } = useAuth();
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState('');

  const userName = user?.user_metadata?.first_name || user?.user_metadata?.name || 'Scholar';
  const userGrade = user?.user_metadata?.grade || 'O-Level';

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Subtle Soft Ambient Glow seamlessly dissolving into canvas */}
      <LinearGradient
        colors={isLight 
          ? ['#F1F5F9', 'rgba(241, 245, 249, 0.45)', 'transparent'] 
          : ['rgba(30, 41, 59, 0.25)', 'rgba(15, 23, 42, 0.05)', 'transparent']
        }
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={styles.ambientGlow}
        pointerEvents="none"
      />

      {/* Sticky Floating Top Section - App Bar & Search Bar remain visible on scroll */}
      <View style={styles.stickyHeader}>
        {/* Top App Bar - Clean, uncluttered */}
        <View style={styles.topAppBar}>
          <View style={styles.brandRow}>
            <Text style={styles.brandTitle}>Mentora</Text>
            <View style={styles.activePillBadge}>
              <View style={styles.activeDot} />
              <Text style={styles.activeBadgeText}>{userGrade}</Text>
            </View>
          </View>

          <Pressable 
            style={styles.frostedIconButton}
            onPress={() => router.push('/settings/notifications')}
          >
            <Ionicons name="notifications-outline" size={20} color={colors.text} />
            <View style={styles.notificationBadgeDot} />
          </Pressable>
        </View>

        {/* Persistent Pill Search Bar - Remains visible smoothly while scrolling */}
        <View style={styles.searchPillContainer}>
          <Ionicons name="search" size={19} color={colors.textSecondary} style={styles.searchIcon} />
          <TextInput 
            style={styles.searchInput}
            placeholder="Search subjects, topics, or formulas..."
            placeholderTextColor={colors.textTertiary}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {searchQuery.length > 0 && (
            <Pressable onPress={() => setSearchQuery('')} hitSlop={10}>
              <Ionicons name="close-circle" size={18} color={colors.textSecondary} />
            </Pressable>
          )}
        </View>
      </View>

      <ScrollView 
        contentContainerStyle={styles.content} 
        showsVerticalScrollIndicator={false}
      >
        {/* Hero Motivation Banner (Sophisticated Deep Slate & Midnight Card) */}
        <View style={styles.heroCardContainer}>
          <LinearGradient
            colors={isLight 
              ? ['#0F172A', '#1E293B', '#1E3A8A'] 
              : ['#171717', '#212121', '#1E293B']
            }
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.heroGradient}
          >
            <View style={styles.heroRing1} />
            <View style={styles.heroRing2} />

            <View style={styles.heroContent}>
              <View style={styles.heroTagPill}>
                <Ionicons name="sparkles" size={13} color="#FBBF24" />
                <Text style={styles.heroTagText}>AI Exam Intelligence</Text>
              </View>

              <Text style={styles.heroTitle}>Master Your Syllabus{"\n"}Anytime & Anywhere.</Text>
              <Text style={styles.heroSubtitle}>
                Structured topics, past papers & instant AI tutoring.
              </Text>

              <View style={styles.heroCtaRow}>
                <Pressable 
                  style={styles.heroButton}
                  onPress={() => router.push('/papers')}
                >
                  <Text style={styles.heroButtonText}>Explore Past Papers</Text>
                  <Feather name="arrow-right" size={15} color="#0F172A" />
                </Pressable>
              </View>
            </View>
          </LinearGradient>
        </View>

        {/* Explore Courses / Curriculum Subjects */}
        <ExploreCourses searchQuery={searchQuery} />
      </ScrollView>
    </SafeAreaView>
  );
}

const createStyles = (colors: any, isLight: boolean) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  ambientGlow: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 380,
    opacity: 0.85,
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 110,
  },
  stickyHeader: {
    paddingHorizontal: 20,
    paddingTop: 4,
    paddingBottom: 8,
    backgroundColor: colors.background,
    borderBottomWidth: 1,
    borderBottomColor: isLight ? 'rgba(226, 232, 240, 0.6)' : 'rgba(38, 38, 38, 0.6)',
    zIndex: 10,
  },
  topAppBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
    marginTop: 2,
  },
  frostedIconButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: isLight ? '#FFFFFF' : colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: isLight ? '#EDF2F7' : colors.border,
    ...shadows.sm,
    position: 'relative',
  },
  notificationBadgeDot: {
    position: 'absolute',
    top: 9,
    right: 10,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#EF4444',
    borderWidth: 1.5,
    borderColor: isLight ? '#FFFFFF' : colors.surface,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  brandTitle: {
    fontSize: 24,
    fontFamily: 'Outfit_700Bold',
    fontWeight: '700',
    color: colors.text,
    letterSpacing: -0.5,
  },
  activePillBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: isLight ? '#F1F5F9' : colors.surfaceHighlight,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 5,
  },
  activeDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: '#10B981',
  },
  activeBadgeText: {
    fontSize: 11,
    fontFamily: 'Outfit_600SemiBold',
    color: isLight ? '#334155' : '#CBD5E1',
    fontWeight: '600',
  },
  heroCardContainer: {
    borderRadius: 24,
    overflow: 'hidden',
    marginBottom: 20,
    ...shadows.tactile,
  },
  heroGradient: {
    padding: 22,
    borderRadius: 24,
    position: 'relative',
    overflow: 'hidden',
  },
  heroRing1: {
    position: 'absolute',
    top: -50,
    right: -40,
    width: 170,
    height: 170,
    borderRadius: 85,
    borderWidth: 26,
    borderColor: 'rgba(255, 255, 255, 0.06)',
  },
  heroRing2: {
    position: 'absolute',
    bottom: -60,
    right: 30,
    width: 140,
    height: 140,
    borderRadius: 70,
    borderWidth: 20,
    borderColor: 'rgba(255, 255, 255, 0.04)',
  },
  heroContent: {
    position: 'relative',
    zIndex: 2,
  },
  heroTagPill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255, 255, 255, 0.14)',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 9999,
    gap: 6,
    marginBottom: 12,
  },
  heroTagText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontFamily: 'Outfit_600SemiBold',
    fontWeight: '600',
  },
  heroTitle: {
    fontSize: 22,
    fontFamily: 'Outfit_700Bold',
    fontWeight: '700',
    color: '#FFFFFF',
    lineHeight: 28,
    letterSpacing: -0.5,
    marginBottom: 8,
  },
  heroSubtitle: {
    fontSize: 13,
    fontFamily: 'Outfit_400Regular',
    color: 'rgba(255, 255, 255, 0.85)',
    lineHeight: 18,
    marginBottom: 16,
    maxWidth: '92%',
  },
  heroCtaRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  heroButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 9999,
    gap: 8,
    ...shadows.sm,
  },
  heroButtonText: {
    color: '#0F172A',
    fontSize: 13,
    fontFamily: 'Outfit_600SemiBold',
    fontWeight: '600',
  },
  searchPillContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: isLight ? '#FFFFFF' : colors.surface,
    borderRadius: 9999,
    paddingHorizontal: 16,
    paddingVertical: Platform.OS === 'ios' ? 11 : 7,
    borderWidth: 1,
    borderColor: isLight ? '#E2E8F0' : colors.border,
    marginBottom: 4,
    ...shadows.sm,
  },
  searchIcon: {
    marginRight: 10,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    fontFamily: 'Outfit_400Regular',
    color: colors.text,
  },
});
