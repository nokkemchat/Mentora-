import React, { useState, useMemo, useEffect } from 'react';
import { View, Text, StyleSheet, TextInput, Pressable, Alert, Modal, ScrollView, KeyboardAvoidingView, Platform, Image } from 'react-native';
import { useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { spacing, typography, borderRadius, useThemeColors } from '@/constants/theme';
import { Feather } from '@expo/vector-icons';
import { useAuth } from '@/context/AuthContext';
import { ZIMBABWE_SCHOOLS } from '@/data/schools';
import * as ImagePicker from 'expo-image-picker';
import { decode } from 'base64-arraybuffer';

export default function CompleteTeacherProfileScreen() {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const router = useRouter();
  const { user } = useAuth();
  
  // Avatar state
  const [avatarUri, setAvatarUri] = useState<string | null>(null);
  const [avatarBase64, setAvatarBase64] = useState<string | null>(null);

  // Name state
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');

  // School state
  const [selectedSchoolOption, setSelectedSchoolOption] = useState('');
  const [customSchool, setCustomSchool] = useState('');
  const [isSchoolDropdownVisible, setSchoolDropdownVisible] = useState(false);
  const [schoolSearchQuery, setSchoolSearchQuery] = useState('');

  // Teacher specific state
  const [yearsExperience, setYearsExperience] = useState('');
  const [bio, setBio] = useState('');

  // Course specific state
  const [selectedBoard, setSelectedBoard] = useState('');
  const [availableCourses, setAvailableCourses] = useState<any[]>([]);
  const [selectedCourseIds, setSelectedCourseIds] = useState<string[]>([]);
  const [isCourseDropdownVisible, setCourseDropdownVisible] = useState(false);
  const [courseSearchQuery, setCourseSearchQuery] = useState('');

  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const fetchCourses = async () => {
      const { data } = await supabase.from('courses').select('*');
      if (data) setAvailableCourses(data);
    };
    fetchCourses();
  }, []);

  // When board changes, clear selected courses
  useEffect(() => {
    setSelectedCourseIds([]);
  }, [selectedBoard]);

  const filteredSchools = useMemo(() => {
    let filtered = ZIMBABWE_SCHOOLS.filter(s => 
      s.toLowerCase().includes(schoolSearchQuery.toLowerCase())
    );
    if (!filtered.includes('Other')) {
      filtered.push('Other');
    }
    filtered = filtered.filter(s => s !== 'Other');
    filtered.push('Other');
    return filtered;
  }, [schoolSearchQuery]);

  const filteredCourses = useMemo(() => {
    return availableCourses.filter(c => 
      c.board === selectedBoard &&
      (c.title.toLowerCase().includes(courseSearchQuery.toLowerCase()) || 
      (c.syllabus_code && c.syllabus_code.toLowerCase().includes(courseSearchQuery.toLowerCase())))
    );
  }, [courseSearchQuery, availableCourses, selectedBoard]);

  const toggleCourseSelection = (courseId: string) => {
    setSelectedCourseIds(prev => 
      prev.includes(courseId) 
        ? prev.filter(id => id !== courseId)
        : [...prev, courseId]
    );
  };

  const pickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.5,
      base64: true,
    });

    if (!result.canceled && result.assets[0].base64) {
      setAvatarUri(result.assets[0].uri);
      setAvatarBase64(result.assets[0].base64);
    }
  };

  async function handleSubmit() {
    const finalSchool = selectedSchoolOption === 'Other' ? customSchool : selectedSchoolOption;

    if (!avatarUri) {
      Alert.alert('Profile Picture Required', 'Please upload a professional profile picture so students can recognize you.');
      return;
    }

    if (!firstName.trim() || !lastName.trim() || !finalSchool.trim() || selectedCourseIds.length === 0 || !yearsExperience.trim()) {
      Alert.alert('Missing Fields', 'Please fill out all required fields (Bio is optional) before continuing.');
      return;
    }

    if (!user) {
      Alert.alert('Error', 'No authenticated user found.');
      return;
    }

    setLoading(true);
    
    // 0. Upload Avatar
    let uploadedAvatarUrl = null;
    if (avatarBase64) {
      const filePath = `${user.id}/${new Date().getTime()}.jpg`;
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(filePath, decode(avatarBase64), { contentType: 'image/jpeg' });
        
      if (uploadData && !uploadError) {
        const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(filePath);
        uploadedAvatarUrl = publicUrl;
      }
    }

    // Map selected IDs to titles for the legacy subjects_taught field (or we could save the IDs)
    const selectedCourseTitles = availableCourses
      .filter(c => selectedCourseIds.includes(c.id))
      .map(c => c.title);

    // 1. Update user metadata
    const { error: metaError } = await supabase.auth.updateUser({
      data: {
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        school: finalSchool.trim(),
        profile_completed: true,
        avatar_url: uploadedAvatarUrl,
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
        subjects_taught: selectedCourseTitles,
        years_of_experience: parseInt(yearsExperience.trim(), 10) || 0,
        bio: bio.trim(),
        avatar_url: uploadedAvatarUrl,
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
          <Text style={styles.title}>Teacher Setup</Text>
          <Text style={styles.subtitle}>
            Tell us about your teaching experience to set up your educator profile.
          </Text>
        </View>

        <View style={styles.form}>
          {/* Avatar Upload */}
          <View style={styles.avatarContainer}>
            <Pressable onPress={pickImage} style={[styles.avatarButton, avatarUri ? { backgroundColor: 'transparent', borderWidth: 0 } : {}]}>
              {avatarUri ? (
                <Image source={{ uri: avatarUri }} style={styles.avatarImage} />
              ) : (
                <>
                  <Feather name="camera" size={32} color={colors.primary} />
                  <Text style={styles.avatarText}>Add Photo</Text>
                </>
              )}
            </Pressable>
            {avatarUri && (
              <Pressable style={styles.editAvatarIcon} onPress={pickImage}>
                <Feather name="edit-2" size={16} color="white" />
              </Pressable>
            )}
          </View>

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
            <Text style={styles.label}>School / Institution</Text>
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

          {/* Custom School Input */}
          {selectedSchoolOption === 'Other' && (
            <View style={styles.inputContainer}>
              <Text style={styles.label}>Enter Your School Name</Text>
              <TextInput
                style={styles.input}
                value={customSchool}
                onChangeText={setCustomSchool}
                placeholder="e.g. Harare High School"
                placeholderTextColor={colors.textSecondary}
              />
            </View>
          )}

          {/* Board Selection */}
          <View style={styles.inputContainer}>
            <Text style={styles.label}>Exam Board</Text>
            <View style={{ flexDirection: 'row', gap: spacing.md }}>
              <Pressable
                style={[
                  styles.boardButton,
                  selectedBoard === 'ZIMSEC' && { borderColor: colors.primary, backgroundColor: colors.primary + '10' }
                ]}
                onPress={() => setSelectedBoard('ZIMSEC')}
              >
                <Text style={[
                  styles.boardButtonText,
                  selectedBoard === 'ZIMSEC' && { color: colors.primary, fontWeight: '600' }
                ]}>ZIMSEC</Text>
              </Pressable>
              
              <Pressable
                style={[
                  styles.boardButton,
                  selectedBoard === 'Cambridge' && { borderColor: colors.primary, backgroundColor: colors.primary + '10' }
                ]}
                onPress={() => setSelectedBoard('Cambridge')}
              >
                <Text style={[
                  styles.boardButtonText,
                  selectedBoard === 'Cambridge' && { color: colors.primary, fontWeight: '600' }
                ]}>Cambridge</Text>
              </Pressable>
            </View>
          </View>

          {/* Course Selection */}
          <View style={styles.inputContainer}>
            <Text style={styles.label}>Courses You Teach</Text>
            <Pressable 
              style={[styles.dropdownButton, !selectedBoard && { opacity: 0.5 }]} 
              onPress={() => {
                if (!selectedBoard) {
                  Alert.alert('Select a Board', 'Please select an Exam Board first to see available courses.');
                  return;
                }
                setCourseDropdownVisible(true);
              }}
            >
              <Text style={[styles.dropdownButtonText, (!selectedBoard || selectedCourseIds.length === 0) && { color: colors.textSecondary }]} numberOfLines={1}>
                {!selectedBoard 
                  ? "Select a board first..."
                  : selectedCourseIds.length > 0 
                    ? `${selectedCourseIds.length} course(s) selected` 
                    : "Select from marketplace courses"}
              </Text>
              <Feather name="book-open" size={20} color={colors.textSecondary} />
            </Pressable>
            {selectedCourseIds.length > 0 && (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 8, gap: 8 }}>
                {availableCourses.filter(c => selectedCourseIds.includes(c.id)).map(course => (
                  <View key={course.id} style={{ backgroundColor: colors.primary + '20', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16 }}>
                    <Text style={{ color: colors.primary, fontSize: 12, fontWeight: '500' }}>{course.title}</Text>
                  </View>
                ))}
              </View>
            )}
          </View>

          {/* Experience */}
          <View style={styles.inputContainer}>
            <Text style={styles.label}>Years of Experience</Text>
            <TextInput
              style={styles.input}
              value={yearsExperience}
              onChangeText={setYearsExperience}
              placeholder="e.g. 5"
              placeholderTextColor={colors.textSecondary}
              keyboardType="numeric"
              maxLength={2}
            />
          </View>

          {/* Bio */}
          <View style={styles.inputContainer}>
            <Text style={styles.label}>Short Bio (Optional)</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              value={bio}
              onChangeText={setBio}
              placeholder="Tell students a bit about your teaching style..."
              placeholderTextColor={colors.textSecondary}
              multiline
              numberOfLines={4}
              textAlignVertical="top"
            />
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

      {/* Course Selection Modal */}
      <Modal
        visible={isCourseDropdownVisible}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setCourseDropdownVisible(false)}
      >
        <KeyboardAvoidingView 
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={[styles.modalContent, { maxHeight: '85%' }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select Courses</Text>
              <Pressable onPress={() => {
                setCourseDropdownVisible(false);
                setCourseSearchQuery('');
              }}>
                <Text style={{ color: colors.primary, fontWeight: '600' }}>Done</Text>
              </Pressable>
            </View>
            
            <View style={styles.searchContainer}>
              <Feather name="search" size={20} color={colors.textSecondary} style={styles.searchIcon} />
              <TextInput
                style={styles.searchInput}
                value={courseSearchQuery}
                onChangeText={setCourseSearchQuery}
                placeholder="Search marketplace courses..."
                placeholderTextColor={colors.textSecondary}
                autoFocus={true}
              />
            </View>

            <ScrollView style={styles.modalList} keyboardShouldPersistTaps="handled">
              {filteredCourses.length === 0 ? (
                <Text style={{ textAlign: 'center', marginTop: 20, color: colors.textSecondary }}>No courses found.</Text>
              ) : (
                filteredCourses.map((course) => {
                  const isSelected = selectedCourseIds.includes(course.id);
                  return (
                    <Pressable 
                      key={course.id} 
                      style={[
                        styles.modalOption,
                        isSelected && styles.modalOptionSelected
                      ]}
                      onPress={() => toggleCourseSelection(course.id)}
                    >
                      <View>
                        <Text style={[
                          styles.modalOptionText,
                          isSelected && styles.modalOptionTextSelected
                        ]}>
                          {course.title} {course.syllabus_code ? `(${course.syllabus_code})` : ''}
                        </Text>
                        <Text style={{ fontSize: 12, color: colors.textSecondary, marginTop: 4 }}>
                          {course.board} • {course.level} • {course.subject_category || 'General'}
                        </Text>
                      </View>
                      {isSelected && (
                        <Feather name="check" size={20} color={colors.primary} />
                      )}
                    </Pressable>
                  );
                })
              )}
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
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
    marginTop: spacing.xxxl,
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
  boardButton: {
    flex: 1,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  boardButtonText: {
    fontSize: typography.sizes.md,
    color: colors.textSecondary,
  },
  textArea: {
    minHeight: 100,
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
    marginBottom: spacing.xxxl,
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  primaryButtonText: {
    color: colors.background,
    fontSize: typography.sizes.md,
    fontWeight: typography.weights.semibold,
  },
  
  // Avatar Styles
  avatarContainer: {
    alignItems: 'center',
    marginBottom: spacing.xl,
    position: 'relative',
  },
  avatarButton: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: colors.surface,
    borderWidth: 2,
    borderColor: colors.border,
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  avatarImage: {
    width: '100%',
    height: '100%',
    borderRadius: 60,
  },
  avatarText: {
    marginTop: spacing.sm,
    color: colors.primary,
    fontSize: typography.sizes.sm,
    fontWeight: typography.weights.medium,
  },
  editAvatarIcon: {
    position: 'absolute',
    bottom: 0,
    right: '35%',
    backgroundColor: colors.primary,
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: colors.background,
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
