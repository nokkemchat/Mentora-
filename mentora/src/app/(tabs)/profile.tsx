import React, { useMemo, useEffect, useState } from 'react';
import { View, Text, StyleSheet, Pressable, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import { spacing, typography, borderRadius, useThemeColors } from '@/constants/theme';
import { useAppTheme } from '@/context/ThemeContext';
import { Feather } from '@expo/vector-icons';

type ProfileType = {
  first_name: string | null;
  last_name: string | null;
  school: string | null;
  grade: string | null;
  role: string | null;
};

export default function ProfileScreen() {
  const { themePreference, setThemePreference } = useAppTheme();
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const { user } = useAuth();
  const router = useRouter();
  
  const [profile, setProfile] = useState<ProfileType | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchProfile() {
      if (!user) return;
      const { data, error } = await supabase
        .from('profiles')
        .select('first_name, last_name, school, grade, role')
        .eq('id', user.id)
        .single();
        
      if (data && !error) {
        setProfile(data);
      }
      setLoading(false);
    }
    
    fetchProfile();
  }, [user]);

  async function handleSignOut() {
    await supabase.auth.signOut();
  }

  if (loading) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  const displayName = profile?.first_name 
    ? `${profile.first_name} ${profile.last_name || ''}` 
    : user?.email?.split('@')[0] || 'User';

  const roleText = profile?.role === 'teacher' ? 'Teacher Account' : 'Student Account';
  const schoolText = profile?.school ? `${profile.school} • ${profile.grade || ''}` : 'No school listed';

  const isLightMode = colors.background === '#F8FAFC';
  // iOS dark icon theme aesthetic: deep charcoal/black with slight sheen
  const glassGradient = isLightMode 
    ? ['rgba(28, 28, 30, 0.45)', 'rgba(28, 28, 30, 0.25)', 'rgba(28, 28, 30, 0.55)'] 
    : ['rgba(255, 255, 255, 0.45)', 'rgba(255, 255, 255, 0.05)', 'rgba(255, 255, 255, 0.15)'];

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <View style={styles.avatarPlaceholder}>
          <Text style={styles.avatarText}>
            {profile?.first_name ? profile.first_name[0].toUpperCase() : <Feather name="user" size={40} color={colors.primary} />}
          </Text>
        </View>
        <Text style={styles.nameText}>{displayName}</Text>
        <Text style={styles.schoolText}>{schoolText}</Text>
        <Text style={styles.roleText}>{roleText}</Text>
        
        {profile?.role === 'teacher' && (
          <Pressable 
            style={styles.teacherSwitchButton}
            onPress={() => router.push('/teacher/dashboard')}
          >
            <Feather name="briefcase" size={16} color={colors.primary} />
            <Text style={styles.teacherSwitchText}>Teacher Dashboard</Text>
          </Pressable>
        )}
      </View>

      {/* Theme Settings */}
      <View style={styles.section}>
        <BlurView 
          intensity={isLightMode ? 80 : 50} 
          tint={isLightMode ? "light" : "dark"} 
          style={StyleSheet.absoluteFillObject} 
        />
        {/* Glass reflection gradient */}
        <LinearGradient
          colors={glassGradient}
          locations={[0, 0.4, 1]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFillObject}
        />
        {/* Edge highlight */}
        <View style={styles.glassHighlight} />
        <View style={styles.sectionHeader}>
          <Feather name="moon" size={20} color={colors.text} />
          <Text style={styles.sectionTitleText}>App Theme</Text>
        </View>
        <View style={styles.themeToggleContainer}>
          {(['system', 'light', 'dark'] as const).map((pref) => (
            <Pressable
              key={pref}
              style={[
                styles.themeOption,
                themePreference === pref && styles.themeOptionActive
              ]}
              onPress={() => setThemePreference(pref)}
            >
              <Text style={[
                styles.themeOptionText,
                themePreference === pref && styles.themeOptionTextActive
              ]}>
                {pref.charAt(0).toUpperCase() + pref.slice(1)}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      {/* Account Settings */}
      <View style={styles.section}>
        <BlurView 
          intensity={isLightMode ? 80 : 50} 
          tint={isLightMode ? "light" : "dark"} 
          style={StyleSheet.absoluteFillObject} 
        />
        {/* Glass reflection gradient */}
        <LinearGradient
          colors={glassGradient}
          locations={[0, 0.4, 1]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFillObject}
        />
        {/* Edge highlight */}
        <View style={styles.glassHighlight} />
        <Pressable style={styles.menuItem}>
          <Feather name="settings" size={20} color={colors.text} />
          <Text style={styles.menuItemText}>Account Settings</Text>
          <Feather name="chevron-right" size={20} color={colors.textSecondary} />
        </Pressable>
        <Pressable style={styles.menuItem}>
          <Feather name="bell" size={20} color={colors.text} />
          <Text style={styles.menuItemText}>Notifications</Text>
          <Feather name="chevron-right" size={20} color={colors.textSecondary} />
        </Pressable>
        <Pressable style={styles.menuItem}>
          <Feather name="help-circle" size={20} color={colors.text} />
          <Text style={styles.menuItemText}>Help & Support</Text>
          <Feather name="chevron-right" size={20} color={colors.textSecondary} />
        </Pressable>
      </View>

      <Pressable style={styles.signOutButton} onPress={handleSignOut}>
        <BlurView 
          intensity={isLightMode ? 80 : 50} 
          tint={isLightMode ? "light" : "dark"} 
          style={StyleSheet.absoluteFillObject} 
        />
        <Feather name="log-out" size={20} color={colors.error} />
        <Text style={styles.signOutText}>Sign Out</Text>
      </Pressable>
    </SafeAreaView>
  );
}

const createStyles = (colors: any) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    padding: spacing.xl,
    paddingTop: spacing.xxxl,
  },
  header: {
    alignItems: 'center',
    marginBottom: spacing.xxl,
  },
  avatarPlaceholder: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  avatarText: {
    fontSize: 32,
    fontWeight: typography.weights.bold,
    color: colors.primary,
  },
  nameText: {
    fontSize: typography.sizes.xl,
    fontWeight: typography.weights.bold,
    color: colors.text,
  },
  schoolText: {
    fontSize: typography.sizes.md,
    color: colors.textSecondary,
    marginTop: 4,
  },
  roleText: {
    fontSize: typography.sizes.sm,
    color: colors.primary,
    marginTop: spacing.xs,
    fontWeight: typography.weights.semibold,
  },
  teacherSwitchButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primaryLight,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.full,
    marginTop: spacing.lg,
    gap: spacing.sm,
  },
  teacherSwitchText: {
    color: colors.primary,
    fontWeight: typography.weights.bold,
    fontSize: typography.sizes.sm,
  },
  section: {
    backgroundColor: 'transparent',
    borderRadius: 32, // extra smooth corners
    borderWidth: 1.5,
    borderColor: colors.background === '#F8FAFC' ? 'rgba(255, 255, 255, 0.15)' : 'rgba(255, 255, 255, 0.3)',
    borderTopColor: colors.background === '#F8FAFC' ? 'rgba(255, 255, 255, 0.35)' : 'rgba(255, 255, 255, 0.6)', 
    borderLeftColor: colors.background === '#F8FAFC' ? 'rgba(255, 255, 255, 0.25)' : 'rgba(255, 255, 255, 0.5)',
    borderBottomColor: colors.background === '#F8FAFC' ? 'rgba(0, 0, 0, 0.8)' : 'rgba(255, 255, 255, 0.1)',
    borderRightColor: colors.background === '#F8FAFC' ? 'rgba(0, 0, 0, 0.5)' : 'rgba(255, 255, 255, 0.1)',
    overflow: 'hidden',
    marginBottom: spacing.xxl,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: colors.background === '#F8FAFC' ? 0.05 : 0.2,
    shadowRadius: 20,
    elevation: 10,
  },
  glassHighlight: {
    position: 'absolute',
    top: 0,
    left: '5%',
    right: '5%',
    height: '40%',
    backgroundColor: colors.background === '#F8FAFC' ? 'rgba(255, 255, 255, 0.08)' : 'rgba(255, 255, 255, 0.08)',
    borderBottomLeftRadius: 100,
    borderBottomRightRadius: 100,
    transform: [{ scaleX: 1.2 }],
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.lg,
    paddingBottom: spacing.md,
  },
  sectionTitleText: {
    marginLeft: spacing.md,
    fontSize: typography.sizes.md,
    fontWeight: typography.weights.semibold,
    color: colors.text,
  },
  themeToggleContainer: {
    flexDirection: 'row',
    backgroundColor: colors.surfaceHighlight,
    borderRadius: borderRadius.md,
    margin: spacing.lg,
    marginTop: 0,
    padding: 4,
  },
  themeOption: {
    flex: 1,
    paddingVertical: spacing.sm,
    alignItems: 'center',
    borderRadius: borderRadius.sm,
  },
  themeOptionActive: {
    backgroundColor: colors.surface,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  themeOptionText: {
    fontSize: typography.sizes.sm,
    color: colors.textSecondary,
    fontWeight: typography.weights.medium,
  },
  themeOptionTextActive: {
    color: colors.text,
    fontWeight: typography.weights.bold,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  menuItemText: {
    flex: 1,
    marginLeft: spacing.md,
    fontSize: typography.sizes.md,
    color: colors.text,
    fontWeight: typography.weights.medium,
  },
  signOutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.error,
    gap: spacing.sm,
  },
  signOutText: {
    color: colors.error,
    fontSize: typography.sizes.md,
    fontWeight: typography.weights.bold,
  },
});
