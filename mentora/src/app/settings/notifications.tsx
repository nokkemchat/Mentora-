import React, { useState, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, Switch, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { BlurView } from 'expo-blur';
import { Feather } from '@expo/vector-icons';
import { spacing, typography, borderRadius, useThemeColors } from '@/constants/theme';
import { GlobalWatermark } from '@/components/GlobalWatermark';

export default function NotificationsSettingsScreen() {
  const router = useRouter();
  const colors = useThemeColors();
  const isLightMode = colors.background === '#F8FAFC';
  const styles = useMemo(() => createStyles(colors), [colors]);

  // UI State for Toggles
  const [doNotDisturb, setDoNotDisturb] = useState(false);
  
  const [pushLiveRooms, setPushLiveRooms] = useState(true);
  const [pushCourseDrops, setPushCourseDrops] = useState(true);
  const [pushCommunity, setPushCommunity] = useState(false);

  const [studyReminder, setStudyReminder] = useState(true);

  const [emailProgress, setEmailProgress] = useState(true);
  const [emailNews, setEmailNews] = useState(false);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <GlobalWatermark />
      
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <Feather name="arrow-left" size={24} color={colors.text} />
        </Pressable>
        <Text style={styles.headerTitle}>Notifications</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        
        {/* Do Not Disturb */}
        <View style={[styles.section, doNotDisturb && { borderColor: colors.primary, borderWidth: 2 }]}>
          <BlurView intensity={75} tint={isLightMode ? "light" : "dark"} style={StyleSheet.absoluteFillObject} />
          <View style={[styles.settingRow, { paddingVertical: spacing.lg }]}>
            <View style={styles.settingIconContainer}>
              <Feather name="moon" size={24} color={doNotDisturb ? colors.primary : colors.textSecondary} />
            </View>
            <View style={styles.settingTextContainer}>
              <Text style={styles.settingTitle}>Do Not Disturb</Text>
              <Text style={styles.settingDescription}>Mute all non-essential push notifications and emails.</Text>
            </View>
            <Switch
              value={doNotDisturb}
              onValueChange={setDoNotDisturb}
              trackColor={{ false: colors.border, true: colors.primaryLight }}
              thumbColor={doNotDisturb ? colors.primary : colors.textTertiary}
            />
          </View>
        </View>

        {/* Push Notifications */}
        <View style={[styles.section, doNotDisturb && { opacity: 0.5 }]}>
          <BlurView intensity={75} tint={isLightMode ? "light" : "dark"} style={StyleSheet.absoluteFillObject} />
          <View style={styles.sectionHeader}>
            <Feather name="smartphone" size={20} color={colors.primary} />
            <Text style={styles.sectionTitle}>Push Notifications</Text>
          </View>
          
          <View style={styles.settingRow}>
            <View style={styles.settingTextContainer}>
              <Text style={styles.settingTitle}>Live Study Rooms</Text>
              <Text style={styles.settingDescription}>Get notified 5 mins before a session starts.</Text>
            </View>
            <Switch
              disabled={doNotDisturb}
              value={doNotDisturb ? false : pushLiveRooms}
              onValueChange={setPushLiveRooms}
              trackColor={{ false: colors.border, true: colors.primaryLight }}
              thumbColor={pushLiveRooms && !doNotDisturb ? colors.primary : colors.textTertiary}
            />
          </View>

          <View style={styles.settingRow}>
            <View style={styles.settingTextContainer}>
              <Text style={styles.settingTitle}>New Course Drops</Text>
              <Text style={styles.settingDescription}>Alerts for new content in your syllabus.</Text>
            </View>
            <Switch
              disabled={doNotDisturb}
              value={doNotDisturb ? false : pushCourseDrops}
              onValueChange={setPushCourseDrops}
              trackColor={{ false: colors.border, true: colors.primaryLight }}
              thumbColor={pushCourseDrops && !doNotDisturb ? colors.primary : colors.textTertiary}
            />
          </View>

          <View style={[styles.settingRow, styles.lastRow]}>
            <View style={styles.settingTextContainer}>
              <Text style={styles.settingTitle}>Community Replies</Text>
              <Text style={styles.settingDescription}>When someone replies to your post.</Text>
            </View>
            <Switch
              disabled={doNotDisturb}
              value={doNotDisturb ? false : pushCommunity}
              onValueChange={setPushCommunity}
              trackColor={{ false: colors.border, true: colors.primaryLight }}
              thumbColor={pushCommunity && !doNotDisturb ? colors.primary : colors.textTertiary}
            />
          </View>
        </View>

        {/* Custom Study Reminders */}
        <View style={[styles.section, doNotDisturb && { opacity: 0.5 }]}>
          <BlurView intensity={75} tint={isLightMode ? "light" : "dark"} style={StyleSheet.absoluteFillObject} />
          <View style={styles.sectionHeader}>
            <Feather name="clock" size={20} color={colors.primary} />
            <Text style={styles.sectionTitle}>Study Reminders</Text>
          </View>
          
          <View style={styles.settingRow}>
            <View style={styles.settingTextContainer}>
              <Text style={styles.settingTitle}>Daily Nudge</Text>
              <Text style={styles.settingDescription}>A custom reminder to keep your streak alive.</Text>
            </View>
            <Switch
              disabled={doNotDisturb}
              value={doNotDisturb ? false : studyReminder}
              onValueChange={setStudyReminder}
              trackColor={{ false: colors.border, true: colors.primaryLight }}
              thumbColor={studyReminder && !doNotDisturb ? colors.primary : colors.textTertiary}
            />
          </View>

          {studyReminder && !doNotDisturb && (
            <View style={[styles.settingRow, styles.lastRow, { paddingTop: 0 }]}>
              <Pressable 
                style={styles.timePickerButton}
                onPress={() => Alert.alert('Time Picker', 'This would open a native time picker to choose your daily nudge time.')}
              >
                <Text style={styles.timePickerText}>Set Reminder Time (6:00 PM)</Text>
                <Feather name="chevron-right" size={20} color={colors.primary} />
              </Pressable>
            </View>
          )}
        </View>

        {/* Email Alerts */}
        <View style={[styles.section, doNotDisturb && { opacity: 0.5 }]}>
          <BlurView intensity={75} tint={isLightMode ? "light" : "dark"} style={StyleSheet.absoluteFillObject} />
          <View style={styles.sectionHeader}>
            <Feather name="mail" size={20} color={colors.primary} />
            <Text style={styles.sectionTitle}>Email Alerts</Text>
          </View>
          
          <View style={styles.settingRow}>
            <View style={styles.settingTextContainer}>
              <Text style={styles.settingTitle}>Weekly Progress</Text>
              <Text style={styles.settingDescription}>A summary of your quiz scores and study hours.</Text>
            </View>
            <Switch
              disabled={doNotDisturb}
              value={doNotDisturb ? false : emailProgress}
              onValueChange={setEmailProgress}
              trackColor={{ false: colors.border, true: colors.primaryLight }}
              thumbColor={emailProgress && !doNotDisturb ? colors.primary : colors.textTertiary}
            />
          </View>

          <View style={[styles.settingRow, styles.lastRow]}>
            <View style={styles.settingTextContainer}>
              <Text style={styles.settingTitle}>Mentora News & Offers</Text>
              <Text style={styles.settingDescription}>Updates, premium discounts, and features.</Text>
            </View>
            <Switch
              disabled={doNotDisturb}
              value={doNotDisturb ? false : emailNews}
              onValueChange={setEmailNews}
              trackColor={{ false: colors.border, true: colors.primaryLight }}
              thumbColor={emailNews && !doNotDisturb ? colors.primary : colors.textTertiary}
            />
          </View>
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
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  lastRow: {
    borderBottomWidth: 0,
  },
  settingIconContainer: {
    marginRight: spacing.md,
  },
  settingTextContainer: {
    flex: 1,
    marginRight: spacing.md,
  },
  settingTitle: {
    fontSize: typography.sizes.md,
    fontWeight: typography.weights.semibold,
    color: colors.text,
    marginBottom: 4,
  },
  settingDescription: {
    fontSize: typography.sizes.sm,
    color: colors.textSecondary,
    lineHeight: 18,
  },
  timePickerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(59, 130, 246, 0.1)', // Light primary
    padding: spacing.md,
    borderRadius: borderRadius.md,
    flex: 1,
  },
  timePickerText: {
    color: colors.primary,
    fontWeight: typography.weights.semibold,
    fontSize: typography.sizes.sm,
  },
});
