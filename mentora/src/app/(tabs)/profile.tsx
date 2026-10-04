import React, { useMemo, useEffect, useState } from 'react';
import { View, Text, StyleSheet, Pressable, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
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
  const { themePreference, setThemePreference, isDark } = useAppTheme();
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);

  const { user } = useAuth();
  const router = useRouter();
  
  const [profile, setProfile] = useState<ProfileType | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }

    const failsafe = setTimeout(() => setLoading(false), 1500);

    async function fetchProfile() {
      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('first_name, last_name, school, grade, role')
          .eq('id', user?.id)
          .single();
          
        if (data && !error) {
          setProfile(data);
        }
      } catch (err) {
        console.warn('Profile fetch error:', err);
      } finally {
        clearTimeout(failsafe);
        setLoading(false);
      }
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

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Profile Header Card */}
      <View style={styles.header}>
        <View style={styles.avatarPlaceholder}>
          <Text style={styles.avatarText}>
            {profile?.first_name ? profile.first_name[0].toUpperCase() : <Feather name="user" size={32} color={colors.primary} />}
          </Text>
        </View>
        <Text style={styles.nameText}>{displayName}</Text>
        <Text style={styles.schoolText}>{schoolText}</Text>
        <View style={styles.roleBadge}>
          <Text style={styles.roleText}>{roleText}</Text>
        </View>
        
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

      {/* Theme Settings Card */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Feather name="moon" size={18} color={colors.text} />
          <Text style={styles.sectionTitleText}>App Theme</Text>
        </View>
        <View style={styles.themeToggleContainer}>
          {(['system', 'light', 'dark'] as const).map((pref) => {
            const isSelected = themePreference === pref;
            return (
              <Pressable
                key={pref}
                style={[
                  styles.themeOption,
                  isSelected && styles.themeOptionActive
                ]}
                onPress={() => setThemePreference(pref)}
              >
                <Text style={[
                  styles.themeOptionText,
                  isSelected && styles.themeOptionTextActive
                ]}>
                  {pref.charAt(0).toUpperCase() + pref.slice(1)}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {/* Account Settings Menu */}
      <View style={styles.section}>
        <Pressable 
          style={styles.menuItem}
          onPress={() => router.push('/settings/account')}
        >
          <Feather name="settings" size={18} color={colors.text} />
          <Text style={styles.menuItemText}>Account Settings</Text>
          <Feather name="chevron-right" size={18} color={colors.textSecondary} />
        </Pressable>
        <Pressable 
          style={styles.menuItem}
          onPress={() => router.push('/settings/notifications')}
        >
          <Feather name="bell" size={18} color={colors.text} />
          <Text style={styles.menuItemText}>Notifications</Text>
          <Feather name="chevron-right" size={18} color={colors.textSecondary} />
        </Pressable>
        <Pressable 
          style={[styles.menuItem, { borderBottomWidth: 0 }]}
          onPress={() => router.push('/settings/support')}
        >
          <Feather name="help-circle" size={18} color={colors.text} />
          <Text style={styles.menuItemText}>Help & Support</Text>
          <Feather name="chevron-right" size={18} color={colors.textSecondary} />
        </Pressable>
      </View>

      {/* Sign Out Action */}
      <Pressable style={styles.signOutButton} onPress={handleSignOut}>
        <Feather name="log-out" size={18} color="#EF4444" />
        <Text style={styles.signOutText}>Sign Out</Text>
      </Pressable>
    </SafeAreaView>
  );
}

const createStyles = (colors: any, isDark: boolean) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    padding: spacing.xl,
    paddingTop: spacing.xxxl,
  },
  header: {
    alignItems: 'center',
    marginBottom: spacing.xl,
    backgroundColor: colors.card,
    padding: spacing.xl,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  avatarPlaceholder: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: isDark ? colors.surfaceHighlight : colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  avatarText: {
    fontSize: 28,
    fontFamily: 'Outfit_700Bold',
    fontWeight: '700',
    color: colors.primary,
  },
  nameText: {
    fontSize: 18,
    fontFamily: 'Outfit_700Bold',
    fontWeight: '700',
    color: colors.text,
  },
  schoolText: {
    fontSize: 13,
    fontFamily: 'Outfit_400Regular',
    color: colors.textSecondary,
    marginTop: 3,
  },
  roleBadge: {
    marginTop: spacing.sm,
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 12,
    backgroundColor: isDark ? 'rgba(59, 130, 246, 0.12)' : '#EFF6FF',
  },
  roleText: {
    fontSize: 12,
    fontFamily: 'Outfit_600SemiBold',
    color: colors.primary,
    fontWeight: '600',
  },
  teacherSwitchButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: isDark ? colors.surfaceHighlight : colors.primaryLight,
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
    backgroundColor: colors.card,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    marginBottom: spacing.xl,
    overflow: 'hidden',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.sm,
  },
  sectionTitleText: {
    marginLeft: spacing.sm,
    fontSize: 14,
    fontFamily: 'Outfit_600SemiBold',
    fontWeight: '600',
    color: colors.text,
  },
  themeToggleContainer: {
    flexDirection: 'row',
    backgroundColor: colors.surfaceHighlight,
    borderRadius: 12,
    margin: spacing.lg,
    marginTop: spacing.xs,
    padding: 3,
  },
  themeOption: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 9,
  },
  themeOptionActive: {
    backgroundColor: colors.card,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: isDark ? 0.3 : 0.08,
    shadowRadius: 3,
    elevation: 2,
  },
  themeOptionText: {
    fontSize: 13,
    fontFamily: 'Outfit_500Medium',
    color: colors.textSecondary,
    fontWeight: '500',
  },
  themeOptionTextActive: {
    color: colors.text,
    fontFamily: 'Outfit_600SemiBold',
    fontWeight: '600',
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: 15,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  menuItemText: {
    flex: 1,
    marginLeft: spacing.md,
    fontSize: 14,
    fontFamily: 'Outfit_500Medium',
    color: colors.text,
  },
  signOutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    paddingHorizontal: spacing.lg,
    backgroundColor: isDark ? 'rgba(239, 68, 68, 0.08)' : '#FEE2E2',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: isDark ? 'rgba(239, 68, 68, 0.2)' : '#FECACA',
    gap: spacing.sm,
  },
  signOutText: {
    color: '#EF4444',
    fontSize: 14,
    fontFamily: 'Outfit_600SemiBold',
    fontWeight: '600',
  },
});
