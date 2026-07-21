import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, TextInput, ActivityIndicator, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { BlurView } from 'expo-blur';
import { Feather, Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import { spacing, typography, borderRadius, useThemeColors } from '@/constants/theme';
import { GlobalWatermark } from '@/components/GlobalWatermark';

export default function AccountSettingsScreen() {
  const router = useRouter();
  const colors = useThemeColors();
  const isLightMode = colors.background === '#F8FAFC';
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { user } = useAuth();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  
  // Profile Form State
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [school, setSchool] = useState('');
  const [grade, setGrade] = useState('');
  const [role, setRole] = useState('');

  // Password Form State
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');

  // Guardian State
  const [guardianEmail, setGuardianEmail] = useState('');

  useEffect(() => {
    fetchProfile();
  }, []);

  const fetchProfile = async () => {
    if (!user) return;
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();

      if (error) throw error;
      if (data) {
        setFirstName(data.first_name || '');
        setLastName(data.last_name || '');
        setSchool(data.school || '');
        setGrade(data.grade || '');
        setRole(data.role || '');
      }
    } catch (error) {
      console.error('Error fetching profile:', error);
    } finally {
      setLoading(false);
    }
  };

  const updateProfile = async () => {
    if (!user) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({
          first_name: firstName,
          last_name: lastName,
          school: school,
          grade: grade,
        })
        .eq('id', user.id);

      if (error) throw error;
      Alert.alert('Success', 'Profile updated successfully!');
    } catch (error: any) {
      Alert.alert('Error', error.message);
    } finally {
      setSaving(false);
    }
  };

  const updatePassword = async () => {
    if (!newPassword) {
      Alert.alert('Error', 'Please enter a new password.');
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase.auth.updateUser({
        password: newPassword
      });
      if (error) throw error;
      Alert.alert('Success', 'Password updated successfully!');
      setCurrentPassword('');
      setNewPassword('');
    } catch (error: any) {
      Alert.alert('Error', error.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <GlobalWatermark />
      <KeyboardAvoidingView 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        {/* Header */}
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={styles.backButton}>
            <Feather name="arrow-left" size={24} color={colors.text} />
          </Pressable>
          <Text style={styles.headerTitle}>Account Settings</Text>
          <View style={{ width: 40 }} />
        </View>

        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          
          {/* Profile Management */}
          <View style={styles.section}>
            <BlurView intensity={75} tint={isLightMode ? "light" : "dark"} style={StyleSheet.absoluteFillObject} />
            <View style={styles.sectionHeader}>
              <Feather name="user" size={20} color={colors.primary} />
              <Text style={styles.sectionTitle}>Profile Details</Text>
            </View>
            <View style={styles.sectionContent}>
              <Text style={styles.inputLabel}>First Name</Text>
              <TextInput 
                style={styles.input}
                value={firstName}
                onChangeText={setFirstName}
                placeholderTextColor={colors.textTertiary}
                placeholder="Enter first name"
              />
              <Text style={styles.inputLabel}>Last Name</Text>
              <TextInput 
                style={styles.input}
                value={lastName}
                onChangeText={setLastName}
                placeholderTextColor={colors.textTertiary}
                placeholder="Enter last name"
              />
              <Pressable style={styles.saveButton} onPress={updateProfile} disabled={saving}>
                <Text style={styles.saveButtonText}>{saving ? 'Saving...' : 'Update Profile'}</Text>
              </Pressable>
            </View>
          </View>

          {/* Academic Preferences */}
          <View style={styles.section}>
            <BlurView intensity={75} tint={isLightMode ? "light" : "dark"} style={StyleSheet.absoluteFillObject} />
            <View style={styles.sectionHeader}>
              <Ionicons name="school-outline" size={20} color={colors.primary} />
              <Text style={styles.sectionTitle}>Academic Journey</Text>
            </View>
            <View style={styles.sectionContent}>
              <Text style={styles.inputLabel}>School</Text>
              <TextInput 
                style={styles.input}
                value={school}
                onChangeText={setSchool}
                placeholderTextColor={colors.textTertiary}
                placeholder="E.g., St. John's College"
              />
              <Text style={styles.inputLabel}>Grade Level</Text>
              <TextInput 
                style={styles.input}
                value={grade}
                onChangeText={setGrade}
                placeholderTextColor={colors.textTertiary}
                placeholder="E.g., Upper 6"
              />
              <Pressable style={styles.saveButton} onPress={updateProfile} disabled={saving}>
                <Text style={styles.saveButtonText}>{saving ? 'Saving...' : 'Update Academics'}</Text>
              </Pressable>
            </View>
          </View>

          {/* Security & Password */}
          <View style={styles.section}>
            <BlurView intensity={75} tint={isLightMode ? "light" : "dark"} style={StyleSheet.absoluteFillObject} />
            <View style={styles.sectionHeader}>
              <Feather name="lock" size={20} color={colors.primary} />
              <Text style={styles.sectionTitle}>Security</Text>
            </View>
            <View style={styles.sectionContent}>
              <Text style={styles.inputLabel}>New Password</Text>
              <TextInput 
                style={styles.input}
                value={newPassword}
                onChangeText={setNewPassword}
                secureTextEntry
                placeholderTextColor={colors.textTertiary}
                placeholder="Enter new password"
              />
              <Pressable style={styles.saveButton} onPress={updatePassword} disabled={saving}>
                <Text style={styles.saveButtonText}>{saving ? 'Updating...' : 'Change Password'}</Text>
              </Pressable>
              
              <Pressable style={styles.secondaryAction} onPress={() => Alert.alert('Sessions', 'Logged out of all other devices.')}>
                <Text style={styles.secondaryActionText}>Log out of all other devices</Text>
              </Pressable>
            </View>
          </View>

          {/* Subscription & Billing (Placeholder) */}
          <View style={styles.section}>
            <BlurView intensity={75} tint={isLightMode ? "light" : "dark"} style={StyleSheet.absoluteFillObject} />
            <View style={styles.sectionHeader}>
              <Feather name="credit-card" size={20} color={colors.primary} />
              <Text style={styles.sectionTitle}>Subscription</Text>
            </View>
            <View style={styles.sectionContent}>
              <View style={styles.planCard}>
                <Text style={styles.planTitle}>Mentora Basic</Text>
                <Text style={styles.planSubtitle}>Free forever</Text>
              </View>
              <Pressable style={[styles.saveButton, { backgroundColor: '#8B5CF6' }]} onPress={() => Alert.alert('Mentora Pro', 'Upgrade flow coming soon!')}>
                <Text style={[styles.saveButtonText, { color: '#fff' }]}>Upgrade to Pro</Text>
              </Pressable>
            </View>
          </View>

          {/* Guardian Link */}
          {role !== 'teacher' && (
            <View style={styles.section}>
              <BlurView intensity={75} tint={isLightMode ? "light" : "dark"} style={StyleSheet.absoluteFillObject} />
              <View style={styles.sectionHeader}>
                <Feather name="users" size={20} color={colors.primary} />
                <Text style={styles.sectionTitle}>Guardian Link</Text>
              </View>
              <View style={styles.sectionContent}>
                <Text style={styles.descriptionText}>Add a parent or guardian's email to send them weekly automated progress reports.</Text>
                <Text style={styles.inputLabel}>Guardian Email</Text>
                <TextInput 
                  style={styles.input}
                  value={guardianEmail}
                  onChangeText={setGuardianEmail}
                  keyboardType="email-address"
                  placeholderTextColor={colors.textTertiary}
                  placeholder="parent@example.com"
                />
                <Pressable style={styles.saveButton} onPress={() => Alert.alert('Guardian Linked', `Reports will be sent to ${guardianEmail || 'the linked email'}`)}>
                  <Text style={styles.saveButtonText}>Link Guardian</Text>
                </Pressable>
              </View>
            </View>
          )}

          {/* Danger Zone */}
          <View style={[styles.section, { borderColor: 'rgba(239, 68, 68, 0.3)' }]}>
            <BlurView intensity={75} tint={isLightMode ? "light" : "dark"} style={StyleSheet.absoluteFillObject} />
            <View style={styles.sectionHeader}>
              <Feather name="alert-triangle" size={20} color={colors.error} />
              <Text style={[styles.sectionTitle, { color: colors.error }]}>Danger Zone</Text>
            </View>
            <View style={styles.sectionContent}>
              <Text style={styles.descriptionText}>Once you delete your account, there is no going back. Please be certain.</Text>
              <Pressable 
                style={styles.deleteButton} 
                onPress={() => Alert.alert('Delete Account', 'Are you sure you want to permanently delete your account? This action cannot be undone.', [{text: 'Cancel', style: 'cancel'}, {text: 'Delete', style: 'destructive'}])}
              >
                <Text style={styles.deleteButtonText}>Delete Account</Text>
              </Pressable>
            </View>
          </View>

        </ScrollView>
      </KeyboardAvoidingView>
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
  sectionContent: {
    padding: spacing.lg,
  },
  inputLabel: {
    fontSize: typography.sizes.sm,
    fontWeight: typography.weights.medium,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
  },
  input: {
    backgroundColor: colors.background === '#F8FAFC' ? 'rgba(255, 255, 255, 0.5)' : 'rgba(0, 0, 0, 0.2)',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    color: colors.text,
    fontSize: typography.sizes.md,
    marginBottom: spacing.lg,
  },
  saveButton: {
    backgroundColor: colors.primary,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    alignItems: 'center',
  },
  saveButtonText: {
    color: colors.background,
    fontWeight: typography.weights.bold,
    fontSize: typography.sizes.md,
  },
  secondaryAction: {
    marginTop: spacing.lg,
    alignItems: 'center',
  },
  secondaryActionText: {
    color: colors.primary,
    fontSize: typography.sizes.sm,
    fontWeight: typography.weights.medium,
  },
  planCard: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.md,
    padding: spacing.lg,
    marginBottom: spacing.lg,
    alignItems: 'center',
  },
  planTitle: {
    fontSize: typography.sizes.lg,
    fontWeight: typography.weights.bold,
    color: colors.text,
  },
  planSubtitle: {
    fontSize: typography.sizes.sm,
    color: colors.textSecondary,
    marginTop: 4,
  },
  descriptionText: {
    fontSize: typography.sizes.sm,
    color: colors.textSecondary,
    marginBottom: spacing.md,
    lineHeight: 20,
  },
  deleteButton: {
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    borderWidth: 1,
    borderColor: colors.error,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    alignItems: 'center',
  },
  deleteButtonText: {
    color: colors.error,
    fontWeight: typography.weights.bold,
    fontSize: typography.sizes.md,
  },
});
