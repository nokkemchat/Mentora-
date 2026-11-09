import React, { useEffect, useState, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, TextInput, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { useAuth } from '@/context/AuthContext';
import { spacing, typography, borderRadius, shadows, useThemeColors } from '@/constants/theme';
import { Feather, Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import ExploreCourses from './ExploreCourses';

export default function StudentDashboard() {
  const colors = useThemeColors();
  const isLight = colors.background === '#F8FAFC' || colors.background === '#FFFFFF';
  const styles = useMemo(() => createStyles(colors, isLight), [colors, isLight]);
  const insets = useSafeAreaInsets();

  const { user } = useAuth();
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState('');

  // Estimated before first layout, then corrected via onLayout so the
  // scroll content always clears the fixed frosted header.
  const [headerHeight, setHeaderHeight] = useState(insets.top + 112);

  const userName = user?.user_metadata?.first_name || user?.user_metadata?.name || 'Scholar';
  const userGrade = user?.user_metadata?.grade || 'O-Level';

  return (
    <View style={styles.container}>
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

      {/* Soft ambient colour accents so the frosted glass cards have depth */}
      <LinearGradient
        colors={isLight
          ? ['rgba(37, 99, 235, 0.09)', 'rgba(37, 99, 235, 0.02)', 'transparent']
          : ['rgba(59, 130, 246, 0.12)', 'rgba(59, 130, 246, 0.03)', 'transparent']
        }
        start={{ x: 0.2, y: 0 }}
        end={{ x: 0.8, y: 1 }}
        style={styles.ambientAccentA}
        pointerEvents="none"
      />
      <LinearGradient
        colors={isLight
          ? ['rgba(16, 185, 129, 0.07)', 'rgba(16, 185, 129, 0.02)', 'transparent']
          : ['rgba(16, 185, 129, 0.10)', 'rgba(16, 185, 129, 0.03)', 'transparent']
        }
        start={{ x: 0.8, y: 0 }}
        end={{ x: 0.2, y: 1 }}
        style={styles.ambientAccentB}
        pointerEvents="none"
      />

      {/* Scrollable content — passes beneath the fixed frosted header */}
      <ScrollView 
        contentContainerStyle={[styles.content, { paddingTop: headerHeight + 12 }]} 
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

      {/* Fixed Frosted Glass Header — app bar & search stay pinned while content scrolls beneath */}
      <View
        style={[styles.stickyHeader, { paddingTop: insets.top + 4 }]}
        onLayout={(e) => setHeaderHeight(e.nativeEvent.layout.height)}
      >
        <BlurView
          style={styles.headerBlur}
          intensity={Platform.OS === 'ios' ? 85 : 100}
          tint={isLight ? 'light' : 'dark'}
          pointerEvents="none"
        />
        <View style={styles.headerHairline} pointerEvents="none" />

        {/* Top App Bar - Clean, uncluttered */}
        <View style={styles.topAppBar}>
          <View style={styles.brandRow}>
            <Text style={styles.brandTitle}>Ziviso</Text>
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

        {/* Persistent Pill Search Bar - Pinned to the frosted header */}
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
    </View>
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
  ambientAccentA: {
    position: 'absolute',
    top: 460,
    left: -70,
    width: 260,
    height: 260,
    borderRadius: 130,
    opacity: 0.9,
  },
  ambientAccentB: {
    position: 'absolute',
    top: 760,
    right: -60,
    width: 240,
    height: 240,
    borderRadius: 120,
    opacity: 0.9,
  },
  content: {
    paddingHorizontal: 20,
    paddingBottom: 110,
  },
  stickyHeader: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 20,
    paddingBottom: 10,
    overflow: 'hidden',
    zIndex: 10,
  },
  headerBlur: {
    ...StyleSheet.absoluteFillObject,
  },
  headerHairline: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: StyleSheet.hairlineWidth,
    backgroundColor: isLight ? 'rgba(15, 23, 42, 0.08)' : 'rgba(255, 255, 255, 0.10)',
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
    backgroundColor: isLight ? 'rgba(255, 255, 255, 0.65)' : 'rgba(255, 255, 255, 0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: isLight ? 'rgba(15, 23, 42, 0.06)' : 'rgba(255, 255, 255, 0.12)',
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
    backgroundColor: isLight ? 'rgba(15, 23, 42, 0.05)' : 'rgba(255, 255, 255, 0.08)',
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
    backgroundColor: isLight ? 'rgba(255, 255, 255, 0.72)' : 'rgba(255, 255, 255, 0.08)',
    borderRadius: 9999,
    paddingHorizontal: 16,
    paddingVertical: Platform.OS === 'ios' ? 11 : 7,
    borderWidth: 1,
    borderColor: isLight ? 'rgba(15, 23, 42, 0.06)' : 'rgba(255, 255, 255, 0.12)',
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
