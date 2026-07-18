import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, TextInput, ActivityIndicator, Alert, Switch } from 'react-native';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { spacing, typography, borderRadius, useThemeColors } from '@/constants/theme';
import { Feather } from '@expo/vector-icons';
import * as Crypto from 'expo-crypto';

export default function QuizEditorScreen() {
  const colors = useThemeColors();
  const styles = createStyles(colors);
  
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuth();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [questions, setQuestions] = useState<any[]>([]);

  // AI Generation State
  const [hasPdf, setHasPdf] = useState(false);
  const [pdfUrl, setPdfUrl] = useState('');
  const [generatingAI, setGeneratingAI] = useState(false);

  // New Question Form State
  const [isAdding, setIsAdding] = useState(false);
  const [newQuestion, setNewQuestion] = useState('');
  const [newExplanation, setNewExplanation] = useState('');
  const [options, setOptions] = useState([
    { text: '', is_correct: true },
    { text: '', is_correct: false },
    { text: '', is_correct: false },
    { text: '', is_correct: false },
  ]);

  const fetchQuestions = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('questions')
      .select('*, options(*)')
      .eq('subtopic_id', id)
      .order('created_at', { ascending: true });

    if (!error && data) {
      setQuestions(data);
    }
    setLoading(false);
  };

  useFocusEffect(
    useCallback(() => {
      fetchQuestions();
      fetchMaterials();
    }, [id])
  );

  const fetchMaterials = async () => {
    const { data, error } = await supabase
      .from('subtopic_materials')
      .select('*')
      .eq('subtopic_id', id)
      .eq('type', 'notes_pdf')
      .limit(1);
    
    if (!error && data && data.length > 0) {
      setHasPdf(true);
      setPdfUrl(data[0].content_url);
    }
  };

  const handleAIGenerate = async () => {
    if (!pdfUrl) return;
    try {
      setGeneratingAI(true);
      const { data, error } = await supabase.functions.invoke('generate-quiz', {
        body: { subtopic_id: id, file_url: pdfUrl }
      });
      if (error) throw error;
      Alert.alert('AI Magic Complete ✨', data.message || 'Questions generated successfully!');
      fetchQuestions(); // Refresh the list
    } catch (error: any) {
      console.error(error);
      Alert.alert('AI Generation Failed', error.message || 'Could not generate questions.');
    } finally {
      setGeneratingAI(false);
    }
  };

  const handleSaveQuestion = async () => {
    if (!newQuestion.trim()) {
      Alert.alert('Error', 'Question text is required.');
      return;
    }

    const validOptions = options.filter(o => o.text.trim() !== '');
    if (validOptions.length < 2) {
      Alert.alert('Error', 'Please provide at least 2 options.');
      return;
    }

    const hasCorrect = validOptions.some(o => o.is_correct);
    if (!hasCorrect) {
      Alert.alert('Error', 'At least one option must be marked as correct.');
      return;
    }

    try {
      setSaving(true);
      const questionId = Crypto.randomUUID();

      // 1. Insert Question
      const { error: qError } = await supabase.from('questions').insert({
        id: questionId,
        subtopic_id: id,
        text: newQuestion,
        explanation: newExplanation
      });

      if (qError) throw qError;

      // 2. Insert Options
      const optionsToInsert = validOptions.map(opt => ({
        id: Crypto.randomUUID(),
        question_id: questionId,
        text: opt.text,
        is_correct: opt.is_correct
      }));

      const { error: oError } = await supabase.from('options').insert(optionsToInsert);

      if (oError) throw oError;

      Alert.alert('Success', 'Question added successfully!');
      
      // Reset form
      setNewQuestion('');
      setNewExplanation('');
      setOptions([
        { text: '', is_correct: true },
        { text: '', is_correct: false },
        { text: '', is_correct: false },
        { text: '', is_correct: false },
      ]);
      setIsAdding(false);

      fetchQuestions();

    } catch (error: any) {
      console.error(error);
      Alert.alert('Failed to save question', error.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteQuestion = async (questionId: string) => {
    Alert.alert('Delete Question', 'Are you sure you want to delete this question?', [
      { text: 'Cancel', style: 'cancel' },
      { 
        text: 'Delete', 
        style: 'destructive',
        onPress: async () => {
          try {
            await supabase.from('questions').delete().eq('id', questionId);
            fetchQuestions();
          } catch (error: any) {
            Alert.alert('Error', error.message);
          }
        }
      }
    ]);
  };

  const setCorrectOption = (index: number) => {
    const newOptions = options.map((opt, i) => ({
      ...opt,
      is_correct: i === index
    }));
    setOptions(newOptions);
  };

  const updateOptionText = (text: string, index: number) => {
    const newOptions = [...options];
    newOptions[index].text = text;
    setOptions(newOptions);
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <Feather name="arrow-left" size={24} color={colors.text} />
        </Pressable>
        <Text style={styles.headerTitle}>Quiz Editor</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView style={styles.content}>
        
        {/* Existing Questions */}
        <View style={styles.section}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md }}>
            <Text style={styles.sectionTitle}>Existing Questions ({questions.length})</Text>
            {hasPdf && (
              <Pressable 
                style={[styles.aiButton, generatingAI && { opacity: 0.7 }]} 
                onPress={handleAIGenerate}
                disabled={generatingAI}
              >
                {generatingAI ? (
                  <ActivityIndicator size="small" color="#FFF" />
                ) : (
                  <>
                    <Feather name="zap" size={16} color="#FFF" />
                    <Text style={styles.aiButtonText}>Auto-Generate with AI</Text>
                  </>
                )}
              </Pressable>
            )}
          </View>
          
          {questions.length === 0 && !isAdding && (
            <Text style={styles.emptyText}>No questions added yet. Start adding some!</Text>
          )}

          {questions.map((q, index) => (
            <View key={q.id} style={styles.questionCard}>
              <View style={styles.qHeader}>
                <Text style={styles.qNumber}>Q{index + 1}</Text>
                <Pressable onPress={() => handleDeleteQuestion(q.id)}>
                  <Feather name="trash-2" size={18} color={colors.error} />
                </Pressable>
              </View>
              <Text style={styles.qText}>{q.text}</Text>
              
              <View style={styles.optionsList}>
                {q.options?.map((opt: any) => (
                  <View key={opt.id} style={styles.optRow}>
                    <Feather 
                      name={opt.is_correct ? "check-circle" : "circle"} 
                      size={16} 
                      color={opt.is_correct ? colors.success : colors.textTertiary} 
                    />
                    <Text style={[styles.optText, opt.is_correct && { fontWeight: 'bold', color: colors.success }]}>
                      {opt.text}
                    </Text>
                  </View>
                ))}
              </View>
            </View>
          ))}
        </View>

        {/* Add Question Form */}
        {isAdding ? (
          <View style={styles.formCard}>
            <Text style={styles.formTitle}>New Question</Text>
            
            <Text style={styles.label}>Question Text</Text>
            <TextInput
              style={[styles.input, { minHeight: 80 }]}
              multiline
              placeholder="What is..."
              placeholderTextColor={colors.textTertiary}
              value={newQuestion}
              onChangeText={setNewQuestion}
            />

            <Text style={styles.label}>Explanation (Optional)</Text>
            <TextInput
              style={[styles.input, { minHeight: 60 }]}
              multiline
              placeholder="Explain why the answer is correct..."
              placeholderTextColor={colors.textTertiary}
              value={newExplanation}
              onChangeText={setNewExplanation}
            />

            <Text style={styles.label}>Options</Text>
            {options.map((opt, index) => (
              <View key={index} style={styles.optionInputRow}>
                <Pressable onPress={() => setCorrectOption(index)} style={styles.radio}>
                  <Feather 
                    name={opt.is_correct ? "check-circle" : "circle"} 
                    size={24} 
                    color={opt.is_correct ? colors.success : colors.textTertiary} 
                  />
                </Pressable>
                <TextInput
                  style={[styles.input, { flex: 1, marginBottom: 0 }]}
                  placeholder={`Option ${index + 1}`}
                  placeholderTextColor={colors.textTertiary}
                  value={opt.text}
                  onChangeText={(text) => updateOptionText(text, index)}
                />
              </View>
            ))}

            <View style={styles.formActions}>
              <Pressable 
                style={[styles.btn, styles.btnSecondary]} 
                onPress={() => setIsAdding(false)}
                disabled={saving}
              >
                <Text style={styles.btnSecondaryText}>Cancel</Text>
              </Pressable>
              
              <Pressable 
                style={[styles.btn, styles.btnPrimary]} 
                onPress={handleSaveQuestion}
                disabled={saving}
              >
                {saving ? (
                  <ActivityIndicator size="small" color="#FFF" />
                ) : (
                  <Text style={styles.btnPrimaryText}>Save Question</Text>
                )}
              </Pressable>
            </View>
          </View>
        ) : (
          <Pressable style={styles.addButton} onPress={() => setIsAdding(true)}>
            <Feather name="plus" size={20} color="#FFF" />
            <Text style={styles.addButtonText}>Add New Question</Text>
          </Pressable>
        )}

        <View style={{ height: 100 }} />
      </ScrollView>
    </View>
  );
}

