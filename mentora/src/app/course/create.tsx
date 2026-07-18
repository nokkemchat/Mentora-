import React, { useState, useMemo } from 'react';
import { View, Text, StyleSheet, TextInput, Pressable, Alert, ScrollView, KeyboardAvoidingView, Platform, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { spacing, typography, borderRadius, useThemeColors } from '@/constants/theme';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';

// Simple predefined list of icons to choose from
const AVAILABLE_ICONS = [
  'calculator-variant', 'flask', 'book-open-page-variant', 
  'laptop', 'earth', 'music', 'artstation', 'briefcase'
];

const AVAILABLE_COLORS = [
  '#3B82F6', // Blue
  '#EF4444', // Red
  '#10B981', // Green
  '#F59E0B', // Orange
  '#8B5CF6', // Purple
  '#EC4899', // Pink
];

export default function CreateCourseScreen() {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const router = useRouter();
  const { user } = useAuth();

  const [title, setTitle] = useState('');
  const [board, setBoard] = useState('ZIMSEC');
  const [level, setLevel] = useState('O Level');
  const [selectedIcon, setSelectedIcon] = useState(AVAILABLE_ICONS[0]);
  const [selectedColor, setSelectedColor] = useState(AVAILABLE_COLORS[0]);

  const [loading, setLoading] = useState(false);

  const generateCourseId = (title: string, board: string, level: string) => {
    const raw = `${board}-${level}-${title}`.toLowerCase();
    return raw.replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '');
  };

  async function handleCreateCourse() {
    if (!title.trim() || !board.trim() || !level.trim()) {
      Alert.alert('Missing Fields', 'Please fill out all fields.');
      return;
    }
    if (!user) {
      Alert.alert('Error', 'Not authenticated.');
      return;
    }

    setLoading(true);
    
    // Generate an ID like "zimsec-o-level-math"
    const courseId = generateCourseId(title, board, level);

    // 1. Insert into courses table
    const { error: courseError } = await supabase
      .from('courses')
      .insert({
        id: courseId,
        title: title.trim(),
        board: board.trim(),
        level: level.trim(),
        icon: selectedIcon,
        color: selectedColor
      });

    if (courseError) {
      setLoading(false);
      // If it already exists, that's fine, we might just try adding the teacher link
      // But usually it's an error we want to catch
      if (courseError.code !== '23505') { // 23505 is unique violation
        Alert.alert('Error creating course', courseError.message);
        return;
      }
    }

    // 2. Insert into teacher_courses linking table
    const { error: linkError } = await supabase
      .from('teacher_courses')
      .insert({
        teacher_id: user.id,
        course_id: courseId
      });

    setLoading(false);

    if (linkError) {
      // If the link already exists, it's fine
      if (linkError.code !== '23505') {
        Alert.alert('Error linking course', linkError.message);
        return;
      }
    }

    // Success! Navigate to the course manager
    router.replace(`/course/manage/${courseId}`);
  }

  return (
    <KeyboardAvoidingView 
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <Feather name="arrow-left" size={24} color={colors.text} />
        </Pressable>
        <Text style={styles.headerTitle}>Create New Course</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        
        {/* Title */}
        <View style={styles.inputGroup}>
          <Text style={styles.label}>Course Title</Text>
          <TextInput
            style={styles.input}
            value={title}
            onChangeText={setTitle}
            placeholder="e.g. Mathematics, Biology"
            placeholderTextColor={colors.textSecondary}
          />
        </View>

        <View style={styles.row}>
          {/* Board */}
          <View style={[styles.inputGroup, { flex: 1, marginRight: spacing.md }]}>
            <Text style={styles.label}>Exam Board</Text>
            <TextInput
              style={styles.input}
              value={board}
              onChangeText={setBoard}
              placeholder="e.g. ZIMSEC, Cambridge"
              placeholderTextColor={colors.textSecondary}
            />
          </View>

          {/* Level */}
          <View style={[styles.inputGroup, { flex: 1 }]}>
            <Text style={styles.label}>Level</Text>
            <TextInput
              style={styles.input}
              value={level}
              onChangeText={setLevel}
              placeholder="e.g. O Level, A Level"
              placeholderTextColor={colors.textSecondary}
            />
          </View>
        </View>

        {/* Icon Selection */}
        <View style={styles.inputGroup}>
          <Text style={styles.label}>Course Icon</Text>
          <View style={styles.optionsContainer}>
            {AVAILABLE_ICONS.map((iconName) => (
              <Pressable
                key={iconName}
                style={[
                  styles.optionBox,
                  selectedIcon === iconName && { borderColor: colors.primary, backgroundColor: colors.primaryLight }
                ]}
                onPress={() => setSelectedIcon(iconName)}
              >
                <MaterialCommunityIcons 
                  name={iconName as any} 
                  size={32} 
                  color={selectedIcon === iconName ? colors.primary : colors.textSecondary} 
                />
              </Pressable>
            ))}
          </View>
        </View>

        {/* Color Selection */}
        <View style={styles.inputGroup}>
          <Text style={styles.label}>Course Color</Text>
          <View style={styles.optionsContainer}>
            {AVAILABLE_COLORS.map((hexCode) => (
              <Pressable
                key={hexCode}
                style={[
                  styles.colorBox,
                  { backgroundColor: hexCode },
                  selectedColor === hexCode && styles.colorBoxSelected
                ]}
                onPress={() => setSelectedColor(hexCode)}
              >
                {selectedColor === hexCode && <Feather name="check" size={20} color="#fff" />}
              </Pressable>
            ))}
          </View>
        </View>

      </ScrollView>

      <View style={styles.footer}>
        <Pressable 
          style={[styles.primaryButton, loading && styles.buttonDisabled]}
          onPress={handleCreateCourse}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color={colors.background} />
          ) : (
            <Text style={styles.primaryButtonText}>Create Course</Text>
          )}
        </Pressable>
      </View>

    </KeyboardAvoidingView>
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
    paddingTop: spacing.xxxl,
    paddingBottom: spacing.lg,
    paddingHorizontal: spacing.xl,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.surface,
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'flex-start',
  },
  headerTitle: {
    fontSize: typography.sizes.lg,
    fontWeight: typography.weights.bold,
    color: colors.text,
  },
  scrollContent: {
    padding: spacing.xl,
    paddingBottom: spacing.xxxl,
  },
  inputGroup: {
    marginBottom: spacing.xl,
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
  optionsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
    marginTop: spacing.xs,
  },
  optionBox: {
    width: 60,
    height: 60,
    borderRadius: borderRadius.md,
    borderWidth: 2,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  colorBox: {
    width: 50,
    height: 50,
    borderRadius: 25,
    borderWidth: 2,
    borderColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  colorBoxSelected: {
    borderColor: colors.text,
    transform: [{ scale: 1.1 }],
  },
  footer: {
    padding: spacing.xl,
    paddingBottom: spacing.xxxl,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  primaryButton: {
    backgroundColor: colors.primary,
    paddingVertical: spacing.lg,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  primaryButtonText: {
    color: colors.background,
    fontSize: typography.sizes.md,
    fontWeight: typography.weights.semibold,
  },
});
