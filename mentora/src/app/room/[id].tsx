import React, { useState, useMemo, useEffect } from 'react';
import { View, Text, StyleSheet, SafeAreaView, Pressable, TextInput, KeyboardAvoidingView, Platform, FlatList, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { spacing, typography, borderRadius, useThemeColors } from '@/constants/theme';
import { Feather } from '@expo/vector-icons';
import { CameraView, useCameraPermissions } from 'expo-camera';

type MessageType = {
  id: string;
  text: string;
  sender_id: string;
  created_at: string;
  profiles: {
    first_name: string;
  } | null;
};

type RoomType = {
  id: string;
  title: string;
  is_focus_mode: boolean;
};

export default function StudyRoomScreen() {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();

  const [room, setRoom] = useState<RoomType | null>(null);
  const [messages, setMessages] = useState<MessageType[]>([]);
  const [activeTab, setActiveTab] = useState<'chat' | 'participants' | 'video'>('video');
  const [messageText, setMessageText] = useState('');
  const [loading, setLoading] = useState(true);
  
  // Camera State
  const [permission, requestPermission] = useCameraPermissions();
  const [isCameraActive, setIsCameraActive] = useState(false);

  // Pomodoro state mock
  const [timeLeft, setTimeLeft] = useState(45 * 60); // 45 minutes
  const [isFocusing, setIsFocusing] = useState(true);

  // Load Room & Messages
  useEffect(() => {
    if (!id) return;

    async function loadData() {
      // 1. Fetch Room details
      const { data: roomData } = await supabase
        .from('study_rooms')
        .select('*')
        .eq('id', id)
        .single();
      
      if (roomData) setRoom(roomData);

      // 2. Fetch Messages
      const { data: messagesData } = await supabase
        .from('study_room_messages')
        .select('*, profiles(first_name)')
        .eq('room_id', id)
        .order('created_at', { ascending: false })
        .limit(50);

      if (messagesData) setMessages(messagesData as MessageType[]);
      
      setLoading(false);
    }

    loadData();

    // 3. Subscribe to Realtime new messages
    const channel = supabase.channel(`room:${id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'study_room_messages', filter: `room_id=eq.${id}` },
        async (payload) => {
          const newMessage = payload.new as any;
          
          const { data: profile } = await supabase
            .from('profiles')
            .select('first_name')
            .eq('id', newMessage.sender_id)
            .single();

          const completeMessage: MessageType = {
            ...newMessage,
            profiles: profile || { first_name: 'Unknown' }
          };

          setMessages((prev) => [completeMessage, ...prev]);
        }
      )
      .subscribe();

    // Timer logic
    const interval = setInterval(() => {
      setTimeLeft((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);

    return () => {
      clearInterval(interval);
      supabase.removeChannel(channel);
    };
  }, [id]);

  async function handleSendMessage() {
    if (!messageText.trim() || !user || !id) return;
    
    const textToSend = messageText.trim();
    setMessageText(''); 

    const { error } = await supabase
      .from('study_room_messages')
      .insert({
        room_id: id,
        sender_id: user.id,
        text: textToSend
      });
      
    if (error) {
      console.error("Error sending message:", error);
    }
  }

  const toggleCamera = async () => {
    if (!permission?.granted) {
      const { granted } = await requestPermission();
      if (!granted) return;
    }
    setIsCameraActive(!isCameraActive);
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (!room) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>Room not found.</Text>
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <Text style={styles.backButtonText}>Go Back</Text>
        </Pressable>
      </View>
    );
  }

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const renderMessage = ({ item }: { item: MessageType }) => {
    const isCurrentUser = item.sender_id === user?.id;
    const senderName = item.profiles?.first_name || 'User';
    
    const date = new Date(item.created_at);
    const timeString = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    return (
      <View style={[styles.messageRow, isCurrentUser ? styles.messageRowSelf : styles.messageRowOther]}>
        {!isCurrentUser && (
          <View style={styles.avatarPlaceholder}>
            <Text style={styles.avatarText}>{senderName[0].toUpperCase()}</Text>
          </View>
        )}
        <View style={[styles.messageBubble, isCurrentUser ? styles.messageBubbleSelf : styles.messageBubbleOther]}>
          {!isCurrentUser && <Text style={styles.senderName}>{senderName}</Text>}
          <Text style={[styles.messageText, isCurrentUser ? styles.messageTextSelf : styles.messageTextOther]}>
            {item.text}
          </Text>
          <Text style={[styles.timestamp, isCurrentUser ? styles.timestampSelf : styles.timestampOther]}>
            {timeString}
          </Text>
        </View>
      </View>
    );
  };

  const dummyParticipants = [
    { id: '1', name: 'You', studyTimeMinutes: 45, isHost: false },
    { id: '2', name: 'Alice', studyTimeMinutes: 120, isHost: true },
    { id: '3', name: 'James', studyTimeMinutes: 15, isHost: false },
    { id: '4', name: 'Sarah', studyTimeMinutes: 60, isHost: false },
  ];

  const renderParticipant = ({ item }: { item: typeof dummyParticipants[0] }) => (
    <View style={styles.participantRow}>
      <View style={styles.participantLeft}>
        <View style={styles.avatarPlaceholder}>
          <Text style={styles.avatarText}>{item.name[0]}</Text>
        </View>
        <View>
          <Text style={styles.participantName}>{item.name}</Text>
          {item.isHost && <Text style={styles.hostBadge}>Host</Text>}
        </View>
      </View>
      <View style={styles.studyTimeBadge}>
        <Feather name="clock" size={12} color={colors.primary} />
        <Text style={styles.studyTimeText}>{item.studyTimeMinutes}m</Text>
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      {/* Room Header */}
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <Pressable onPress={() => router.back()} style={styles.headerButton}>
            <Feather name="chevron-left" size={24} color={colors.background} />
          </Pressable>
          <Text style={styles.headerTitle} numberOfLines={1}>{room.title}</Text>
          <Pressable style={styles.headerButton}>
            <Feather name="more-vertical" size={24} color={colors.background} />
          </Pressable>
        </View>

        {/* Pomodoro Timer & Controls */}
        <View style={styles.timerContainer}>
          <Text style={styles.timerMode}>{isFocusing ? 'Focus Session' : 'Break Time'}</Text>
          <Text style={styles.timerValue}>{formatTime(timeLeft)}</Text>
          <View style={styles.timerControls}>
            <Pressable style={styles.timerControlButton}>
              <Feather name="pause" size={20} color={colors.background} />
            </Pressable>
            
            <Pressable 
              style={[styles.timerControlButton, isCameraActive && styles.timerControlButtonActive]} 
              onPress={toggleCamera}
            >
              <Feather name={isCameraActive ? "video" : "video-off"} size={20} color={colors.background} />
            </Pressable>
          </View>
        </View>
      </View>

      {/* Tabs */}
      <View style={styles.tabsContainer}>
        <Pressable 
          style={[styles.tab, activeTab === 'video' && styles.activeTab]}
          onPress={() => setActiveTab('video')}
        >
          <Text style={[styles.tabText, activeTab === 'video' && styles.activeTabText]}>Video Grid</Text>
        </Pressable>
        <Pressable 
          style={[styles.tab, activeTab === 'chat' && styles.activeTab]}
          onPress={() => setActiveTab('chat')}
        >
          <Text style={[styles.tabText, activeTab === 'chat' && styles.activeTabText]}>Live Chat</Text>
        </Pressable>
        <Pressable 
          style={[styles.tab, activeTab === 'participants' && styles.activeTab]}
          onPress={() => setActiveTab('participants')}
        >
          <Text style={[styles.tabText, activeTab === 'participants' && styles.activeTabText]}>
            List ({dummyParticipants.length})
          </Text>
        </Pressable>
      </View>

      {/* Main Content Area */}
      <KeyboardAvoidingView 
        style={styles.contentArea} 
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {activeTab === 'chat' ? (
          <>
            {room.is_focus_mode ? (
              <View style={styles.focusModeOverlay}>
                <Feather name="mic-off" size={48} color={colors.textSecondary} />
                <Text style={styles.focusModeTitle}>Focus Mode Active</Text>
                <Text style={styles.focusModeSubtitle}>Chat is disabled until the break session starts.</Text>
              </View>
            ) : (
              <>
                <FlatList
                  data={messages}
                  keyExtractor={(item) => item.id}
                  renderItem={renderMessage}
                  contentContainerStyle={styles.chatList}
                  inverted={true}
                />
                <View style={styles.inputContainer}>
                  <Pressable style={styles.attachButton}>
                    <Feather name="paperclip" size={20} color={colors.textSecondary} />
                  </Pressable>
                  <TextInput
                    style={styles.input}
                    placeholder="Type a message..."
                    placeholderTextColor={colors.textTertiary}
                    value={messageText}
                    onChangeText={setMessageText}
                    onSubmitEditing={handleSendMessage}
                  />
                  <Pressable 
                    style={[styles.sendButton, !messageText.trim() && styles.sendButtonDisabled]}
                    onPress={handleSendMessage}
                  >
                    <Feather name="send" size={20} color={colors.background} />
                  </Pressable>
                </View>
              </>
            )}
          </>
        ) : activeTab === 'participants' ? (
          <FlatList
            data={dummyParticipants.sort((a, b) => b.studyTimeMinutes - a.studyTimeMinutes)}
            keyExtractor={(item) => item.id}
            renderItem={renderParticipant}
            contentContainerStyle={styles.participantsList}
            ListHeaderComponent={
              <Text style={styles.leaderboardTitle}>🏆 Study Leaderboard</Text>
            }
          />
        ) : (
          /* Simulated Video Grid */
          <View style={styles.videoGridContainer}>
            <View style={styles.gridRow}>
              {/* Local User Box */}
              <View style={styles.gridBox}>
                {isCameraActive ? (
                  <CameraView style={styles.cameraFill} facing="front" />
                ) : (
                  <View style={styles.mockVideoBox}>
                    <Feather name="video-off" size={32} color={colors.textTertiary} />
                    <Text style={styles.mockVideoName}>You</Text>
                  </View>
                )}
                {isCameraActive && <View style={styles.nameLabel}><Text style={styles.nameLabelText}>You</Text></View>}
              </View>
              
              {/* Mock Student 1 */}
              <View style={styles.gridBox}>
                <View style={[styles.mockVideoBox, { backgroundColor: '#2C3E50' }]}>
                  <Text style={styles.mockAvatarText}>A</Text>
                  <Text style={styles.mockVideoName}>Alice (Studying)</Text>
                </View>
              </View>
            </View>

            <View style={styles.gridRow}>
              {/* Mock Student 2 */}
              <View style={styles.gridBox}>
                <View style={[styles.mockVideoBox, { backgroundColor: '#8E44AD' }]}>
                  <Text style={styles.mockAvatarText}>J</Text>
                  <Text style={styles.mockVideoName}>James</Text>
                </View>
              </View>
              
              {/* Mock Student 3 */}
              <View style={styles.gridBox}>
                <View style={[styles.mockVideoBox, { backgroundColor: '#27AE60' }]}>
                  <Text style={styles.mockAvatarText}>S</Text>
                  <Text style={styles.mockVideoName}>Sarah</Text>
                </View>
              </View>
            </View>
          </View>
        )}
      </KeyboardAvoidingView>
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
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  header: {
    backgroundColor: colors.primary,
    paddingTop: Platform.OS === 'android' ? spacing.xxl : spacing.md,
    paddingBottom: spacing.xl,
    borderBottomLeftRadius: borderRadius.xl,
    borderBottomRightRadius: borderRadius.xl,
  },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    marginBottom: spacing.lg,
  },
  headerButton: {
    padding: spacing.sm,
  },
  headerTitle: {
    flex: 1,
    color: colors.background,
    fontSize: typography.sizes.lg,
    fontWeight: typography.weights.bold,
    textAlign: 'center',
  },
  timerContainer: {
    alignItems: 'center',
  },
  timerMode: {
    color: 'rgba(255, 255, 255, 0.8)',
    fontSize: typography.sizes.sm,
    fontWeight: typography.weights.medium,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 4,
  },
  timerValue: {
    color: colors.background,
    fontSize: 48,
    fontWeight: typography.weights.bold,
    fontVariant: ['tabular-nums'],
    marginBottom: spacing.md,
  },
  timerControls: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  timerControlButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  timerControlButtonActive: {
    backgroundColor: colors.success,
  },
  tabsContainer: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  tab: {
    flex: 1,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  activeTab: {
    borderBottomWidth: 2,
    borderBottomColor: colors.primary,
  },
  tabText: {
    fontSize: typography.sizes.sm,
    fontWeight: typography.weights.bold,
    color: colors.textSecondary,
  },
  activeTabText: {
    color: colors.primary,
  },
  contentArea: {
    flex: 1,
  },
  chatList: {
    padding: spacing.md,
  },
  messageRow: {
    flexDirection: 'row',
    marginBottom: spacing.lg,
    maxWidth: '85%',
  },
  messageRowSelf: {
    alignSelf: 'flex-end',
  },
  messageRowOther: {
    alignSelf: 'flex-start',
  },
  avatarPlaceholder: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.sm,
  },
  avatarText: {
    color: colors.primary,
    fontWeight: typography.weights.bold,
    fontSize: typography.sizes.md,
  },
  messageBubble: {
    padding: spacing.md,
    borderRadius: borderRadius.lg,
  },
  messageBubbleSelf: {
    backgroundColor: colors.primary,
    borderTopRightRadius: 4,
  },
  messageBubbleOther: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 4,
    borderWidth: 1,
    borderColor: colors.border,
  },
  senderName: {
    fontSize: typography.sizes.xs,
    fontWeight: typography.weights.bold,
    color: colors.primary,
    marginBottom: 4,
  },
  messageText: {
    fontSize: typography.sizes.md,
    lineHeight: 22,
  },
  messageTextSelf: {
    color: colors.background,
  },
  messageTextOther: {
    color: colors.text,
  },
  timestamp: {
    fontSize: 10,
    marginTop: 4,
    alignSelf: 'flex-end',
  },
  timestampSelf: {
    color: 'rgba(255, 255, 255, 0.7)',
  },
  timestampOther: {
    color: colors.textTertiary,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.background,
  },
  attachButton: {
    padding: spacing.sm,
  },
  input: {
    flex: 1,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 20,
    paddingHorizontal: spacing.md,
    paddingVertical: Platform.OS === 'ios' ? 10 : 8,
    marginHorizontal: spacing.sm,
    color: colors.text,
    fontSize: typography.sizes.md,
  },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendButtonDisabled: {
    backgroundColor: colors.border,
  },
  focusModeOverlay: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xxl,
  },
  focusModeTitle: {
    fontSize: typography.sizes.xl,
    fontWeight: typography.weights.bold,
    color: colors.text,
    marginTop: spacing.lg,
    marginBottom: spacing.xs,
  },
  focusModeSubtitle: {
    fontSize: typography.sizes.md,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  participantsList: {
    padding: spacing.xl,
  },
  leaderboardTitle: {
    fontSize: typography.sizes.lg,
    fontWeight: typography.weights.bold,
    color: colors.text,
    marginBottom: spacing.xl,
  },
  participantRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.surfaceHighlight,
  },
  participantLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  participantName: {
    fontSize: typography.sizes.md,
    fontWeight: typography.weights.semibold,
    color: colors.text,
  },
  hostBadge: {
    fontSize: 10,
    color: colors.warning,
    fontWeight: typography.weights.bold,
    textTransform: 'uppercase',
    marginTop: 2,
    marginRight: 8,
  },
  studyTimeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primaryLight,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: borderRadius.sm,
    gap: 4,
  },
  studyTimeText: {
    fontSize: typography.sizes.xs,
    color: colors.primary,
    fontWeight: typography.weights.bold,
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
    marginTop: spacing.md,
  },
  backButtonText: {
    color: colors.background,
    fontWeight: typography.weights.bold,
  },
  videoGridContainer: {
    flex: 1,
    backgroundColor: '#111',
    padding: 2,
  },
  gridRow: {
    flex: 1,
    flexDirection: 'row',
  },
  gridBox: {
    flex: 1,
    margin: 2,
    backgroundColor: '#222',
    borderRadius: 8,
    overflow: 'hidden',
    position: 'relative',
  },
  cameraFill: {
    flex: 1,
  },
  mockVideoBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#333',
  },
  mockAvatarText: {
    fontSize: 48,
    color: 'rgba(255,255,255,0.2)',
    fontWeight: 'bold',
  },
  mockVideoName: {
    position: 'absolute',
    bottom: 8,
    left: 8,
    color: 'white',
    fontSize: 12,
    fontWeight: '600',
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  nameLabel: {
    position: 'absolute',
    bottom: 8,
    left: 8,
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  nameLabelText: {
    color: 'white',
    fontSize: 12,
    fontWeight: '600',
  }
});
