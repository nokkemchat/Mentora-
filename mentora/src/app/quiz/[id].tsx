import React, { useState, useMemo, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, SafeAreaView, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { spacing, typography, borderRadius, useThemeColors } from '@/constants/theme';
import { Feather } from '@expo/vector-icons';
import Scratchpad from '@/components/Scratchpad';

export default function QuizScreen() {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  const [questions, setQuestions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedOptionId, setSelectedOptionId] = useState<string | null>(null);
  const [isAnswerChecked, setIsAnswerChecked] = useState(false);
  const [score, setScore] = useState(0);
  const [isFinished, setIsFinished] = useState(false);
  const [isScratchpadVisible, setIsScratchpadVisible] = useState(false);

  useEffect(() => {
    async function fetchQuestions() {
      if (!id) return;
      try {
        setLoading(true);
        const { data, error } = await supabase
          .from('questions')
          .select('*, options(*)')
          .eq('subtopic_id', id);

        if (error) throw error;
        setQuestions(data || []);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    fetchQuestions();
  }, [id]);

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (questions.length === 0) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>No questions found for this topic.</Text>
        <Pressable onPress={() => router.back()} style={styles.primaryButton}>
          <Text style={styles.primaryButtonText}>Go Back</Text>
        </Pressable>
      </View>
    );
  }

  const currentQuestion = questions[currentIndex];

  const handleSelectOption = (optionId: string) => {
    if (isAnswerChecked) return;
    setSelectedOptionId(optionId);
  };

  const handleCheckAnswer = () => {
    if (!selectedOptionId) return;
    
    setIsAnswerChecked(true);
    const isCorrect = currentQuestion.options.find((o: any) => o.id === selectedOptionId)?.is_correct;
    if (isCorrect) {
      setScore((prev) => prev + 1);
    }
  };

  const handleNext = () => {
    if (currentIndex < questions.length - 1) {
      setCurrentIndex((prev) => prev + 1);
      setSelectedOptionId(null);
      setIsAnswerChecked(false);
    } else {
      setIsFinished(true);
    }
  };

  if (isFinished) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.summaryContainer}>
          <Feather name="award" size={64} color={colors.warning} style={styles.awardIcon} />
          <Text style={styles.summaryTitle}>Quiz Completed!</Text>
          <Text style={styles.scoreText}>You scored {score} out of {questions.length}</Text>
          
          <View style={styles.actionButtons}>
            <Pressable 
              style={[styles.primaryButton, { flex: 1 }]} 
              onPress={() => router.back()}
            >
              <Text style={styles.primaryButtonText}>Back to Syllabus</Text>
            </Pressable>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.closeButton}>
          <Feather name="x" size={24} color={colors.text} />
        </Pressable>
        <View style={styles.progressTracker}>
          <View 
            style={[
              styles.progressFill, 
              { width: `${((currentIndex + 1) / questions.length) * 100}%` }
            ]} 
          />
        </View>
        <Text style={styles.progressText}>
          {currentIndex + 1} / {questions.length}
        </Text>
        <Pressable 
          onPress={() => setIsScratchpadVisible(true)} 
          style={styles.scratchpadButton}
        >
          <Feather name="edit-3" size={20} color={colors.primary} />
        </Pressable>
      </View>

      <ScrollView style={styles.contentContainer}>
        <Text style={styles.questionText}>{currentQuestion.text}</Text>

        <View style={styles.optionsContainer}>
          {currentQuestion.options.map((option: any) => {
            let optionStyle = styles.optionButton;
            let textStyle = styles.optionText;
            let icon = null;

            if (isAnswerChecked) {
              if (option.isCorrect) {
                optionStyle = [styles.optionButton, styles.optionCorrect];
                textStyle = [styles.optionText, styles.textCorrect];
                icon = <Feather name="check-circle" size={20} color={colors.success} />;
              } else if (selectedOptionId === option.id) {
                optionStyle = [styles.optionButton, styles.optionIncorrect];
                textStyle = [styles.optionText, styles.textIncorrect];
                icon = <Feather name="x-circle" size={20} color={colors.error} />;
              }
            } else if (selectedOptionId === option.id) {
              optionStyle = [styles.optionButton, styles.optionSelected];
            }

            return (
              <Pressable 
                key={option.id}
                style={optionStyle}
                onPress={() => handleSelectOption(option.id)}
              >
                <Text style={textStyle}>{option.text}</Text>
                {icon}
              </Pressable>
            );
          })}
        </View>

        {isAnswerChecked && (
          <View style={styles.explanationContainer}>
            <Text style={styles.explanationTitle}>Explanation</Text>
            <Text style={styles.explanationText}>{currentQuestion.explanation}</Text>
          </View>
        )}
      </ScrollView>

      <View style={styles.footer}>
        {!isAnswerChecked ? (
          <Pressable 
            style={[styles.primaryButton, !selectedOptionId && styles.buttonDisabled]} 
            onPress={handleCheckAnswer}
            disabled={!selectedOptionId}
          >
            <Text style={styles.primaryButtonText}>Check Answer</Text>
          </Pressable>
        ) : (
          <Pressable style={styles.primaryButton} onPress={handleNext}>
            <Text style={styles.primaryButtonText}>
              {currentIndex < questions.length - 1 ? 'Next Question' : 'Finish Quiz'}
            </Text>
          </Pressable>
        )}
      </View>

      <Scratchpad 
        isVisible={isScratchpadVisible} 
        onClose={() => setIsScratchpadVisible(false)} 
      />
    </SafeAreaView>
  );
}

