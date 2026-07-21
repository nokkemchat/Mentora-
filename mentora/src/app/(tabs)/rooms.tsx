import React, { useMemo, useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { spacing, typography, borderRadius, useThemeColors } from '@/constants/theme';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { GlobalWatermark } from '@/components/GlobalWatermark';

export default function RoomsScreen() {
  const colors = useThemeColors();
  const isLightMode = colors.background === '#F8FAFC';
  const styles = useMemo(() => createStyles(colors), [colors]);
  const router = useRouter();

  const [publicRooms, setPublicRooms] = useState<any[]>([]);
  const [schoolRooms, setSchoolRooms] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchRooms = async () => {
      setLoading(true);
      const { data, error } = await supabase.from('study_rooms').select('*');
      
      if (!error && data) {
        setPublicRooms(data.filter(r => r.type === 'Public'));
        setSchoolRooms(data.filter(r => r.type === 'School'));
      }
      setLoading(false);
    };

    fetchRooms();
  }, []);

  const renderRoomCard = (room: any) => (
    <Pressable 
      key={room.id} 
      style={styles.roomCard}
      onPress={() => router.push(`/room/${room.id}`)}
    >
      <BlurView 
        intensity={75} 
        tint={isLightMode ? "light" : "dark"}
        style={StyleSheet.absoluteFillObject} 
      />
      <View style={styles.roomHeader}>
        <View style={styles.roomTitleContainer}>
          <Text style={styles.roomTitle}>{room.title}</Text>
          <Text style={styles.roomSubject}>{room.subject}</Text>
        </View>
        <View style={[styles.badge, room.is_focus_mode ? styles.badgeFocus : styles.badgeNormal]}>
          <Feather 
            name={room.is_focus_mode ? "mic-off" : "message-circle"} 
            size={12} 
            color={room.is_focus_mode ? colors.error : colors.primary} 
          />
          <Text style={[styles.badgeText, { color: room.is_focus_mode ? colors.error : colors.primary }]}>
            {room.is_focus_mode ? 'Focus Mode' : 'Chat Open'}
          </Text>
        </View>
      </View>

      <View style={styles.roomFooter}>
        <View style={styles.participantsContainer}>
          <Feather name="users" size={16} color={colors.textSecondary} />
          <Text style={styles.participantsText}>
            {room.participant_count} / {room.max_participants} joining
          </Text>
        </View>
        <Pressable style={styles.joinButton} onPress={() => router.push(`/room/${room.id}`)}>
          <Text style={styles.joinButtonText}>Join Room</Text>
        </Pressable>
      </View>
    </Pressable>
  );

  if (loading) {
    return (
      <SafeAreaView style={[styles.safeArea, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <GlobalWatermark />
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <View>
            <Text style={styles.headerTitle}>Study Rooms</Text>
            <Text style={styles.headerSubtitle}>Join peers and study together</Text>
          </View>
          <Pressable style={styles.createButton}>
            <Feather name="plus" size={24} color={colors.background} />
          </Pressable>
        </View>

        {/* School Rooms Section */}
        {schoolRooms.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <MaterialCommunityIcons name="school" size={24} color={colors.primary} />
              <Text style={styles.sectionTitle}>Your School Rooms</Text>
            </View>
            {schoolRooms.map(renderRoomCard)}
          </View>
        )}

        {/* Public Rooms Section */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Feather name="globe" size={24} color={colors.primary} />
            <Text style={styles.sectionTitle}>Public Rooms</Text>
          </View>
          {publicRooms.map(renderRoomCard)}
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
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xxxl,
  },
  headerTitle: {
    fontSize: typography.sizes.xxl,
    fontWeight: typography.weights.bold,
    color: colors.text,
  },
  headerSubtitle: {
    fontSize: typography.sizes.md,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  createButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  section: {
    marginBottom: spacing.xxl,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.lg,
    gap: spacing.sm,
  },
  sectionTitle: {
    fontSize: typography.sizes.lg,
    fontWeight: typography.weights.bold,
    color: colors.text,
  },
  roomCard: {
    backgroundColor: 'transparent',
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.md,
    overflow: 'hidden',
  },
  roomHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: spacing.lg,
  },
  roomTitleContainer: {
    flex: 1,
    marginRight: spacing.md,
  },
  roomTitle: {
    fontSize: typography.sizes.md,
    fontWeight: typography.weights.bold,
    color: colors.text,
    marginBottom: 4,
  },
  roomSubject: {
    fontSize: typography.sizes.sm,
    color: colors.textSecondary,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: borderRadius.full,
    gap: 4,
  },
  badgeNormal: {
    backgroundColor: colors.primaryLight,
  },
  badgeFocus: {
    backgroundColor: '#FFEBEE',
  },
  badgeText: {
    fontSize: typography.sizes.xs,
    fontWeight: typography.weights.bold,
  },
  roomFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.md,
  },
  participantsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  participantsText: {
    fontSize: typography.sizes.sm,
    color: colors.textSecondary,
    fontWeight: typography.weights.medium,
  },
  joinButton: {
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
  },
  joinButtonText: {
    color: colors.background,
    fontSize: typography.sizes.sm,
    fontWeight: typography.weights.bold,
  },
});
