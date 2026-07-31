import React, { useState, useRef, useEffect } from 'react';
import { View, Text, StyleSheet, TextInput, FlatList, KeyboardAvoidingView, Platform, ActivityIndicator, Pressable, Keyboard } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { typography, spacing, borderRadius, useThemeColors } from '@/constants/theme';
import { GlobalWatermark } from '@/components/GlobalWatermark';
import Markdown from 'react-native-markdown-display';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'expo-router';

type Message = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
};

export default function AITutorScreen() {
  const colors = useThemeColors();
  const styles = createStyles(colors);
  const { user } = useAuth();
  const router = useRouter();
  
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      role: 'assistant',
      content: "Hello! I am your AI Tutor. I can help you with anything from Mathematics to Chemistry. What would you like to learn today?"
    }
  ]);
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  
  const flatListRef = useRef<FlatList>(null);

  // Auto-scroll to bottom
  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 200);
    }
  }, [messages]);

  const handleSend = async () => {
    const text = inputText.trim();
    if (!text) return;

    // Add user message to UI immediately
    const userMessage: Message = { id: Date.now().toString(), role: 'user', content: text };
    setMessages(prev => [...prev, userMessage]);
    setInputText('');
    Keyboard.dismiss();
    setIsLoading(true);

    try {
      // Create session if it doesn't exist
      let currentSessionId = sessionId;
      if (!currentSessionId) {
        const { data, error } = await supabase
          .from('learning_sessions')
          .insert({
            user_id: user?.id,
            context_type: 'general',
            chat_history: [
              { role: 'user', content: text }
            ]
          })
          .select()
          .single();
          
        if (data) {
          currentSessionId = data.id;
          setSessionId(data.id);
        }
      }

      // Call Edge Function
      const { data, error } = await supabase.functions.invoke('tutor-chat', {
        body: {
          message: text,
          context: { type: 'general' },
          sessionId: currentSessionId
        }
      });

      if (error) throw error;

      if (data && data.reply) {
        const assistantMessage: Message = {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: data.reply
        };
        setMessages(prev => [...prev, assistantMessage]);
      }
    } catch (err: any) {
      console.error('Edge Function Error:', err);
      let errorMessage = "I'm having trouble connecting to the backend right now. Please try again.";
      
      if (err instanceof Error) {
        errorMessage = `Backend Error: ${err.message}`;
      } else if (typeof err === 'object' && err?.message) {
        errorMessage = `Backend Error: ${err.message}`;
      }

      setMessages(prev => [...prev, {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: errorMessage
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  const renderMessage = ({ item }: { item: Message }) => {
    const isUser = item.role === 'user';
    return (
      <View style={[styles.messageBubbleWrapper, isUser ? styles.userWrapper : styles.assistantWrapper]}>
        {!isUser && (
          <View style={styles.assistantAvatar}>
            <Ionicons name="sparkles" size={16} color="#FFF" />
          </View>
        )}
        <View style={[styles.messageBubble, isUser ? styles.userBubble : styles.assistantBubble]}>
          {isUser ? (
            <Text style={styles.userText}>{item.content}</Text>
          ) : (
            <Markdown
              style={{
                body: { color: colors.text, fontSize: typography.sizes.md, fontFamily: 'Outfit_400Regular' },
                code_block: { backgroundColor: colors.border, borderRadius: 8, padding: 8 },
                code_inline: { backgroundColor: colors.border, borderRadius: 4, padding: 2 },
              }}
            >
              {item.content}
            </Markdown>
          )}
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <GlobalWatermark />
      
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerTitleContainer}>
          <Pressable onPress={() => router.back()} style={styles.closeButton}>
            <Ionicons name="close" size={24} color={colors.text} />
          </Pressable>
          <Ionicons name="sparkles" size={24} color={colors.primary} style={{ marginRight: spacing.sm }} />
          <Text style={styles.headerTitle}>AI Tutor</Text>
        </View>
        <Text style={styles.headerSubtitle}>Ask any question, anytime.</Text>
      </View>

      {/* Chat Area */}
      <KeyboardAvoidingView 
        style={styles.chatContainer} 
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
      >
        <FlatList
          ref={flatListRef}
          data={messages}
          keyExtractor={(item) => item.id}
          renderItem={renderMessage}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
        />

        {isLoading && (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="small" color={colors.primary} />
            <Text style={styles.loadingText}>Tutor is thinking...</Text>
          </View>
        )}

        {/* Input Area */}
        <View style={styles.inputContainer}>
          <TextInput
            style={styles.input}
            placeholder="Ask a question..."
            placeholderTextColor={colors.textSecondary}
            value={inputText}
            onChangeText={setInputText}
            multiline
            maxLength={1000}
          />
          <Pressable 
            style={[styles.sendButton, !inputText.trim() && styles.sendButtonDisabled]} 
            onPress={handleSend}
            disabled={!inputText.trim() || isLoading}
          >
            <Ionicons name="send" size={18} color="#FFF" />
          </Pressable>
        </View>
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
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.surface,
  },
  headerTitleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  closeButton: {
    marginRight: spacing.md,
    padding: 4,
  },
  headerTitle: {
    fontSize: typography.sizes.xl,
    fontFamily: 'Outfit_700Bold',
    color: colors.text,
  },
  headerSubtitle: {
    fontSize: typography.sizes.sm,
    fontFamily: 'Outfit_400Regular',
    color: colors.textSecondary,
    marginTop: 4,
  },
  chatContainer: {
    flex: 1,
  },
  listContent: {
    padding: spacing.lg,
    paddingBottom: 100, // Account for bottom tab bar
  },
  messageBubbleWrapper: {
    flexDirection: 'row',
    marginBottom: spacing.md,
    maxWidth: '85%',
  },
  userWrapper: {
    alignSelf: 'flex-end',
  },
  assistantWrapper: {
    alignSelf: 'flex-start',
  },
  assistantAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.sm,
    marginTop: 2,
  },
  messageBubble: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: 20,
  },
  userBubble: {
    backgroundColor: colors.primary,
    borderBottomRightRadius: 4,
  },
  assistantBubble: {
    backgroundColor: colors.surface,
    borderBottomLeftRadius: 4,
    borderWidth: 1,
    borderColor: colors.border,
  },
  userText: {
    color: '#FFFFFF',
    fontSize: typography.sizes.md,
    fontFamily: 'Outfit_400Regular',
  },
  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    marginBottom: spacing.md,
  },
  loadingText: {
    marginLeft: spacing.sm,
    fontSize: typography.sizes.sm,
    color: colors.textSecondary,
    fontFamily: 'Outfit_400Regular',
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    padding: spacing.md,
    paddingHorizontal: spacing.xl,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingBottom: Platform.OS === 'ios' ? 120 : spacing.xxxl, // Space for tab bar
  },
  input: {
    flex: 1,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 20,
    paddingHorizontal: spacing.lg,
    paddingTop: 12,
    paddingBottom: 12,
    minHeight: 45,
    maxHeight: 120,
    fontSize: typography.sizes.md,
    color: colors.text,
    fontFamily: 'Outfit_400Regular',
  },
  sendButton: {
    width: 45,
    height: 45,
    borderRadius: 22.5,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: spacing.sm,
    marginBottom: 0,
  },
  sendButtonDisabled: {
    backgroundColor: colors.border,
  }
});
