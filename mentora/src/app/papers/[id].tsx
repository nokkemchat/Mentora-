import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TextInput, Pressable, KeyboardAvoidingView, Platform } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { Bot, Send, Sparkles, AlertCircle, BookOpen } from 'lucide-react-native';
import { useThemeColors, typography, spacing, borderRadius } from '@/constants/theme';

export default function QuestionTutorScreen() {
  const { id } = useLocalSearchParams();
  const colors = useThemeColors();
  
  const [chatMessage, setChatMessage] = useState('');
  const [messages, setMessages] = useState([
    { role: 'assistant', content: 'Hi! I am your AI Exam Tutor. What part of this question are you struggling with?' }
  ]);

  // Mock Question Data
  const question = {
    number: '4(a)',
    topic: 'Mechanics',
    marks: 8,
    text: 'A particle of mass 2.5 kg moves in a straight line. Its velocity v m/s at time t seconds is given by v = 3t^2 - 4t + 2. Find the momentum of the particle when t = 3.',
    difficulty: 'Medium'
  };

  const handleSend = () => {
    if (!chatMessage.trim()) return;
    
    // Add user message
    const newMessages = [...messages, { role: 'user', content: chatMessage }];
    setMessages(newMessages);
    setChatMessage('');

    // Mock AI Reply (RAG Tutor)
    setTimeout(() => {
      setMessages([
        ...newMessages,
        { role: 'assistant', content: "Great question! Remember that momentum is calculated as the product of mass and velocity (p = mv). First, try to find the velocity 'v' when t = 3. What do you get?" }
      ]);
    }, 1000);
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Stack.Screen options={{ 
        title: `Question ${question.number}`,
        headerStyle: { backgroundColor: colors.surface },
        headerTintColor: colors.text,
      }} />

      <ScrollView style={styles.scrollContainer}>
        {/* Question Content */}
        <View style={[styles.questionCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={styles.questionHeader}>
            <View style={[styles.badge, { backgroundColor: `${colors.primary}15` }]}>
              <Text style={[styles.badgeText, { color: colors.primary }]}>{question.topic}</Text>
            </View>
            <Text style={[styles.marksText, { color: colors.textSecondary }]}>[{question.marks} marks]</Text>
          </View>
          
          <Text style={[styles.questionText, { color: colors.text }]}>
            {question.text}
          </Text>

          <View style={styles.actionRow}>
            <Pressable style={[styles.actionButton, { backgroundColor: `${colors.success}10` }]}>
              <BookOpen color={colors.success} size={16} />
              <Text style={[styles.actionText, { color: colors.success }]}>Mark Scheme</Text>
            </Pressable>
            <Pressable style={[styles.actionButton, { backgroundColor: `${colors.warning}10` }]}>
              <Sparkles color={colors.warning} size={16} />
              <Text style={[styles.actionText, { color: colors.warning }]}>Generate Hint</Text>
            </Pressable>
          </View>
        </View>

        {/* AI Tutor Chat */}
        <View style={styles.chatSection}>
          <View style={styles.chatHeader}>
            <Bot color={colors.primary} size={20} />
            <Text style={[styles.chatTitle, { color: colors.text }]}>Mentora AI Tutor</Text>
          </View>

          {messages.map((msg, index) => (
            <View 
              key={index} 
              style={[
                styles.messageBubble, 
                msg.role === 'user' ? [styles.userBubble, { backgroundColor: colors.primary }] : [styles.aiBubble, { backgroundColor: colors.surface, borderColor: colors.border }]
              ]}
            >
              <Text style={[
                styles.messageText, 
                { color: msg.role === 'user' ? '#fff' : colors.text }
              ]}>
                {msg.content}
              </Text>
            </View>
          ))}
        </View>
      </ScrollView>

      {/* Chat Input */}
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={90}>
        <View style={[styles.inputContainer, { backgroundColor: colors.surface, borderTopColor: colors.border }]}>
          <TextInput
            style={[styles.textInput, { color: colors.text, backgroundColor: colors.background }]}
            placeholder="Ask for help or a hint..."
            placeholderTextColor={colors.textSecondary}
            value={chatMessage}
            onChangeText={setChatMessage}
            multiline
          />
          <Pressable 
            style={[styles.sendButton, { backgroundColor: chatMessage.trim() ? colors.primary : colors.border }]}
            onPress={handleSend}
            disabled={!chatMessage.trim()}
          >
            <Send color="#fff" size={18} />
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContainer: { flex: 1, padding: spacing.md },
  questionCard: {
    padding: spacing.lg,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    marginBottom: spacing.xl,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  questionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: borderRadius.sm,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: typography.weights.bold,
    textTransform: 'uppercase',
  },
  marksText: {
    fontSize: typography.sizes.sm,
    fontWeight: typography.weights.medium,
  },
  questionText: {
    fontSize: typography.sizes.md,
    lineHeight: 24,
    marginBottom: spacing.lg,
  },
  actionRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
    gap: 6,
  },
  actionText: {
    fontSize: typography.sizes.sm,
    fontWeight: typography.weights.semibold,
  },
  chatSection: {
    paddingBottom: spacing.xxl,
  },
  chatHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.md,
    paddingHorizontal: spacing.sm,
  },
  chatTitle: {
    fontSize: typography.sizes.md,
    fontWeight: typography.weights.bold,
  },
  messageBubble: {
    maxWidth: '85%',
    padding: spacing.md,
    borderRadius: borderRadius.lg,
    marginBottom: spacing.md,
  },
  userBubble: {
    alignSelf: 'flex-end',
    borderBottomRightRadius: 4,
  },
  aiBubble: {
    alignSelf: 'flex-start',
    borderBottomLeftRadius: 4,
    borderWidth: 1,
  },
  messageText: {
    fontSize: typography.sizes.md,
    lineHeight: 22,
  },
  inputContainer: {
    flexDirection: 'row',
    padding: spacing.md,
    paddingBottom: Platform.OS === 'ios' ? spacing.xl : spacing.md,
    borderTopWidth: 1,
    alignItems: 'flex-end',
    gap: spacing.sm,
  },
  textInput: {
    flex: 1,
    minHeight: 44,
    maxHeight: 120,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    paddingTop: 12,
    paddingBottom: 12,
    fontSize: typography.sizes.md,
  },
  sendButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
