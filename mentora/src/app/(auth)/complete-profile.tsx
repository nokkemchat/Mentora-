import React, { useState, useMemo } from 'react';
import { View, Text, StyleSheet, TextInput, Pressable, Alert, Modal, ScrollView, KeyboardAvoidingView, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { spacing, typography, borderRadius, useThemeColors } from '@/constants/theme';
import { Feather } from '@expo/vector-icons';
import { useAuth } from '@/context/AuthContext';
import { ZIMBABWE_SCHOOLS } from '@/data/schools';

const FORM_OPTIONS = [
  'Form 1',
  'Form 2',
  'Form 3',
  'Form 4',
  'Lower 6',
  'Upper 6',
  'Grade 7',
  'Other',
];

export default function CompleteProfileScreen() {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const router = useRouter();
  const { user } = useAuth();
  
  // Name state
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');

  // Grade state
  const [grade, setGrade] = useState('');
  const [isGradeDropdownVisible, setGradeDropdownVisible] = useState(false);

  // School state
  const [selectedSchoolOption, setSelectedSchoolOption] = useState('');
  const [customSchool, setCustomSchool] = useState('');
  const [isSchoolDropdownVisible, setSchoolDropdownVisible] = useState(false);
  const [schoolSearchQuery, setSchoolSearchQuery] = useState('');

  // Other form state
  const [age, setAge] = useState('');
  const [city, setCity] = useState('');
  const [loading, setLoading] = useState(false);

  const filteredSchools = useMemo(() => {
    let filtered = ZIMBABWE_SCHOOLS.filter(s => 
      s.toLowerCase().includes(schoolSearchQuery.toLowerCase())
    );
    // Ensure "Other" is always at the bottom if it's not already in the filtered results
    if (!filtered.includes('Other')) {
      filtered.push('Other');
    }
    // Move "Other" to the very end just to be safe
    filtered = filtered.filter(s => s !== 'Other');
    filtered.push('Other');
    return filtered;
  }, [schoolSearchQuery]);

  async function handleSubmit() {
    const finalSchool = selectedSchoolOption === 'Other' ? customSchool : selectedSchoolOption;

    if (!firstName.trim() || !lastName.trim() || !finalSchool.trim() || !grade || !age.trim() || !city.trim()) {
      Alert.alert('Missing Fields', 'Please fill out all the fields before continuing.');
      return;
    }

    if (!user) {
      Alert.alert('Error', 'No authenticated user found.');
      return;
    }

    setLoading(true);
    
    // 1. Update user metadata (so AuthContext knows the profile is complete)
    const { error: metaError } = await supabase.auth.updateUser({
      data: {
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        school: finalSchool.trim(),
        grade: grade,
        age: parseInt(age.trim(), 10) || age.trim(),
        city: city.trim(),
        profile_completed: true,
      }
    });

    if (metaError) {
      setLoading(false);
      Alert.alert('Error updating metadata', metaError.message);
      return;
    }

    // 2. Update the public profiles table
    const { error: profileError } = await supabase
      .from('profiles')
      .update({
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        school: finalSchool.trim(),
        grade: grade,
        city: city.trim(),
        profile_completed: true,
        updated_at: new Date().toISOString()
      })
      .eq('id', user.id);

    setLoading(false);

    if (profileError) {
      Alert.alert('Error updating profile', profileError.message);
    } else {
      router.replace('/(tabs)');
    }
  }

  return (
    <KeyboardAvoidingView 
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.header}>
          <Text style={styles.title}>Complete Your Profile</Text>
          <Text style={styles.subtitle}>
            Tell us a bit about yourself so we can personalize your Mentora experience.
          </Text>
        </View>

        <View style={styles.form}>
          {/* Name Fields */}
          <View style={styles.row}>
            <View style={[styles.inputContainer, { flex: 1, marginRight: spacing.md }]}>
              <Text style={styles.label}>First Name</Text>
              <TextInput
                style={styles.input}
                value={firstName}
                onChangeText={setFirstName}
                placeholder="First Name"
                placeholderTextColor={colors.textSecondary}
              />
            </View>

            <View style={[styles.inputContainer, { flex: 1 }]}>
              <Text style={styles.label}>Last Name</Text>
              <TextInput
                style={styles.input}
                value={lastName}
                onChangeText={setLastName}
                placeholder="Last Name"
                placeholderTextColor={colors.textSecondary}
              />
            </View>
          </View>

          {/* School Selection */}
          <View style={styles.inputContainer}>
            <Text style={styles.label}>School Name</Text>
            <Pressable 
              style={styles.dropdownButton} 
              onPress={() => setSchoolDropdownVisible(true)}
            >
              <Text style={[styles.dropdownButtonText, !selectedSchoolOption && { color: colors.textSecondary }]}>
                {selectedSchoolOption || "Select your school"}
              </Text>
              <Feather name="search" size={20} color={colors.textSecondary} />
            </Pressable>
          </View>

          {/* Custom School Input (only shows if "Other" is selected) */}
          {selectedSchoolOption === 'Other' && (
            <View style={styles.inputContainer}>
              <Text style={styles.label}>Enter Your School Name</Text>
              <TextInput
                style={styles.input}
                value={customSchool}
                onChangeText={setCustomSchool}
                placeholder="e.g. My Custom High School"
                placeholderTextColor={colors.textSecondary}
              />
            </View>
          )}

          {/* Grade Selection */}
          <View style={styles.inputContainer}>
            <Text style={styles.label}>Form / Grade</Text>
            <Pressable 
              style={styles.dropdownButton} 
              onPress={() => setGradeDropdownVisible(true)}
            >
              <Text style={[styles.dropdownButtonText, !grade && { color: colors.textSecondary }]}>
                {grade || "Select your form/grade"}
              </Text>
              <Feather name="chevron-down" size={20} color={colors.textSecondary} />
            </Pressable>
          </View>

          <View style={styles.row}>
            <View style={[styles.inputContainer, { flex: 1, marginRight: spacing.md }]}>
              <Text style={styles.label}>Age</Text>
              <TextInput
                style={styles.input}
                value={age}
                onChangeText={setAge}
                placeholder="e.g. 15"
                placeholderTextColor={colors.textSecondary}
                keyboardType="numeric"
                maxLength={2}
              />
            </View>

            <View style={[styles.inputContainer, { flex: 2 }]}>
              <Text style={styles.label}>City</Text>
              <TextInput
                style={styles.input}
                value={city}
                onChangeText={setCity}
                placeholder="e.g. Harare"
                placeholderTextColor={colors.textSecondary}
              />
            </View>
          </View>

          <Pressable 
            style={[styles.primaryButton, loading && styles.buttonDisabled]}
            onPress={handleSubmit}
            disabled={loading}
          >
            <Text style={styles.primaryButtonText}>
              {loading ? 'Saving...' : 'Finish Setup'}
            </Text>
          </Pressable>
        </View>
      </ScrollView>

      {/* School Selection Modal (Searchable) */}
      <Modal
        visible={isSchoolDropdownVisible}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setSchoolDropdownVisible(false)}
      >
        <KeyboardAvoidingView 
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={[styles.modalContent, { maxHeight: '85%' }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Search School</Text>
              <Pressable onPress={() => {
                setSchoolDropdownVisible(false);
                setSchoolSearchQuery('');
              }}>
                <Feather name="x" size={24} color={colors.text} />
              </Pressable>
            </View>
            
            <View style={styles.searchContainer}>
              <Feather name="search" size={20} color={colors.textSecondary} style={styles.searchIcon} />
              <TextInput
                style={styles.searchInput}
                value={schoolSearchQuery}
                onChangeText={setSchoolSearchQuery}
                placeholder="Search for your school..."
                placeholderTextColor={colors.textSecondary}
                autoFocus={true}
              />
            </View>

            <ScrollView style={styles.modalList} keyboardShouldPersistTaps="handled">
              {filteredSchools.map((option) => (
                <Pressable 
                  key={option} 
                  style={[
                    styles.modalOption,
                    selectedSchoolOption === option && styles.modalOptionSelected
                  ]}
                  onPress={() => {
                    setSelectedSchoolOption(option);
                    setSchoolDropdownVisible(false);
                    setSchoolSearchQuery('');
                  }}
                >
                  <Text style={[
                    styles.modalOptionText,
                    selectedSchoolOption === option && styles.modalOptionTextSelected
                  ]}>
                    {option}
                  </Text>
                  {selectedSchoolOption === option && (
                    <Feather name="check" size={20} color={colors.primary} />
                  )}
                </Pressable>
              ))}
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Grade Selection Modal */}
      <Modal
        visible={isGradeDropdownVisible}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setGradeDropdownVisible(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setGradeDropdownVisible(false)}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select Form / Grade</Text>
              <Pressable onPress={() => setGradeDropdownVisible(false)}>
                <Feather name="x" size={24} color={colors.text} />
              </Pressable>
            </View>
            <ScrollView style={styles.modalList}>
              {FORM_OPTIONS.map((option) => (
                <Pressable 
                  key={option} 
                  style={[
                    styles.modalOption,
                    grade === option && styles.modalOptionSelected
                  ]}
                  onPress={() => {
                    setGrade(option);
                    setGradeDropdownVisible(false);
                  }}
                >
                  <Text style={[
                    styles.modalOptionText,
                    grade === option && styles.modalOptionTextSelected
                  ]}>
                    {option}
                  </Text>
                  {grade === option && (
                    <Feather name="check" size={20} color={colors.primary} />
                  )}
                </Pressable>
              ))}
            </ScrollView>
          </View>
        </Pressable>
      </Modal>

    </KeyboardAvoidingView>
  );
}

