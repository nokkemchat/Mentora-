import React, { useEffect, useState } from 'react';
import { View, StyleSheet, Platform, Text, Pressable, ActivityIndicator, TextInput, Alert, KeyboardAvoidingView } from 'react-native';
import { Tabs } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { typography, spacing, borderRadius, useThemeColors } from '@/constants/theme';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import { MentoraTabBar } from '@/components/MentoraTabBar';

export default function TabsLayout() {
  const colors = useThemeColors();
  const { user } = useAuth();
  const role = user?.user_metadata?.role;
  
  const [isApproved, setIsApproved]     = useState(false);
  const [isActivated, setIsActivated]   = useState(false);
  const [loadingStatus, setLoadingStatus] = useState(true);
  const [verificationCode, setVerificationCode] = useState('');
  const [verifying, setVerifying]       = useState(false);

  useEffect(() => {
    if (!user || role !== 'teacher') {
      setLoadingStatus(false);
      return;
    }

    const checkTeacherStatus = async () => {
      const { data: profile, error } = await supabase
        .from('profiles')
        .select('is_approved, is_activated')
        .eq('id', user.id)
        .single();

      if (!error && profile) {
        setIsApproved(!!profile.is_approved);
        setIsActivated(!!profile.is_activated);
      }
      setLoadingStatus(false);
    };

    checkTeacherStatus();

    const subscription = supabase
      .channel('profile_changes_layout')
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'profiles',
        filter: `id=eq.${user.id}`,
      }, (payload) => {
        setIsApproved(!!payload.new.is_approved);
        setIsActivated(!!payload.new.is_activated);
      })
      .subscribe();

    return () => { supabase.removeChannel(subscription); };
  }, [user, role]);

  const handleVerifyCode = async () => {
    if (!verificationCode || verificationCode.length < 6) {
      Alert.alert('Invalid Code', 'Please enter the 6-digit verification code.');
      return;
    }
    setVerifying(true);

    const { data: profile, error } = await supabase
      .from('profiles')
      .select('activation_code')
      .eq('id', user?.id)
      .single();

    if (error) {
      Alert.alert('Error', 'Database error: ' + error.message);
      setVerifying(false);
      return;
    }

    if (profile?.activation_code === verificationCode.trim()) {
      const { error: updateError } = await supabase
        .from('profiles')
        .update({ is_activated: true })
        .eq('id', user?.id);

      if (!updateError) {
        setIsActivated(true);
      } else {
        Alert.alert('Error', 'Failed to activate account. ' + updateError.message);
      }
    } else {
      Alert.alert('Incorrect Code', `Expected: ${profile?.activation_code}, Got: ${verificationCode.trim()}`);
    }
    setVerifying(false);
  };

  // ── Gate: Loading ──────────────────────────────────────────────────────────
  if (loadingStatus) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  // ── Gate: Teacher pending approval ────────────────────────────────────────
  if (role === 'teacher' && !isApproved) {
    return (
      <View style={[styles.blockContainer, { backgroundColor: colors.background }]}>
        <Feather name="clock" size={64} color={colors.warning} style={{ marginBottom: spacing.xl }} />
        <Text style={[styles.greeting, { color: colors.text }]}>Account Under Review</Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
          Your educator profile has been submitted and is currently being reviewed by our administrators. We will send you an email once you are approved!
        </Text>
      </View>
    );
  }

  // ── Gate: Teacher approved but needs activation code ──────────────────────
  if (role === 'teacher' && isApproved && !isActivated) {
    return (
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={[styles.blockContainer, { backgroundColor: colors.background }]}
      >
        <View style={{ alignItems: 'center', marginBottom: spacing.xxl }}>
          <View style={{ width: 80, height: 80, borderRadius: 40, backgroundColor: colors.success + '20', alignItems: 'center', justifyContent: 'center', marginBottom: spacing.lg }}>
            <Feather name="check" size={40} color={colors.success} />
          </View>
          <Text style={[styles.greeting, { color: colors.text }]}>You're Approved!</Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
            We've sent a 6-digit verification code to your email. Enter it below to unlock your dashboard.
          </Text>
        </View>

        <View style={{ width: '100%', marginBottom: spacing.xxl, maxWidth: 400, alignItems: 'center' }}>
          <Text style={[styles.statLabel, { marginBottom: spacing.md, color: colors.text }]}>Enter 6-Digit Code</Text>
          <View style={styles.otpContainer}>
            {[0, 1, 2, 3, 4, 5].map((index) => {
              const digit = verificationCode[index] || '';
              const isFocused = verificationCode.length === index || (verificationCode.length === 6 && index === 5);
              return (
                <View
                  key={index}
                  style={[
                    styles.otpBox,
                    {
                      borderColor: isFocused ? colors.primary : colors.border,
                      backgroundColor: isFocused ? `${colors.primary}10` : colors.surface,
                    },
                  ]}
                >
                  <Text style={[styles.otpText, { color: colors.text }]}>{digit}</Text>
                </View>
              );
            })}
            <TextInput
              style={styles.hiddenInput}
              value={verificationCode}
              onChangeText={setVerificationCode}
              keyboardType="number-pad"
              maxLength={6}
              autoFocus={true}
              caretHidden={true}
            />
          </View>
        </View>

        <Pressable
          style={[styles.primaryButton, { backgroundColor: colors.primary, width: '100%', maxWidth: 400 }, verifying && { opacity: 0.7 }]}
          onPress={handleVerifyCode}
          disabled={verifying}
        >
          {verifying ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.primaryButtonText}>Verify & Continue</Text>
          )}
        </Pressable>
      </KeyboardAvoidingView>
    );
  }

  // ── Main App Tabs ──────────────────────────────────────────────────────────
  return (
    <Tabs
      screenOptions={{ headerShown: false }}
      tabBar={(props) => <MentoraTabBar {...props} />}
    >
      <Tabs.Screen name="index"   options={{ title: 'Home' }} />
      <Tabs.Screen name="courses" options={{ title: 'Courses' }} />
      <Tabs.Screen name="rooms"   options={{ title: 'Rooms' }} />
      <Tabs.Screen name="profile" options={{ title: 'Profile' }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  blockContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xl,
  },
  greeting: {
    fontSize: typography.sizes.xl,
    fontWeight: typography.weights.bold,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  subtitle: {
    fontSize: typography.sizes.sm,
    textAlign: 'center',
    lineHeight: 24,
  },
  statLabel: {
    fontSize: typography.sizes.xs,
    fontWeight: typography.weights.medium,
  },
  otpContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    position: 'relative',
  },
  otpBox: {
    width: 48,
    height: 56,
    borderWidth: 2,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  otpText: {
    fontSize: 24,
    fontWeight: 'bold',
  },
  hiddenInput: {
    position: 'absolute',
    width: '100%',
    height: '100%',
    opacity: 0,
  },
  primaryButton: {
    paddingVertical: spacing.lg,
    borderRadius: borderRadius.md,
    alignItems: 'center',
  },
  primaryButtonText: {
    color: '#fff',
    fontSize: typography.sizes.md,
    fontWeight: typography.weights.semibold,
  },
});