const createStyles = (colors: any) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.lg,
    paddingTop: spacing.xxxl,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  backButton: {
    padding: spacing.xs,
  },
  headerTitle: {
    fontSize: typography.sizes.lg,
    fontWeight: typography.weights.bold,
    color: colors.text,
  },
  content: {
    padding: spacing.lg,
  },
  section: {
    marginBottom: spacing.xl,
  },
  sectionTitle: {
    fontSize: typography.sizes.lg,
    fontWeight: typography.weights.bold,
    color: colors.text,
  },
  aiButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#8B5CF6', // Purple for AI
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.md,
    gap: spacing.xs,
  },
  aiButtonText: {
    color: '#FFF',
    fontSize: typography.sizes.sm,
    fontWeight: typography.weights.bold,
  },
  emptyText: {
    color: colors.textSecondary,
    fontStyle: 'italic',
  },
  questionCard: {
    backgroundColor: colors.surface,
    padding: spacing.lg,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.md,
  },
  qHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  qNumber: {
    fontWeight: typography.weights.bold,
    color: colors.primary,
  },
  qText: {
    fontSize: typography.sizes.md,
    color: colors.text,
    marginBottom: spacing.md,
    fontWeight: typography.weights.medium,
  },
  optionsList: {
    gap: spacing.sm,
  },
  optRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  optText: {
    fontSize: typography.sizes.sm,
    color: colors.textSecondary,
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
    padding: spacing.md,
    borderRadius: borderRadius.lg,
    gap: spacing.sm,
  },
  addButtonText: {
    color: '#FFF',
    fontWeight: typography.weights.bold,
    fontSize: typography.sizes.md,
  },
  formCard: {
    backgroundColor: colors.surface,
    padding: spacing.lg,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  formTitle: {
    fontSize: typography.sizes.md,
    fontWeight: typography.weights.bold,
    marginBottom: spacing.lg,
  },
  label: {
    fontSize: typography.sizes.sm,
    fontWeight: typography.weights.semibold,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
    marginTop: spacing.md,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    color: colors.text,
    backgroundColor: colors.background,
    marginBottom: spacing.md,
  },
  optionInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.sm,
    gap: spacing.md,
  },
  radio: {
    padding: spacing.xs,
  },
  formActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing.md,
    marginTop: spacing.xl,
  },
  btn: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    borderRadius: borderRadius.md,
  },
  btnSecondary: {
    backgroundColor: colors.surfaceHighlight,
  },
  btnSecondaryText: {
    color: colors.textSecondary,
    fontWeight: typography.weights.bold,
  },
  btnPrimary: {
    backgroundColor: colors.primary,
    minWidth: 120,
    alignItems: 'center',
  },
  btnPrimaryText: {
    color: '#FFF',
    fontWeight: typography.weights.bold,
  },
});
