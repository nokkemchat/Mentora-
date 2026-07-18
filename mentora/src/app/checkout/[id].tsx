import React, { useMemo, useState, useEffect } from 'react';
import { View, Text, StyleSheet, TextInput, Pressable, ActivityIndicator, Alert } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { spacing, typography, borderRadius, useThemeColors } from '@/constants/theme';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';

export default function CheckoutScreen() {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuth();

  const [course, setCourse] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [phoneNumber, setPhoneNumber] = useState('077');
  const [processing, setProcessing] = useState(false);
  const [paymentStatus, setPaymentStatus] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    const fetchCourse = async () => {
      const { data } = await supabase.from('courses').select('*').eq('id', id).single();
      if (data) setCourse(data);
      setLoading(false);
    };
    fetchCourse();
  }, [id]);

  useEffect(() => {
    // If waiting for payment, subscribe to realtime updates
    if (processing && paymentStatus === 'Pending') {
      const channel = supabase
        .channel('schema-db-changes')
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'payments',
            filter: `course_id=eq.${id}`
          },
          (payload) => {
            const newStatus = payload.new.status;
            if (newStatus === 'Paid') {
              setPaymentStatus('Paid');
              setProcessing(false);
              Alert.alert('Payment Successful!', 'Your course is now unlocked.', [
                { text: 'Start Learning', onPress: () => router.replace(`/course/${id}`) }
              ]);
            } else if (newStatus === 'Failed' || newStatus === 'Cancelled') {
              setPaymentStatus(newStatus);
              setProcessing(false);
              Alert.alert('Payment Failed', 'The transaction was declined or timed out.');
            }
          }
        )
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    }
  }, [processing, paymentStatus, id]);

  const handlePay = async () => {
    if (phoneNumber.length < 10) {
      Alert.alert('Invalid Number', 'Please enter a valid EcoCash number.');
      return;
    }

    setProcessing(true);
    setPaymentStatus('Initiating');

    try {
      const { data, error } = await supabase.functions.invoke('paynow-checkout', {
        body: { course_id: id, phone_number: phoneNumber, amount: course.price }
      });

      if (error || !data?.success) {
        throw new Error(data?.error || error?.message || 'Failed to initiate payment');
      }

      setPaymentStatus('Pending');
      // Now the user should see a prompt on their phone.
    } catch (err: any) {
      console.error(err);
      Alert.alert('Error', err.message);
      setProcessing(false);
      setPaymentStatus(null);
    }
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (!course) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>Course not found.</Text>
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <Text style={styles.backButtonText}>Go Back</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Pressable onPress={() => router.back()} style={styles.backNav}>
        <Feather name="arrow-left" size={24} color={colors.text} />
      </Pressable>

      <Text style={styles.headerTitle}>Checkout</Text>

      <View style={styles.courseCard}>
        <View style={[styles.iconContainer, { backgroundColor: course.color }]}>
          <MaterialCommunityIcons name={course.icon as any} size={40} color={colors.background} />
        </View>
        <View style={styles.courseInfo}>
          <Text style={styles.courseTitle}>{course.title}</Text>
          <Text style={styles.courseMeta}>{course.board} • {course.level}</Text>
        </View>
        <Text style={styles.price}>${course.price}</Text>
      </View>

      <View style={styles.paymentCard}>
        <Text style={styles.paymentMethodTitle}>Pay with EcoCash</Text>
        <Text style={styles.paymentInstructions}>
          Enter your EcoCash number below. A prompt will be sent to your phone to enter your PIN.
        </Text>

        <TextInput
          style={styles.input}
          keyboardType="phone-pad"
          value={phoneNumber}
          onChangeText={setPhoneNumber}
          placeholder="077..."
          placeholderTextColor={colors.textTertiary}
          editable={!processing}
        />

        <Pressable 
          style={[styles.payButton, processing && styles.payButtonDisabled]}
          onPress={handlePay}
          disabled={processing}
        >
          {processing ? (
            <ActivityIndicator color={colors.background} size="small" />
          ) : (
            <Text style={styles.payButtonText}>Pay ${course.price}</Text>
          )}
        </Pressable>

        {paymentStatus === 'Pending' && (
          <View style={styles.pendingContainer}>
            <ActivityIndicator color={colors.primary} style={{ marginRight: spacing.md }} />
            <Text style={styles.pendingText}>Waiting for payment on your phone...</Text>
          </View>
        )}
      </View>
    </View>
  );
}

const createStyles = (colors: any) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    padding: spacing.xl,
    paddingTop: spacing.xxxl,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
  },
  backNav: {
    marginBottom: spacing.lg,
  },
  headerTitle: {
    fontSize: typography.sizes.xxl,
    fontWeight: typography.weights.bold,
    color: colors.text,
    fontFamily: 'Outfit_700Bold',
    marginBottom: spacing.xl,
  },
  courseCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    padding: spacing.lg,
    borderRadius: borderRadius.lg,
    marginBottom: spacing.xl,
  },
  iconContainer: {
    width: 60,
    height: 60,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  courseInfo: {
    flex: 1,
  },
  courseTitle: {
    fontSize: typography.sizes.md,
    fontWeight: typography.weights.bold,
    fontFamily: 'Outfit_600SemiBold',
    color: colors.text,
  },
  courseMeta: {
    fontSize: typography.sizes.sm,
    color: colors.textSecondary,
    fontFamily: 'Outfit_400Regular',
  },
  price: {
    fontSize: typography.sizes.xl,
    fontWeight: typography.weights.bold,
    fontFamily: 'Outfit_700Bold',
    color: colors.text,
  },
  paymentCard: {
    backgroundColor: colors.surface,
    padding: spacing.xl,
    borderRadius: borderRadius.lg,
    alignItems: 'center',
  },
  paymentMethodTitle: {
    fontSize: typography.sizes.lg,
    fontWeight: typography.weights.bold,
    fontFamily: 'Outfit_600SemiBold',
    color: colors.text,
    marginBottom: spacing.sm,
  },
  paymentInstructions: {
    fontSize: typography.sizes.sm,
    color: colors.textSecondary,
    fontFamily: 'Outfit_400Regular',
    textAlign: 'center',
    marginBottom: spacing.xl,
  },
  input: {
    width: '100%',
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    fontSize: typography.sizes.md,
    fontFamily: 'Outfit_500Medium',
    color: colors.text,
    marginBottom: spacing.lg,
    textAlign: 'center',
  },
  payButton: {
    width: '100%',
    backgroundColor: colors.primary,
    padding: spacing.md,
    borderRadius: borderRadius.full,
    alignItems: 'center',
  },
  payButtonDisabled: {
    opacity: 0.7,
  },
  payButtonText: {
    color: '#FFFFFF',
    fontSize: typography.sizes.md,
    fontFamily: 'Outfit_600SemiBold',
  },
  pendingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.xl,
    padding: spacing.md,
    backgroundColor: colors.surfaceHighlight,
    borderRadius: borderRadius.md,
    width: '100%',
  },
  pendingText: {
    color: colors.textSecondary,
    fontSize: typography.sizes.sm,
    fontFamily: 'Outfit_500Medium',
  },
  errorText: {
    fontSize: typography.sizes.lg,
    color: colors.error,
    marginBottom: spacing.md,
  },
  backButton: {
    padding: spacing.md,
    backgroundColor: colors.primary,
    borderRadius: borderRadius.md,
  },
  backButtonText: {
    color: colors.background,
    fontWeight: typography.weights.bold,
  },
});