const createStyles = (colors: any) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollContent: {
    flexGrow: 1,
    padding: spacing.xl,
    justifyContent: 'center',
  },
  header: {
    marginTop: spacing.xxl,
    marginBottom: spacing.xxl,
  },
  title: {
    fontSize: typography.sizes.xxl,
    fontWeight: typography.weights.bold,
    color: colors.text,
    marginBottom: spacing.sm,
  },
  subtitle: {
    fontSize: typography.sizes.md,
    color: colors.textSecondary,
    lineHeight: 22,
  },
  form: {
    flex: 1,
  },
  inputContainer: {
    marginBottom: spacing.lg,
  },
  row: {
    flexDirection: 'row',
  },
  label: {
    fontSize: typography.sizes.sm,
    fontWeight: typography.weights.medium,
    color: colors.text,
    marginBottom: spacing.xs,
  },
  input: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    fontSize: typography.sizes.md,
    color: colors.text,
  },
  dropdownButton: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.md,
    padding: spacing.md,
  },
  dropdownButtonText: {
    fontSize: typography.sizes.md,
    color: colors.text,
  },
  primaryButton: {
    backgroundColor: colors.primary,
    paddingVertical: spacing.lg,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    marginTop: spacing.md,
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  primaryButtonText: {
    color: colors.background,
    fontSize: typography.sizes.md,
    fontWeight: typography.weights.semibold,
  },
  
  // Modal Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: colors.background,
    borderTopLeftRadius: borderRadius.xl,
    borderTopRightRadius: borderRadius.xl,
    maxHeight: '70%',
    paddingBottom: spacing.xxl,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: spacing.xl,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  modalTitle: {
    fontSize: typography.sizes.lg,
    fontWeight: typography.weights.semibold,
    color: colors.text,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    marginHorizontal: spacing.xl,
    marginBottom: spacing.md,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  searchIcon: {
    marginRight: spacing.sm,
  },
  searchInput: {
    flex: 1,
    paddingVertical: spacing.md,
    fontSize: typography.sizes.md,
    color: colors.text,
  },
  modalList: {
    paddingHorizontal: spacing.md,
  },
  modalOption: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.md,
  },
  modalOptionSelected: {
    backgroundColor: colors.surface,
  },
  modalOptionText: {
    fontSize: typography.sizes.md,
    color: colors.text,
  },
  modalOptionTextSelected: {
    fontWeight: typography.weights.semibold,
    color: colors.primary,
  },
});