const createStyles = (colors: any) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xl,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.xl,
    paddingTop: spacing.md,
    gap: spacing.md,
  },
  closeButton: {
    padding: spacing.xs,
  },
  scratchpadButton: {
    padding: spacing.xs,
    marginLeft: spacing.xs,
  },
  progressTracker: {
    flex: 1,
    height: 8,
    backgroundColor: colors.border,
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: colors.primary,
    borderRadius: 4,
  },
  progressText: {
    fontSize: typography.sizes.sm,
    fontWeight: typography.weights.bold,
    color: colors.textSecondary,
    width: 40,
    textAlign: 'right',
  },
  contentContainer: {
    flex: 1,
    padding: spacing.xl,
  },
  questionText: {
    fontSize: typography.sizes.xl,
    fontWeight: typography.weights.bold,
    color: colors.text,
    marginBottom: spacing.xxl,
    lineHeight: 32,
  },
  optionsContainer: {
    gap: spacing.md,
  },
  optionButton: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: spacing.lg,
    borderWidth: 2,
    borderColor: colors.border,
    borderRadius: borderRadius.lg,
    backgroundColor: colors.surface,
  },
  optionSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.primaryLight,
  },
  optionCorrect: {
    borderColor: colors.success,
    backgroundColor: '#E8F5E9',
  },
  optionIncorrect: {
    borderColor: colors.error,
    backgroundColor: '#FFEBEE',
  },
  optionText: {
    fontSize: typography.sizes.md,
    color: colors.text,
    fontWeight: typography.weights.medium,
    flex: 1,
  },
  textCorrect: {
    color: colors.success,
    fontWeight: typography.weights.bold,
  },
  textIncorrect: {
    color: colors.error,
    fontWeight: typography.weights.bold,
  },
  explanationContainer: {
    marginTop: spacing.xxl,
    padding: spacing.lg,
    backgroundColor: colors.primaryLight,
    borderRadius: borderRadius.lg,
  },
  explanationTitle: {
    fontSize: typography.sizes.md,
    fontWeight: typography.weights.bold,
    color: colors.primary,
    marginBottom: spacing.xs,
  },
  explanationText: {
    fontSize: typography.sizes.sm,
    color: colors.text,
    lineHeight: 22,
  },
  footer: {
    padding: spacing.xl,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.surface,
  },
  primaryButton: {
    backgroundColor: colors.primary,
    padding: spacing.lg,
    borderRadius: borderRadius.lg,
    alignItems: 'center',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  primaryButtonText: {
    color: colors.background,
    fontSize: typography.sizes.lg,
    fontWeight: typography.weights.bold,
  },
  errorText: {
    fontSize: typography.sizes.lg,
    color: colors.error,
    marginBottom: spacing.lg,
  },
  summaryContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xl,
  },
  awardIcon: {
    marginBottom: spacing.xl,
  },
  summaryTitle: {
    fontSize: typography.sizes.xxl,
    fontWeight: typography.weights.bold,
    color: colors.text,
    marginBottom: spacing.sm,
  },
  scoreText: {
    fontSize: typography.sizes.lg,
    color: colors.textSecondary,
    marginBottom: spacing.xxxl,
  },
  actionButtons: {
    flexDirection: 'row',
    width: '100%',
    gap: spacing.md,
  },
});
