import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  Pressable,
  Alert,
  Platform,
  ScrollView,
  KeyboardAvoidingView,
  ActivityIndicator,
  Modal,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { spacing, typography, borderRadius, useThemeColors } from '@/constants/theme';
import { Feather, FontAwesome5, Ionicons } from '@expo/vector-icons';
import * as WebBrowser from 'expo-web-browser';
import * as AuthSession from 'expo-auth-session';
import { signInWithGoogle, getFriendlyAuthErrorMessage } from '@/lib/auth';

WebBrowser.maybeCompleteAuthSession();

export default function AuthScreen() {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const router = useRouter();
  const { role, board } = useLocalSearchParams<{ role: string; board?: string }>();
  const [selectedRole, setSelectedRole] = useState<'student' | 'teacher'>((role as any) === 'teacher' ? 'teacher' : 'student');

  // Form states
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [socialLoading, setSocialLoading] = useState<'google' | 'apple' | null>(null);
  const [isLogin, setIsLogin] = useState(true);

  // Forgot password modal state
  const [forgotModalVisible, setForgotModalVisible] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [resetLoading, setResetLoading] = useState(false);

  // Status/Feedback banner
  const [feedback, setFeedback] = useState<{ type: 'error' | 'success'; message: string } | null>(null);

  // Email format validator
  const isValidEmail = (val: string) => {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val.trim());
  };

  // Sign In with Email & Password
  async function handleSignIn() {
    setFeedback(null);

    const cleanEmail = email.trim();
    if (!cleanEmail) {
      setFeedback({ type: 'error', message: 'Please enter your email address.' });
      return;
    }
    if (!isValidEmail(cleanEmail)) {
      setFeedback({ type: 'error', message: 'Please enter a valid email address.' });
      return;
    }
    if (!password) {
      setFeedback({ type: 'error', message: 'Please enter your password.' });
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: cleanEmail,
        password: password,
      });

      if (error) {
        const friendly = getFriendlyAuthErrorMessage(error);
        setFeedback({ type: 'error', message: friendly });
        Alert.alert('Sign In Failed', friendly);
      } else if (data.session) {
        // Successful sign-in! AuthContext will automatically navigate to tabs or profile completion.
        // We also trigger router replace as fallback.
        const profileDone = data.user?.user_metadata?.profile_completed === true;
        if (profileDone) {
          router.replace('/(tabs)');
        }
      }
    } catch (err: any) {
      const friendly = getFriendlyAuthErrorMessage(err);
      setFeedback({ type: 'error', message: friendly });
      Alert.alert('Sign In Error', friendly);
    } finally {
      setLoading(false);
    }
  }

  // Sign Up with Email & Password
  async function handleSignUp() {
    setFeedback(null);

    const cleanEmail = email.trim();
    if (!cleanEmail) {
      setFeedback({ type: 'error', message: 'Please enter an email address.' });
      return;
    }
    if (!isValidEmail(cleanEmail)) {
      setFeedback({ type: 'error', message: 'Please enter a valid email address.' });
      return;
    }
    if (!password) {
      setFeedback({ type: 'error', message: 'Please enter a password.' });
      return;
    }
    if (password.length < 6) {
      setFeedback({ type: 'error', message: 'Password must be at least 6 characters long.' });
      return;
    }
    if (password !== confirmPassword) {
      setFeedback({ type: 'error', message: 'Passwords do not match. Please re-enter.' });
      return;
    }

    setLoading(true);
    try {
      const targetRole = role || selectedRole;
      const { data, error } = await supabase.auth.signUp({
        email: cleanEmail,
        password: password,
        options: {
          data: {
            role: targetRole,
            role_selected: true,
            board: board || null,
          },
        },
      });

      if (error) {
        const friendly = getFriendlyAuthErrorMessage(error);
        setFeedback({ type: 'error', message: friendly });
        if (error.message.toLowerCase().includes('already registered')) {
          Alert.alert(
            'Account Exists',
            'An account with this email already exists. Would you like to sign in instead?',
            [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Sign In', onPress: () => setIsLogin(true) },
            ]
          );
        } else {
          Alert.alert('Sign Up Failed', friendly);
        }
      } else if (data.session) {
        // Auto-confirmed: User is logged in immediately
        setFeedback({ type: 'success', message: 'Account created successfully! Welcome to Ziviso.' });
        // AuthContext will automatically redirect to profile completion or tabs
      } else if (data.user) {
        // Confirmation email sent
        Alert.alert(
          'Verification Email Sent',
          `We've sent a verification link to ${cleanEmail}. Please check your inbox and verify your email to sign in.`,
          [{ text: 'OK', onPress: () => setIsLogin(true) }]
        );
        setFeedback({
          type: 'success',
          message: 'Account created! Please verify your email before signing in.',
        });
        setIsLogin(true);
      }
    } catch (err: any) {
      const friendly = getFriendlyAuthErrorMessage(err);
      setFeedback({ type: 'error', message: friendly });
      Alert.alert('Sign Up Error', friendly);
    } finally {
      setLoading(false);
    }
  }

  // Google OAuth Sign-in
  async function handleGoogleSignIn() {
    setFeedback(null);
    setSocialLoading('google');

    try {
      const targetRole = !isLogin ? selectedRole : (role || undefined);
      const result = await signInWithGoogle({
        role: targetRole,
        board: board || undefined,
      });

      if (result.error) {
        const friendly = getFriendlyAuthErrorMessage(result.error);
        setFeedback({ type: 'error', message: friendly });
        Alert.alert('Google Sign-In Failed', friendly);
      } else if (result.success) {
        // Successful OAuth! AuthContext will pick up the session.
      }
      // If cancelled by user, we simply do nothing.
    } catch (err: any) {
      const friendly = getFriendlyAuthErrorMessage(err);
      setFeedback({ type: 'error', message: friendly });
      Alert.alert('Google Sign-In Error', friendly);
    } finally {
      setSocialLoading(null);
    }
  }

  // Apple OAuth Sign-in (iOS)
  async function handleAppleSignIn() {
    setFeedback(null);
    setSocialLoading('apple');

    try {
      const redirectUrl = AuthSession.makeRedirectUri({
        scheme: 'ziviso',
        path: '(tabs)',
      });

      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'apple',
        options: {
          redirectTo: redirectUrl,
          skipBrowserRedirect: Platform.OS !== 'web',
        },
      });

      if (error) throw error;

      if (Platform.OS !== 'web' && data?.url) {
        const res = await WebBrowser.openAuthSessionAsync(data.url, redirectUrl);
        if (res.type === 'success' && res.url) {
          const { handleAuthRedirect } = await import('@/lib/auth');
          await handleAuthRedirect(res.url);
        }
      }
    } catch (err: any) {
      const friendly = getFriendlyAuthErrorMessage(err);
      setFeedback({ type: 'error', message: friendly });
      Alert.alert('Apple Sign-In Error', friendly);
    } finally {
      setSocialLoading(null);
    }
  }

  // Password Reset Handler
  async function handleSendResetPassword() {
    const cleanEmail = (resetEmail || email).trim();
    if (!cleanEmail || !isValidEmail(cleanEmail)) {
      Alert.alert('Invalid Email', 'Please enter a valid email address to receive password reset instructions.');
      return;
    }

    setResetLoading(true);
    try {
      const redirectUrl = AuthSession.makeRedirectUri({
        scheme: 'ziviso',
        path: '(tabs)',
      });

      const { error } = await supabase.auth.resetPasswordForEmail(cleanEmail, {
        redirectTo: redirectUrl,
      });

      if (error) {
        Alert.alert('Reset Failed', getFriendlyAuthErrorMessage(error));
      } else {
        setForgotModalVisible(false);
        Alert.alert(
          'Password Reset Email Sent',
          `We've sent password reset instructions to ${cleanEmail}. Please check your inbox.`
        );
        setFeedback({
          type: 'success',
          message: 'Password reset link sent to your email.',
        });
      }
    } catch (err: any) {
      Alert.alert('Reset Error', getFriendlyAuthErrorMessage(err));
    } finally {
      setResetLoading(false);
    }
  }

  const passwordsMatch = !isLogin && password && confirmPassword && password === confirmPassword;
  const passwordsMismatch = !isLogin && confirmPassword && password !== confirmPassword;

  return (
    <View style={styles.safeContainer}>
      <KeyboardAvoidingView
        style={styles.flexOne}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          bounces={true}
          overScrollMode="always"
        >
          {/* Header */}
          <View style={styles.header}>
            <Pressable
              onPress={() => router.back()}
              style={styles.backButton}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Feather name="arrow-left" size={24} color={colors.text} />
            </Pressable>

            <Text style={styles.title}>{isLogin ? 'Welcome Back' : 'Create Account'}</Text>
            <Text style={styles.subtitle}>
              {isLogin
                ? 'Sign in to access your AI tutor, courses, and past papers.'
                : role === 'teacher'
                ? 'Join Ziviso as an Educator to mentor and mark papers.'
                : 'Join Ziviso to unlock AI-powered learning and practice.'}
            </Text>

            {role && (
              <View style={styles.roleBadge}>
                <Feather
                  name={role === 'teacher' ? 'award' : 'book'}
                  size={14}
                  color={colors.primary}
                />
                <Text style={styles.roleBadgeText}>
                  {role === 'teacher' ? 'Teacher Account' : 'Student Account'}
                  {board ? ` • ${board.toUpperCase()}` : ''}
                </Text>
              </View>
            )}
          </View>

          {/* Feedback Banner */}
          {feedback && (
            <View
              style={[
                styles.feedbackBanner,
                feedback.type === 'error' ? styles.feedbackBannerError : styles.feedbackBannerSuccess,
              ]}
            >
              <Feather
                name={feedback.type === 'error' ? 'alert-circle' : 'check-circle'}
                size={18}
                color={feedback.type === 'error' ? '#EF4444' : '#10B981'}
              />
              <Text
                style={[
                  styles.feedbackText,
                  feedback.type === 'error' ? styles.feedbackTextError : styles.feedbackTextSuccess,
                ]}
              >
                {feedback.message}
              </Text>
            </View>
          )}

          {/* Form */}
          <View style={styles.form}>
            {/* Account Type Selector for Sign Up */}
            {!isLogin && (
              <View style={styles.roleSelectorBox}>
                <Text style={styles.roleSelectorTitle}>I AM REGISTERING AS</Text>
                <View style={styles.roleSelectorRow}>
                  <Pressable
                    style={[
                      styles.roleSelectorCard,
                      selectedRole === 'student' && styles.roleSelectorCardActive,
                    ]}
                    onPress={() => setSelectedRole('student')}
                  >
                    <Feather
                      name="book"
                      size={18}
                      color={selectedRole === 'student' ? colors.primary : colors.textSecondary}
                    />
                    <Text
                      style={[
                        styles.roleSelectorText,
                        selectedRole === 'student' && styles.roleSelectorTextActive,
                      ]}
                    >
                      Student
                    </Text>
                  </Pressable>

                  <Pressable
                    style={[
                      styles.roleSelectorCard,
                      selectedRole === 'teacher' && styles.roleSelectorCardActive,
                    ]}
                    onPress={() => setSelectedRole('teacher')}
                  >
                    <Feather
                      name="award"
                      size={18}
                      color={selectedRole === 'teacher' ? colors.primary : colors.textSecondary}
                    />
                    <Text
                      style={[
                        styles.roleSelectorText,
                        selectedRole === 'teacher' && styles.roleSelectorTextActive,
                      ]}
                    >
                      Teacher
                    </Text>
                  </Pressable>
                </View>
              </View>
            )}

            {/* Email Address */}
            <View style={styles.inputContainer}>
              <Text style={styles.label}>Email Address</Text>
              <View style={styles.inputWrapper}>
                <Feather name="mail" size={18} color={colors.textTertiary} style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  placeholder="name@example.com"
                  placeholderTextColor={colors.textTertiary}
                  value={email}
                  onChangeText={(val) => {
                    setEmail(val);
                    if (feedback) setFeedback(null);
                  }}
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="email"
                  textContentType="emailAddress"
                  keyboardType="email-address"
                />
                {email.length > 0 && (
                  <Pressable onPress={() => setEmail('')} hitSlop={10} style={styles.inputRightIcon}>
                    <Feather name="x" size={16} color={colors.textTertiary} />
                  </Pressable>
                )}
              </View>

              {/* Email helper domain shortcuts */}
              {email.length > 0 && !email.includes('@') && (
                <View style={styles.domainChipsContainer}>
                  {['@gmail.com', '@outlook.com', '@icloud.com'].map((suffix) => (
                    <Pressable
                      key={suffix}
                      onPress={() => setEmail((prev) => prev.trim() + suffix)}
                      style={styles.domainChip}
                    >
                      <Text style={styles.domainChipText}>{suffix}</Text>
                    </Pressable>
                  ))}
                </View>
              )}
            </View>

            {/* Password */}
            <View style={styles.inputContainer}>
              <View style={styles.labelRow}>
                <Text style={styles.label}>Password</Text>
                {isLogin && (
                  <Pressable
                    onPress={() => {
                      setResetEmail(email);
                      setForgotModalVisible(true);
                    }}
                  >
                    <Text style={styles.forgotPasswordText}>Forgot password?</Text>
                  </Pressable>
                )}
              </View>
              <View style={styles.inputWrapper}>
                <Feather name="lock" size={18} color={colors.textTertiary} style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  placeholder={isLogin ? 'Enter your password' : 'Create a secure password (min. 6 chars)'}
                  placeholderTextColor={colors.textTertiary}
                  value={password}
                  onChangeText={(val) => {
                    setPassword(val);
                    if (feedback) setFeedback(null);
                  }}
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                  autoCorrect={false}
                  textContentType={isLogin ? 'password' : 'newPassword'}
                />
                <Pressable
                  onPress={() => setShowPassword(!showPassword)}
                  hitSlop={10}
                  style={styles.inputRightIcon}
                >
                  <Feather
                    name={showPassword ? 'eye-off' : 'eye'}
                    size={18}
                    color={colors.textTertiary}
                  />
                </Pressable>
              </View>
            </View>

            {/* Confirm Password (Sign Up only) */}
            {!isLogin && (
              <View style={styles.inputContainer}>
                <Text style={styles.label}>Confirm Password</Text>
                <View
                  style={[
                    styles.inputWrapper,
                    passwordsMismatch ? styles.inputWrapperError : undefined,
                    passwordsMatch ? styles.inputWrapperSuccess : undefined,
                  ]}
                >
                  <Feather name="lock" size={18} color={colors.textTertiary} style={styles.inputIcon} />
                  <TextInput
                    style={styles.input}
                    placeholder="Re-enter your password"
                    placeholderTextColor={colors.textTertiary}
                    value={confirmPassword}
                    onChangeText={(val) => {
                      setConfirmPassword(val);
                      if (feedback) setFeedback(null);
                    }}
                    secureTextEntry={!showConfirmPassword}
                    autoCapitalize="none"
                    autoCorrect={false}
                    textContentType="newPassword"
                  />
                  <Pressable
                    onPress={() => setShowConfirmPassword(!showConfirmPassword)}
                    hitSlop={10}
                    style={styles.inputRightIcon}
                  >
                    <Feather
                      name={showConfirmPassword ? 'eye-off' : 'eye'}
                      size={18}
                      color={colors.textTertiary}
                    />
                  </Pressable>
                </View>

                {passwordsMismatch && (
                  <Text style={styles.fieldErrorText}>Passwords do not match.</Text>
                )}
                {passwordsMatch && (
                  <Text style={styles.fieldSuccessText}>✓ Passwords match</Text>
                )}
              </View>
            )}

            {/* Submit Button */}
            <Pressable
              style={[styles.primaryButton, (loading || socialLoading !== null) && styles.buttonDisabled]}
              onPress={isLogin ? handleSignIn : handleSignUp}
              disabled={loading || socialLoading !== null}
            >
              {loading ? (
                <View style={styles.buttonLoadingRow}>
                  <ActivityIndicator color={colors.background} size="small" />
                  <Text style={styles.primaryButtonText}>
                    {isLogin ? 'Signing In...' : 'Creating Account...'}
                  </Text>
                </View>
              ) : (
                <Text style={styles.primaryButtonText}>
                  {isLogin ? 'Sign In with Email' : 'Create Account'}
                </Text>
              )}
            </Pressable>

            {/* Divider */}
            <View style={styles.dividerContainer}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>OR CONTINUE WITH</Text>
              <View style={styles.dividerLine} />
            </View>

            {/* Social Logins */}
            <View style={styles.socialButtonsContainer}>
              {/* Google Button */}
              <Pressable
                style={[
                  styles.googleButton,
                  (loading || socialLoading !== null) && styles.buttonDisabled,
                ]}
                onPress={handleGoogleSignIn}
                disabled={loading || socialLoading !== null}
              >
                {socialLoading === 'google' ? (
                  <ActivityIndicator color={colors.text} size="small" />
                ) : (
                  <>
                    <View style={styles.googleIconContainer}>
                      <FontAwesome5 name="google" size={18} color="#4285F4" />
                    </View>
                    <Text style={styles.googleButtonText}>Continue with Google</Text>
                  </>
                )}
              </Pressable>

              {/* Apple Button (iOS) */}
              {Platform.OS === 'ios' && (
                <Pressable
                  style={[
                    styles.appleButton,
                    (loading || socialLoading !== null) && styles.buttonDisabled,
                  ]}
                  onPress={handleAppleSignIn}
                  disabled={loading || socialLoading !== null}
                >
                  {socialLoading === 'apple' ? (
                    <ActivityIndicator color={colors.text} size="small" />
                  ) : (
                    <>
                      <FontAwesome5 name="apple" size={20} color={colors.text} />
                      <Text style={styles.appleButtonText}>Continue with Apple</Text>
                    </>
                  )}
                </Pressable>
              )}
            </View>

            {/* Switch between Sign In and Sign Up */}
            <Pressable
              style={styles.switchModeButton}
              onPress={() => {
                setIsLogin(!isLogin);
                setFeedback(null);
              }}
            >
              <Text style={styles.switchModePrompt}>
                {isLogin ? "Don't have an account? " : 'Already have an account? '}
                <Text style={styles.switchModeAction}>
                  {isLogin ? 'Sign Up' : 'Sign In'}
                </Text>
              </Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Forgot Password Modal */}
      <Modal
        visible={forgotModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setForgotModalVisible(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalOverlay}
        >
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <View style={styles.modalIconWrap}>
                <Feather name="key" size={22} color={colors.primary} />
              </View>
              <Text style={styles.modalTitle}>Reset Password</Text>
              <Text style={styles.modalSubtitle}>
                Enter your registered email address and we will send you a password reset link.
              </Text>
            </View>

            <View style={styles.modalInputContainer}>
              <Text style={styles.label}>Email Address</Text>
              <View style={styles.inputWrapper}>
                <Feather name="mail" size={18} color={colors.textTertiary} style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  placeholder="name@example.com"
                  placeholderTextColor={colors.textTertiary}
                  value={resetEmail}
                  onChangeText={setResetEmail}
                  autoCapitalize="none"
                  keyboardType="email-address"
                  autoFocus
                />
              </View>
            </View>

            <View style={styles.modalActions}>
              <Pressable
                style={styles.modalCancelButton}
                onPress={() => setForgotModalVisible(false)}
                disabled={resetLoading}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </Pressable>

              <Pressable
                style={[styles.modalSubmitButton, resetLoading && styles.buttonDisabled]}
                onPress={handleSendResetPassword}
                disabled={resetLoading}
              >
                {resetLoading ? (
                  <ActivityIndicator color={colors.background} size="small" />
                ) : (
                  <Text style={styles.modalSubmitText}>Send Link</Text>
                )}
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const createStyles = (colors: any) =>
  StyleSheet.create({
    safeContainer: {
      flex: 1,
      backgroundColor: colors.background,
    },
    flexOne: {
      flex: 1,
    },
    scrollContent: {
      paddingHorizontal: spacing.xl,
      paddingBottom: 60,
    },
    header: {
      marginTop: spacing.xxxl,
      marginBottom: spacing.xl,
    },
    backButton: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: colors.surfaceHighlight || colors.surface,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: spacing.lg,
    },
    title: {
      fontSize: typography.sizes.xxl,
      fontWeight: typography.weights.bold,
      color: colors.text,
      marginBottom: spacing.xs,
    },
    subtitle: {
      fontSize: typography.sizes.md,
      color: colors.textSecondary,
      lineHeight: 22,
    },
    roleBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      alignSelf: 'flex-start',
      gap: 6,
      backgroundColor: (colors.primary || '#3B82F6') + '15',
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: borderRadius.full,
      marginTop: spacing.sm,
    },
    roleBadgeText: {
      fontSize: typography.sizes.xs,
      fontWeight: typography.weights.semibold,
      color: colors.primary,
    },
    feedbackBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      padding: spacing.md,
      borderRadius: borderRadius.md,
      marginBottom: spacing.lg,
    },
    feedbackBannerError: {
      backgroundColor: '#FEF2F2',
      borderWidth: 1,
      borderColor: '#FCA5A5',
    },
    feedbackBannerSuccess: {
      backgroundColor: '#ECFDF5',
      borderWidth: 1,
      borderColor: '#6EE7B7',
    },
    feedbackText: {
      flex: 1,
      fontSize: typography.sizes.sm,
      lineHeight: 18,
    },
    feedbackTextError: {
      color: '#B91C1C',
    },
    feedbackTextSuccess: {
      color: '#047857',
    },
    form: {
      paddingBottom: spacing.xxl,
    },
    roleSelectorBox: {
      marginBottom: spacing.lg,
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.cardBorder,
      borderRadius: borderRadius.lg,
      padding: spacing.md,
    },
    roleSelectorTitle: {
      fontSize: 11,
      fontWeight: '700',
      color: colors.textSecondary,
      letterSpacing: 0.8,
      marginBottom: spacing.sm,
      textTransform: 'uppercase',
    },
    roleSelectorRow: {
      flexDirection: 'row',
      gap: spacing.sm,
    },
    roleSelectorCard: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      paddingVertical: 12,
      paddingHorizontal: 12,
      borderRadius: borderRadius.md,
      borderWidth: 1.5,
      borderColor: colors.cardBorder,
      backgroundColor: colors.surfaceHighlight || colors.surface,
    },
    roleSelectorCardActive: {
      borderColor: colors.primary,
      backgroundColor: (colors.primary || '#3B82F6') + '15',
    },
    roleSelectorText: {
      fontSize: typography.sizes.sm,
      fontWeight: '600',
      color: colors.textSecondary,
    },
    roleSelectorTextActive: {
      color: colors.primary,
      fontWeight: '700',
    },
    inputContainer: {
      marginBottom: spacing.lg,
    },
    labelRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: spacing.xs,
    },
    label: {
      fontSize: typography.sizes.sm,
      fontWeight: typography.weights.medium,
      color: colors.text,
      marginBottom: spacing.xs,
    },
    forgotPasswordText: {
      fontSize: typography.sizes.xs,
      color: colors.primary,
      fontWeight: typography.weights.medium,
    },
    inputWrapper: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: borderRadius.md,
      paddingHorizontal: spacing.md,
    },
    inputWrapperError: {
      borderColor: '#EF4444',
    },
    inputWrapperSuccess: {
      borderColor: '#10B981',
    },
    inputIcon: {
      marginRight: spacing.sm,
    },
    inputRightIcon: {
      padding: spacing.xs,
    },
    input: {
      flex: 1,
      paddingVertical: Platform.OS === 'ios' ? spacing.md : spacing.sm + 2,
      fontSize: typography.sizes.md,
      color: colors.text,
    },
    domainChipsContainer: {
      flexDirection: 'row',
      gap: 6,
      marginTop: 8,
      flexWrap: 'wrap',
    },
    domainChip: {
      backgroundColor: colors.surfaceHighlight || colors.card,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: borderRadius.full,
      paddingHorizontal: 10,
      paddingVertical: 5,
    },
    domainChipText: {
      fontSize: 12,
      fontWeight: '600',
      color: colors.primary,
    },
    fieldErrorText: {
      fontSize: typography.sizes.xs,
      color: '#EF4444',
      marginTop: 4,
      marginLeft: 2,
    },
    fieldSuccessText: {
      fontSize: typography.sizes.xs,
      color: '#10B981',
      marginTop: 4,
      marginLeft: 2,
    },
    primaryButton: {
      backgroundColor: colors.primary,
      paddingVertical: spacing.lg,
      borderRadius: borderRadius.md,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: spacing.sm,
    },
    buttonDisabled: {
      opacity: 0.65,
    },
    buttonLoadingRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
    },
    primaryButtonText: {
      color: colors.background,
      fontSize: typography.sizes.md,
      fontWeight: typography.weights.semibold,
    },
    dividerContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      marginVertical: spacing.xl,
    },
    dividerLine: {
      flex: 1,
      height: 1,
      backgroundColor: colors.border,
    },
    dividerText: {
      marginHorizontal: spacing.md,
      color: colors.textTertiary,
      fontSize: 11,
      letterSpacing: 0.5,
      fontWeight: '600',
    },
    socialButtonsContainer: {
      gap: spacing.md,
    },
    googleButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      paddingVertical: spacing.md + 2,
      borderRadius: borderRadius.md,
      gap: spacing.md,
    },
    googleIconContainer: {
      width: 24,
      height: 24,
      alignItems: 'center',
      justifyContent: 'center',
    },
    googleButtonText: {
      color: colors.text,
      fontSize: typography.sizes.md,
      fontWeight: typography.weights.semibold,
    },
    appleButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      paddingVertical: spacing.md + 2,
      borderRadius: borderRadius.md,
      gap: spacing.md,
    },
    appleButtonText: {
      color: colors.text,
      fontSize: typography.sizes.md,
      fontWeight: typography.weights.semibold,
    },
    switchModeButton: {
      marginTop: spacing.xxl,
      alignItems: 'center',
      paddingVertical: spacing.sm,
    },
    switchModePrompt: {
      fontSize: typography.sizes.sm,
      color: colors.textSecondary,
    },
    switchModeAction: {
      color: colors.primary,
      fontWeight: typography.weights.bold,
    },
    // Modal Styles
    modalOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0, 0, 0, 0.5)',
      justifyContent: 'center',
      alignItems: 'center',
      padding: spacing.lg,
    },
    modalContent: {
      width: '100%',
      maxWidth: 420,
      backgroundColor: colors.background,
      borderRadius: borderRadius.lg,
      padding: spacing.xl,
      borderWidth: 1,
      borderColor: colors.border,
    },
    modalHeader: {
      alignItems: 'center',
      marginBottom: spacing.lg,
    },
    modalIconWrap: {
      width: 48,
      height: 48,
      borderRadius: 24,
      backgroundColor: (colors.primary || '#3B82F6') + '20',
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: spacing.sm,
    },
    modalTitle: {
      fontSize: typography.sizes.lg,
      fontWeight: typography.weights.bold,
      color: colors.text,
      marginBottom: spacing.xs,
    },
    modalSubtitle: {
      fontSize: typography.sizes.sm,
      color: colors.textSecondary,
      textAlign: 'center',
      lineHeight: 20,
    },
    modalInputContainer: {
      marginBottom: spacing.xl,
    },
    modalActions: {
      flexDirection: 'row',
      gap: spacing.md,
    },
    modalCancelButton: {
      flex: 1,
      paddingVertical: spacing.md,
      borderRadius: borderRadius.md,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.surface,
    },
    modalCancelText: {
      color: colors.textSecondary,
      fontSize: typography.sizes.sm,
      fontWeight: typography.weights.medium,
    },
    modalSubmitButton: {
      flex: 1,
      paddingVertical: spacing.md,
      borderRadius: borderRadius.md,
      backgroundColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    modalSubmitText: {
      color: colors.background,
      fontSize: typography.sizes.sm,
      fontWeight: typography.weights.semibold,
    },
  });
