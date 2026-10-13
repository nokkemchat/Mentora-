import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  Pressable,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Keyboard,
  Image,
  Alert,
  Dimensions,
  Modal,
  Share,
  ActionSheetIOS
} from 'react-native';
import * as Haptics from 'expo-haptics';
import {
  Bot,
  Send,
  Sparkles,
  Camera,
  Image as ImageIcon,
  FileText,
  Paperclip,
  Plus,
  X,
  RotateCcw,
  Lightbulb,
  BookOpen,
  Copy,
  Edit3,
  HelpCircle,
  CheckCircle2,
  ChevronRight,
  Trash2,
  RefreshCw,
  AlertCircle,
  Share2
} from 'lucide-react-native';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { useThemeColors, typography, spacing, borderRadius } from '@/constants/theme';
import { useAuth } from '@/context/AuthContext';
import { FormattedMessage } from './FormattedMessage';
import {
  QuestionPaperTutorAgent,
  TutorAgentTools,
  TutorSessionState,
  QuestionData,
  BUILTIN_QUESTIONS,
  PaperContext,
  InteractiveOptionsData,
  LearningOptionItem,
  AssessmentResult
} from '@/lib/tutorAgent';
import { MarkedAnswerSheetViewer } from './MarkedAnswerSheetViewer';
import { optimizeImageForUpload } from '@/lib/markedImageGenerator';

export interface AttachmentData {
  uri: string;
  name: string;
  type: 'image' | 'pdf';
  mimeType?: string;
  size?: number;
  base64?: string;
}

interface QuestionPaperTutorModalProps {
  visible: boolean;
  onClose: () => void;
  paperId: string;
  paperTitle?: string;
  subject?: string;
  curriculum?: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  imageUrl?: string;
  imageUrls?: string[];
  attachment?: AttachmentData;
  attachments?: AttachmentData[];
  interactiveOptions?: InteractiveOptionsData;
  assessmentResult?: AssessmentResult;
  timestamp: number;
  isError?: boolean;
  canRetry?: boolean;
  retryPayload?: {
    text: string;
    attachment?: AttachmentData | null;
  };
}

const REQUEST_TIMEOUT_MS = 22000;

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

export function QuestionPaperTutorModal({
  visible,
  onClose,
  paperId,
  paperTitle,
  subject,
  curriculum
}: QuestionPaperTutorModalProps) {
  const colors = useThemeColors();
  const { user } = useAuth();
  const studentId = user?.id || 'demo_student_123';

  // State
  const [questions, setQuestions] = useState<QuestionData[]>([]);
  const [sessionState, setSessionState] = useState<TutorSessionState | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [chatMessage, setChatMessage] = useState('');
  const [isAiThinking, setIsAiThinking] = useState(false);
  const [uploadedAttachments, setUploadedAttachments] = useState<AttachmentData[]>([]);
  const uploadedAttachment = uploadedAttachments[0] || null;
  const setUploadedAttachment = (att: AttachmentData | null) => {
    setUploadedAttachments(att ? [att] : []);
  };
  const [showAttachmentMenu, setShowAttachmentMenu] = useState(false);
  const [selectedFullImage, setSelectedFullImage] = useState<string | null>(null);
  const [isReevaluatingId, setIsReevaluatingId] = useState<string | null>(null);
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);
  const [isInputFocused, setIsInputFocused] = useState(false);

  const scrollViewRef = useRef<ScrollView>(null);

  const handleShareMessage = async (content: string, id: string) => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      setCopiedMessageId(id);
      setTimeout(() => setCopiedMessageId(null), 2000);
      await Share.share({
        message: content,
        title: 'Mentora AI Tutor Solution'
      });
    } catch (e) {
      console.warn('Share error:', e);
    }
  };

  // Initialize Session when Modal becomes visible
  useEffect(() => {
    if (visible && (!sessionState || sessionState.paper_id !== paperId || messages.length <= 1)) {
      initSession();
    }
  }, [visible, paperId]);

  const initSession = async () => {
    try {
      const activePaperId = paperId || '21f06556-c22c-4890-bec6-6e7119ffb86e';
      const paperContext = await TutorAgentTools.get_paper_context(activePaperId);
      if (paperTitle) paperContext.title = paperTitle;
      if (subject) paperContext.subject = subject;
      if (curriculum) paperContext.curriculum = curriculum;

      // Dynamically load all questions from Supabase for this active paper (works generically across any paper)
      let paperQuestions = await TutorAgentTools.get_all_paper_questions(activePaperId);
      if (!paperQuestions || paperQuestions.length === 0) {
        const subjectKey = (paperContext.subject || 'chemistry').toLowerCase();
        const matchedCategory = Object.keys(BUILTIN_QUESTIONS).find(k => subjectKey.includes(k)) || 'chemistry';
        paperQuestions = BUILTIN_QUESTIONS[matchedCategory] || BUILTIN_QUESTIONS['chemistry'];
      }
      setQuestions(paperQuestions);

      const firstQ = paperQuestions[0];
      const initialState = QuestionPaperTutorAgent.createInitialState(paperContext, studentId, firstQ);
      setSessionState(initialState);

      const sampleMarkedAsset = Image.resolveAssetSource(require('../../assets/images/sample_marked_q4.jpg'));
      const sampleCleanAsset = Image.resolveAssetSource(require('../../assets/images/sample_clean_q4.jpg'));
      const sampleImageUri = sampleMarkedAsset?.uri || sampleCleanAsset?.uri || '';

      const sampleAssessment: AssessmentResult = {
        score: 7,
        max_score: 10,
        percentage: 70,
        identified_question_number: '4',
        identified_topic: "Chemical Equilibrium & Le Chatelier's Principle",
        total_score: 7,
        total_max_score: 10,
        generated_marked_image_url: sampleImageUri,
        model_used: 'gpt-6-luna',
        overall_feedback: "Solid understanding of reversible reactions, dynamic equilibrium, and Le Chatelier's principle. 7 out of 10 marks awarded with teacher red ink corrections noted directly on the sheet.",
        annotations: [
          {
            type: 'tick',
            text: '(1/1)',
            comment: 'Correct dynamic equilibrium definition: forward rate equals backward rate.',
            box_2d: [115, 875, 145, 975],
            subpart_label: '(a)'
          },
          {
            type: 'tick',
            text: '(2/2)',
            comment: 'Correct deduction: increased pressure shifts equilibrium towards darker purple.',
            box_2d: [225, 875, 255, 975],
            subpart_label: '(b)'
          },
          {
            type: 'tick',
            text: '(1/1)',
            comment: 'Correct colour observation: mixture turns lighter purple.',
            box_2d: [340, 875, 370, 975],
            subpart_label: '(c)'
          },
          {
            type: 'tick',
            text: '(2/2)',
            comment: 'Correct mole quantities: HI = 1, I2 = 1.',
            box_2d: [435, 875, 465, 975],
            subpart_label: '(d)'
          },
          {
            type: 'tick',
            text: '(1/1)',
            comment: 'Correctly noted catalyst increases reaction rate of methanol formation.',
            box_2d: [535, 875, 565, 975],
            subpart_label: '(e)'
          },
          {
            type: 'tick',
            text: '(1/1)',
            comment: 'Correctly identified position of equilibrium shifts.',
            box_2d: [615, 875, 645, 975],
            subpart_label: '(i)'
          },
          {
            type: 'cross',
            text: '(0/1)',
            comment: 'Incorrect colour change: reaction is exothermic so cooling favours forward reaction.',
            box_2d: [705, 875, 735, 975],
            subpart_label: '(ii)'
          },
          {
            type: 'underline',
            text: 'It should turn darker purple because the reaction is exothermic and lowering the temperature favours the forward reaction (which produces the darker colour).',
            comment: 'Teacher correction: exothermic reaction favours forward product when cooled.',
            box_2d: [728, 200, 805, 900],
            subpart_label: '(ii)'
          },
          {
            type: 'total_header',
            text: 'Total: 7/10',
            comment: 'Final Score: 7/10 marks (70%)',
            box_2d: [835, 780, 865, 955]
          }
        ],
        subparts: [
          {
            part_label: '(a)',
            part_title: 'Equilibrium Definition',
            score: 1,
            max_score: 1,
            student_answer_detected: 'The term equilibrium means when the rate of the forward reaction is equal to the rate of the backward reaction.',
            marks_awarded: ['1 mark: Forward rate equals backward rate'],
            deductions: [],
            feedback: 'Accurate definition of dynamic equilibrium.'
          },
          {
            part_label: '(b)',
            part_title: 'Pressure Increase Effect',
            score: 2,
            max_score: 2,
            student_answer_detected: 'The pressure of the mixture is increased. The temperature remains constant. The colour of the gaseous mixture turns darker purple.',
            marks_awarded: ['2 marks: Pressure shift and dark purple colour change correctly observed'],
            deductions: [],
            feedback: 'Spot-on explanation of pressure effect.'
          },
          {
            part_label: '(c)',
            part_title: 'Temperature Decrease Effect',
            score: 1,
            max_score: 1,
            student_answer_detected: 'The temperature of the mixture of gases is decreased. The mixture of gases turns lighter purple.',
            marks_awarded: ['1 mark: Correct colour change observation'],
            deductions: [],
            feedback: 'Accurate.'
          },
          {
            part_label: '(d)',
            part_title: 'Equilibrium Mole Quantities',
            score: 2,
            max_score: 2,
            student_answer_detected: 'HI = 1, I2 = 1',
            marks_awarded: ['2 marks: Both mole quantities accurately determined'],
            deductions: [],
            feedback: 'Correct calculations.'
          },
          {
            part_label: '(e)',
            part_title: 'Catalyst Effect',
            score: 1,
            max_score: 1,
            student_answer_detected: 'The rate of formation of methanol increases when a catalyst is used.',
            marks_awarded: ['1 mark: Catalyst increases rate of reaction'],
            deductions: [],
            feedback: 'Correct.'
          },
          {
            part_label: '(i)',
            part_title: 'Equilibrium Position Shift',
            score: 1,
            max_score: 1,
            student_answer_detected: 'The position of equilibrium does change.',
            marks_awarded: ['1 mark: Correct statement'],
            deductions: [],
            feedback: 'Correct.'
          },
          {
            part_label: '(ii)',
            part_title: 'Exothermic Temperature Shift',
            score: 0,
            max_score: 1,
            student_answer_detected: 'The colour of the mixture of gases turns lighter purple.',
            marks_awarded: [],
            deductions: ['0 marks: Should turn darker purple'],
            teacher_correction: 'It should turn darker purple because the reaction is exothermic and lowering the temperature favours the forward reaction (which produces the darker colour).',
            feedback: 'Since forward reaction is exothermic, lowering temperature shifts equilibrium right, producing more darker purple gas.'
          }
        ],
        feedback: 'Great effort! Scored 7/10 marks with full marks across (a)-(i). Review Part (ii) temperature shifts on exothermic reactions.',
        recommended_next_step: "Review Le Chatelier's principle temperature effects for exothermic reactions."
      };

      // Sleek greeting with marked script demo
      setMessages([
        {
          id: 'welcome-1',
          role: 'assistant',
          content: `Hi, I'm your Senior Examiner AI. I mark student answer sheets directly with physical red ink (ticks, margin marks, and corrections).\n\nHere is your marked answer sheet for **Question 4: Chemical Equilibrium** (7/10 marks) below. Tap the image to inspect the teacher markings full-screen!\n\nUpload your own handwritten answer sheets or PDF anytime!`,
          imageUrl: sampleImageUri,
          assessmentResult: sampleAssessment,
          timestamp: Date.now()
        }
      ]);
    } catch (err) {
      console.warn('Modal init error:', err);
    }
  };

  const scrollToBottom = () => {
    setTimeout(() => {
      scrollViewRef.current?.scrollToEnd({ animated: true });
    }, 150);
  };

  // Send message or submission to Agent
  const handleSendMessage = async (textToSend?: string, attachmentToSend?: AttachmentData | null) => {
    const currentAttachments = attachmentToSend !== undefined
      ? (attachmentToSend ? [attachmentToSend] : [])
      : uploadedAttachments;
    const currentAttachment = currentAttachments[0] || null;
    const messageContent = (textToSend !== undefined ? textToSend : chatMessage).trim();
    if (!messageContent && currentAttachments.length === 0) return;
    if (!sessionState) return;

    const defaultContent = currentAttachments.length > 1
      ? `Uploaded ${currentAttachments.length} pages of handwritten working for grading.`
      : (currentAttachment?.type === 'pdf'
        ? `Attached PDF document (${currentAttachment.name}) for grading.`
        : 'Uploaded handwritten working for grading.');

    const userMsg: ChatMessage = {
      id: `user_${Date.now()}`,
      role: 'user',
      content: messageContent || defaultContent,
      imageUrl: currentAttachment?.type === 'image' ? currentAttachment.uri : undefined,
      attachment: currentAttachment || undefined,
      attachments: currentAttachments.length > 1 ? currentAttachments : undefined,
      timestamp: Date.now()
    };

    setMessages(prev => [...prev, userMsg]);
    setChatMessage('');
    setUploadedAttachments([]);
    Keyboard.dismiss();
    setIsAiThinking(true);
    scrollToBottom();

    // Fast-path interactive demo for testing marked answer script
    if (messageContent.toLowerCase().includes('sample student answer') || messageContent.toLowerCase().includes('sample marked script')) {
      const sampleMarkedAsset = Image.resolveAssetSource(require('../../assets/images/sample_marked_q4.jpg'));
      const sampleCleanAsset = Image.resolveAssetSource(require('../../assets/images/sample_clean_q4.jpg'));
      const sampleImageUri = sampleMarkedAsset?.uri || sampleCleanAsset?.uri || '';

      const sampleAssessment: AssessmentResult = {
        score: 7,
        max_score: 10,
        percentage: 70,
        identified_question_number: '4',
        identified_topic: "Chemical Equilibrium & Le Chatelier's Principle",
        total_score: 7,
        total_max_score: 10,
        generated_marked_image_url: sampleImageUri,
        model_used: 'gpt-6-luna',
        overall_feedback: "Solid understanding of reversible reactions, dynamic equilibrium, and Le Chatelier's principle. 7 out of 10 marks awarded with teacher red ink corrections noted directly on the sheet.",
        annotations: [
          {
            type: 'tick',
            text: '(1/1)',
            comment: 'Correct dynamic equilibrium definition: forward rate equals backward rate.',
            box_2d: [115, 875, 145, 975],
            subpart_label: '(a)'
          },
          {
            type: 'tick',
            text: '(2/2)',
            comment: 'Correct deduction: increased pressure shifts equilibrium towards darker purple.',
            box_2d: [225, 875, 255, 975],
            subpart_label: '(b)'
          },
          {
            type: 'tick',
            text: '(1/1)',
            comment: 'Correct colour observation: mixture turns lighter purple.',
            box_2d: [340, 875, 370, 975],
            subpart_label: '(c)'
          },
          {
            type: 'tick',
            text: '(2/2)',
            comment: 'Correct mole quantities: HI = 1, I2 = 1.',
            box_2d: [435, 875, 465, 975],
            subpart_label: '(d)'
          },
          {
            type: 'tick',
            text: '(1/1)',
            comment: 'Correctly noted catalyst increases reaction rate of methanol formation.',
            box_2d: [535, 875, 565, 975],
            subpart_label: '(e)'
          },
          {
            type: 'tick',
            text: '(1/1)',
            comment: 'Correctly identified position of equilibrium shifts.',
            box_2d: [615, 875, 645, 975],
            subpart_label: '(i)'
          },
          {
            type: 'cross',
            text: '(0/1)',
            comment: 'Incorrect colour change: reaction is exothermic so cooling favours forward reaction.',
            box_2d: [705, 875, 735, 975],
            subpart_label: '(ii)'
          },
          {
            type: 'underline',
            text: 'It should turn darker purple because the reaction is exothermic and lowering the temperature favours the forward reaction (which produces the darker colour).',
            comment: 'Teacher correction: exothermic reaction favours forward product when cooled.',
            box_2d: [728, 200, 805, 900],
            subpart_label: '(ii)'
          },
          {
            type: 'total_header',
            text: 'Total: 7/10',
            comment: 'Final Score: 7/10 marks (70%)',
            box_2d: [835, 780, 865, 955]
          }
        ],
        subparts: [
          {
            part_label: '(a)',
            part_title: 'Equilibrium Definition',
            score: 1,
            max_score: 1,
            student_answer_detected: 'The term equilibrium means when the rate of the forward reaction is equal to the rate of the backward reaction.',
            marks_awarded: ['1 mark: Forward rate equals backward rate'],
            deductions: [],
            feedback: 'Accurate definition of dynamic equilibrium.'
          },
          {
            part_label: '(b)',
            part_title: 'Pressure Increase Effect',
            score: 2,
            max_score: 2,
            student_answer_detected: 'The pressure of the mixture is increased. The temperature remains constant. The colour of the gaseous mixture turns darker purple.',
            marks_awarded: ['2 marks: Pressure shift and dark purple colour change correctly observed'],
            deductions: [],
            feedback: 'Spot-on explanation of pressure effect.'
          },
          {
            part_label: '(c)',
            part_title: 'Temperature Decrease Effect',
            score: 1,
            max_score: 1,
            student_answer_detected: 'The temperature of the mixture of gases is decreased. The mixture of gases turns lighter purple.',
            marks_awarded: ['1 mark: Correct colour change observation'],
            deductions: [],
            feedback: 'Accurate.'
          },
          {
            part_label: '(d)',
            part_title: 'Equilibrium Mole Quantities',
            score: 2,
            max_score: 2,
            student_answer_detected: 'HI = 1, I2 = 1',
            marks_awarded: ['2 marks: Both mole quantities accurately determined'],
            deductions: [],
            feedback: 'Correct calculations.'
          },
          {
            part_label: '(e)',
            part_title: 'Catalyst Effect',
            score: 1,
            max_score: 1,
            student_answer_detected: 'The rate of formation of methanol increases when a catalyst is used.',
            marks_awarded: ['1 mark: Catalyst increases rate of reaction'],
            deductions: [],
            feedback: 'Correct.'
          },
          {
            part_label: '(i)',
            part_title: 'Equilibrium Position Shift',
            score: 1,
            max_score: 1,
            student_answer_detected: 'The position of equilibrium does change.',
            marks_awarded: ['1 mark: Correct statement'],
            deductions: [],
            feedback: 'Correct.'
          },
          {
            part_label: '(ii)',
            part_title: 'Exothermic Temperature Shift',
            score: 0,
            max_score: 1,
            student_answer_detected: 'The colour of the mixture of gases turns lighter purple.',
            marks_awarded: [],
            deductions: ['0 marks: Should turn darker purple'],
            teacher_correction: 'It should turn darker purple because the reaction is exothermic and lowering the temperature favours the forward reaction (which produces the darker colour).',
            feedback: 'Since forward reaction is exothermic, lowering temperature shifts equilibrium right, producing more darker purple gas.'
          }
        ],
        feedback: 'Great effort! Scored 7/10 marks with full marks across (a)-(i). Review Part (ii) temperature shifts on exothermic reactions.',
        recommended_next_step: "Review Le Chatelier's principle temperature effects for exothermic reactions."
      };

      setTimeout(() => {
        setIsAiThinking(false);
        const sampleAsstMsg: ChatMessage = {
          id: `asst_${Date.now()}`,
          role: 'assistant',
          content: `📊 **Examiner Mark Scorecard — Question 4**\n**Topic:** Chemical Equilibrium & Le Chatelier's Principle\n**Total Score:** **7 / 10 marks** (70%)\n\nHere is your marked answer sheet with authentic teacher red ink below. Tap the image to inspect the teacher markings full-screen!`,
          imageUrl: sampleImageUri,
          assessmentResult: sampleAssessment,
          timestamp: Date.now()
        };
        setMessages(prev => [...prev, sampleAsstMsg]);
        scrollToBottom();
      }, 700);
      return;
    }

    try {
      // Process through QuestionPaperTutorAgent with OpenAI LLM & full context with timeout protection
      const chatHistory = messages.map(m => ({ role: m.role, content: m.content }));
      
      const isSubmission = currentAttachments.length > 0;

      // Ensure image base64s are read for all attached pages
      const finalAttachments = await Promise.all(
        currentAttachments.map(async (att) => {
          if (att.type === 'image' && !att.base64 && att.uri) {
            try {
              const rawBase64 = await FileSystem.readAsStringAsync(att.uri, { encoding: 'base64' });
              if (rawBase64) {
                return {
                  ...att,
                  base64: `data:${att.mimeType || 'image/jpeg'};base64,${rawBase64}`
                };
              }
            } catch (readErr) {
              console.warn('Error reading image base64:', readErr);
            }
          }
          return att;
        })
      );

      const finalAttachment = finalAttachments[0] || null;
      const finalImageUris = finalAttachments
        .filter(a => a.type === 'image')
        .map(a => a.base64 || a.uri)
        .filter(Boolean) as string[];

      const currentTimeout = isSubmission ? (finalImageUris.length > 1 ? 240000 : 180000) : 60000;
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('REQUEST_TIMEOUT')), currentTimeout);
      });

      const agentPromise = QuestionPaperTutorAgent.processStudentTurn(
        sessionState,
        messageContent || defaultContent,
        isSubmission ? 'submit_answer' : 'chat',
        isSubmission ? {
          answer_file: finalAttachment,
          answer_files: finalAttachments,
          images: finalImageUris.length > 0 ? finalImageUris : undefined,
          answer_image_url: finalAttachment?.type === 'image' ? (finalAttachment.base64 || finalAttachment.uri) : undefined,
          answer_text: messageContent,
          model_override: 'gpt-6-luna'
        } : undefined,
        chatHistory
      );

      const response = await Promise.race([agentPromise, timeoutPromise]);

      setSessionState(response.newState);

      // Only associate assessmentResult and marked image on actual assessment outcome turns,
      // NOT on follow-up chat/discussion turns!
      const isAssessmentOutcome = response.ui?.type === 'assessment_scorecard' && !!response.ui?.payload?.assessment;
      const returnedAssessment = isAssessmentOutcome ? response.ui.payload.assessment : undefined;
      
      let submittedImage: string | undefined = undefined;
      let submittedImages: string[] | undefined = undefined;
      if (isAssessmentOutcome) {
        if (finalImageUris.length > 1) {
          submittedImages = finalImageUris;
        }
        submittedImage = finalAttachment?.type === 'image' ? (finalAttachment.uri || finalAttachment.base64) : undefined;
        if (!submittedImage && response.ui?.payload?.answer_image_url) {
          submittedImage = response.ui.payload.answer_image_url;
        }
        if (!submittedImage && returnedAssessment?.generated_marked_image_url) {
          submittedImage = returnedAssessment.generated_marked_image_url;
        }
        if (!submittedImage && returnedAssessment?.pages?.[0]?.original_image_url) {
          submittedImage = returnedAssessment.pages[0].original_image_url;
        }
      } else if (response.ui?.payload?.imageUrl) {
        submittedImage = response.ui.payload.imageUrl;
      }

      const canonicalImages = (returnedAssessment?.pages && returnedAssessment.pages.length > 0)
        ? returnedAssessment.pages.map((p: any) => p.original_image_url)
        : submittedImages;

      const assistantMsg: ChatMessage = {
        id: `asst_${Date.now()}`,
        role: 'assistant',
        content: response.replyText,
        imageUrl: returnedAssessment?.pages?.[0]?.original_image_url || submittedImage,
        imageUrls: canonicalImages,
        assessmentResult: returnedAssessment,
        interactiveOptions: response.interactiveOptions,
        timestamp: Date.now()
      };

      setMessages(prev => [...prev, assistantMsg]);

      // Save state to Supabase in background
      TutorAgentTools.save_learning_session(response.newState, [...messages, userMsg, assistantMsg]);
    } catch (e: any) {
      console.error('Agent error or timeout:', e);
      const isTimeout = e?.message === 'REQUEST_TIMEOUT' || e?.name === 'AbortError';

      const errorMessage = isTimeout
        ? "The AI Tutor took too long to respond. Please check your connection and tap **Resend Prompt** below to try again."
        : "I ran into a connection issue reaching the AI Tutor. Tap **Resend Prompt** below to try again.";

      setMessages(prev => [
        ...prev,
        {
          id: `err_${Date.now()}`,
          role: 'assistant',
          content: errorMessage,
          isError: true,
          canRetry: true,
          retryPayload: {
            text: messageContent,
            attachment: currentAttachment
          },
          timestamp: Date.now()
        }
      ]);
    } finally {
      setIsAiThinking(false);
      scrollToBottom();
    }
  };

  const handleReevaluateGpt4o = async (msg: ChatMessage) => {
    if (!sessionState || !msg.imageUrl) return;
    setIsReevaluatingId(msg.id);
    try {
      const chatHistory = messages.map(m => ({ role: m.role, content: m.content }));
      const response = await QuestionPaperTutorAgent.processStudentTurn(
        sessionState,
        'Please re-evaluate this handwritten script using GPT-6 Luna vision with maximum precision.',
        'submit_answer',
        {
          answer_image_url: msg.imageUrl,
          model_override: 'gpt-6-luna'
        },
        chatHistory
      );
      setSessionState(response.newState);
      const updatedAssessment = response.ui?.payload?.assessment || response.newState?.assessment_result || undefined;
      setMessages(prev =>
        prev.map(m =>
          m.id === msg.id
            ? {
                ...m,
                content: response.replyText,
                assessmentResult: updatedAssessment || m.assessmentResult
              }
            : m
        )
      );
    } catch (err) {
      console.warn('Re-evaluation error:', err);
      Alert.alert('Re-grade Error', 'Could not complete re-grading with GPT-6 Luna. Please try again.');
    } finally {
      setIsReevaluatingId(null);
    }
  };

  const handleRetry = (errorMsgId: string, text: string, attachment?: AttachmentData | null) => {
    setMessages(prev => prev.filter(m => m.id !== errorMsgId));
    handleSendMessage(text, attachment);
  };

  const handlePickDocument = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/pdf', 'image/*'],
        copyToCacheDirectory: true,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const newFiles: AttachmentData[] = [];
        for (const file of result.assets) {
          const isPdf = file.mimeType?.includes('pdf') || file.name.toLowerCase().endsWith('.pdf');
          let base64: string | undefined = undefined;
          try {
            if (!isPdf) {
              const rawBase64 = await FileSystem.readAsStringAsync(file.uri, {
                encoding: 'base64'
              });
              if (rawBase64) {
                base64 = `data:${file.mimeType || 'image/jpeg'};base64,${rawBase64}`;
              }
            }
          } catch (_e) {}

          newFiles.push({
            uri: file.uri,
            name: file.name || (isPdf ? 'Document.pdf' : 'Image.jpg'),
            type: isPdf ? 'pdf' : 'image',
            mimeType: file.mimeType || (isPdf ? 'application/pdf' : 'image/jpeg'),
            size: file.size,
            base64
          });
        }

        setUploadedAttachments(prev => [...prev, ...newFiles]);
      }
    } catch (err) {
      console.warn('Document picker error:', err);
      Alert.alert('Document Error', 'Unable to load the selected document. Please try again.');
    }
  };

  const handlePickImage = async () => {
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Permission Needed', 'Please allow photo access in Settings to upload your working.');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: 'images',
        allowsEditing: false,
        allowsMultipleSelection: true,
        selectionLimit: 0,
        orderedSelection: true,
        quality: 0.7,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const newPhotos: AttachmentData[] = [];
        for (let i = 0; i < result.assets.length; i++) {
          const asset = result.assets[i];
          // Compress/downsample to ≤1280px before reading base64 to keep payload small
          let workingUri = asset.uri;
          let base64Data: string | undefined;
          try {
            const optimized = await optimizeImageForUpload(asset.uri);
            workingUri = optimized.uri;
            base64Data = optimized.base64;
          } catch (_e) {
            // fallback: read raw
            try {
              const rawB64 = await FileSystem.readAsStringAsync(asset.uri, { encoding: 'base64' });
              if (rawB64) base64Data = `data:${asset.mimeType || 'image/jpeg'};base64,${rawB64}`;
            } catch (e) {
              console.warn('Error reading base64 in picker:', e);
            }
          }
          newPhotos.push({
            uri: workingUri,
            name: asset.fileName || (result.assets.length > 1 ? `working_page_${i + 1}.jpg` : 'handwritten_working.jpg'),
            type: 'image',
            mimeType: asset.mimeType || 'image/jpeg',
            size: asset.fileSize,
            base64: base64Data
          });
        }
        setUploadedAttachments(prev => [...prev, ...newPhotos]);
      }
    } catch (err) {
      console.warn('Image picker error:', err);
      Alert.alert('Photo Access', 'Unable to open photos library. Please try again.');
    }
  };

  const handleTakePhoto = async () => {
    try {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Permission Needed', 'Please allow camera access in Settings to photograph your working.');
        return;
      }
      const result = await ImagePicker.launchCameraAsync({
        allowsEditing: false,
        quality: 0.7,
      });
      if (!result.canceled && result.assets && result.assets[0]) {
        const asset = result.assets[0];
        // Compress before reading base64
        let workingUri = asset.uri;
        let base64Data: string | undefined;
        try {
          const optimized = await optimizeImageForUpload(asset.uri);
          workingUri = optimized.uri;
          base64Data = optimized.base64;
        } catch (_e) {
          try {
            const rawB64 = await FileSystem.readAsStringAsync(asset.uri, { encoding: 'base64' });
            if (rawB64) base64Data = `data:${asset.mimeType || 'image/jpeg'};base64,${rawB64}`;
          } catch (e) {
            console.warn('Error reading base64 in camera:', e);
          }
        }
        setUploadedAttachments(prev => [
          ...prev,
          {
            uri: workingUri,
            name: asset.fileName || `camera_photo_${prev.length + 1}.jpg`,
            type: 'image',
            mimeType: asset.mimeType || 'image/jpeg',
            size: asset.fileSize,
            base64: base64Data
          }
        ]);
      }
    } catch (err: any) {
      console.warn('Camera not available on simulator, falling back to photo library:', err);
      handlePickImage();
    }
  };

  const handleOpenAttachmentOptions = () => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch (_h) {}

    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          title: 'Upload Working',
          message: 'Choose how to provide your answer for examiner grading',
          options: ['Cancel', 'Take Photo', 'Choose from Gallery', 'Upload Document / PDF'],
          cancelButtonIndex: 0,
        },
        (buttonIndex) => {
          if (buttonIndex === 1) {
            handleTakePhoto();
          } else if (buttonIndex === 2) {
            handlePickImage();
          } else if (buttonIndex === 3) {
            handlePickDocument();
          }
        }
      );
    } else {
      setShowAttachmentMenu(true);
    }
  };

  const handleResetChat = () => {
    if (!sessionState) return;
    const firstQ = questions[0] || BUILTIN_QUESTIONS['chemistry'][0];
    const freshSession = QuestionPaperTutorAgent.createInitialState(sessionState.paper_context, studentId, firstQ);
    setSessionState(freshSession);
    setUploadedAttachments([]);
    setUploadedAttachment(null);
    setChatMessage('');
    setMessages([
      {
        id: `welcome_${Date.now()}`,
        role: 'assistant',
        content: `Hi, I'm your Senior Examiner AI. You can ask anything about this question paper, or upload photos and PDF documents of your working to get graded with complete mark schemes!`,
        timestamp: Date.now()
      }
    ]);
  };
   // Quick suggestion chips
  const QUICK_SUGGESTIONS = [
    { id: 'hint', label: '💡 Give a hint', prompt: 'Can you give me a progressive hint for this question without spoiling the final answer?' },
    { id: 'method', label: '📐 Step-by-step method', prompt: 'Can you explain the step-by-step solution method for this question?' },
    { id: 'scheme', label: '📋 Mark scheme criteria', prompt: 'What are the exact examiner mark scheme criteria and point allocations for this question?' },
    { id: 'mark', label: '✍️ Mark my working', prompt: 'I want to submit my handwritten working for you to mark against the official scheme.' },
  ];

  const handleSelectQuickSuggestion = (prompt: string) => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch (_h) {}
    handleSendMessage(prompt);
  };

  const activeQNum = sessionState?.question_number || '1';
  const activeQ = questions.find(q => String(q.question_number) === String(activeQNum)) || questions[0];

  if (!visible) return null;

  return (
    <View style={styles.modalOverlay}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={[styles.modalContainer, { backgroundColor: colors.background }]}
      >
        {/* Header Bar */}
        <View style={[styles.header, { borderBottomColor: colors.border, backgroundColor: colors.surface }]}>
          <View style={[styles.dragHandle, { backgroundColor: colors.border || '#CBD5E1' }]} />
          <View style={styles.headerRow}>
            <View style={styles.headerLeft}>
              <View style={[styles.avatarBadge, { backgroundColor: `${colors.primary}14` }]}>
                <Bot size={20} color={colors.primary} />
                <View style={[styles.onlineStatusDot, { borderColor: colors.surface }]} />
              </View>
              <View style={{ flex: 1 }}>
                <View style={styles.headerTitleRow}>
                  <Text style={[styles.headerTitle, { color: colors.text }]}>AI Exam Tutor</Text>
                  <View style={[styles.activePillBadge, { backgroundColor: `${colors.primary}12`, borderColor: `${colors.primary}25` }]}>
                    <Sparkles size={10} color={colors.primary} style={{ marginRight: 3 }} />
                    <Text style={[styles.activePillText, { color: colors.primary }]}>
                      Q{activeQNum}{activeQ?.marks ? ` • ${activeQ.marks}m` : ''}
                    </Text>
                  </View>
                </View>
                <Text style={[styles.headerSubtitle, { color: colors.textSecondary }]} numberOfLines={1}>
                  {paperTitle || subject || 'Cambridge Past Paper'} • Senior Examiner
                </Text>
              </View>
            </View>

            <View style={styles.headerRightActions}>
              <Pressable
                onPress={() => {
                  try {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  } catch (_h) {}
                  handleResetChat();
                }}
                style={({ pressed }) => [
                  styles.headerIconButton,
                  { backgroundColor: colors.surfaceHighlight || '#F1F5F9', borderColor: colors.border },
                  pressed && { opacity: 0.7, transform: [{ scale: 0.94 }] }
                ]}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                accessibilityLabel="Restart Chat"
              >
                <RotateCcw size={15} color={colors.textSecondary} />
              </Pressable>

              <Pressable
                onPress={() => {
                  try {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  } catch (_h) {}
                  onClose();
                }}
                style={({ pressed }) => [
                  styles.headerIconButton,
                  { backgroundColor: colors.surfaceHighlight || '#F1F5F9', borderColor: colors.border },
                  pressed && { opacity: 0.7, transform: [{ scale: 0.94 }] }
                ]}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                accessibilityLabel="Close Tutor"
              >
                <X size={17} color={colors.text} />
              </Pressable>
            </View>
          </View>
        </View>

        {/* Chat Messages Stream */}
        <ScrollView
          ref={scrollViewRef}
          style={styles.chatScroll}
          contentContainerStyle={styles.chatContent}
          showsVerticalScrollIndicator={false}
        >
          {messages.map((msg) => {
            const isUser = msg.role === 'user';
            return (
              <View
                key={msg.id}
                style={[
                  styles.messageRow,
                  isUser ? styles.userRow : styles.aiRow
                ]}
              >
                {!isUser ? (
                  <View style={styles.aiMessageContainer}>
                    {/* Assistant Message Header Bar */}
                    <View style={styles.aiMessageHeader}>
                      <View style={styles.aiMessageHeaderLeft}>
                        <View style={[styles.miniAvatar, { backgroundColor: `${colors.primary}15` }]}>
                          <Bot size={11} color={colors.primary} />
                        </View>
                        <Text style={[styles.aiSenderName, { color: colors.text }]}>
                          Mentora Tutor
                        </Text>
                        <View style={[styles.aiRoleBadge, { backgroundColor: `${colors.primary}10` }]}>
                          <Text style={[styles.aiRoleBadgeText, { color: colors.primary }]}>
                            Examiner
                          </Text>
                        </View>
                      </View>

                      <Pressable
                        onPress={() => handleShareMessage(msg.content, msg.id)}
                        style={({ pressed }) => [
                          styles.actionIconBtn,
                          pressed && { opacity: 0.6 }
                        ]}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        accessibilityLabel="Share or copy solution"
                      >
                        {copiedMessageId === msg.id ? (
                          <View style={styles.copiedRow}>
                            <CheckCircle2 size={12} color={colors.success || '#10B981'} />
                            <Text style={[styles.copiedText, { color: colors.success || '#10B981' }]}>Copied</Text>
                          </View>
                        ) : (
                          <Share2 size={12} color={colors.textTertiary || '#94A3B8'} />
                        )}
                      </Pressable>
                    </View>

                    {/* AI Message Bubble */}
                    <View
                      style={[
                        styles.messageBubble,
                        styles.aiBubble,
                        {
                          backgroundColor: colors.surface,
                          borderColor: msg.isError ? (colors.error || '#EF4444') : (colors.cardBorder || colors.border),
                        },
                        msg.interactiveOptions && styles.aiBubbleWithOptions
                      ]}
                    >
                      {/* Photo / Image Attachment */}
                      {(msg.imageUrl || (msg.attachment && msg.attachment.type === 'image')) && !(!isUser && msg.assessmentResult) && (
                        <Pressable 
                          onPress={() => setSelectedFullImage(msg.attachment?.uri || msg.imageUrl || null)}
                          style={({ pressed }) => [styles.chatImageWrapper, pressed && { opacity: 0.9 }]}
                        >
                          <Image 
                            source={{ uri: msg.attachment?.uri || msg.imageUrl }} 
                            style={styles.chatAttachedImage} 
                            resizeMode="contain" 
                          />
                        </Pressable>
                      )}

                      {/* Visual Marked Answer Sheet with Teacher Red Ink */}
                      {!isUser && msg.assessmentResult && (
                        msg.imageUrl ||
                        msg.assessmentResult.generated_marked_image_url ||
                        (msg.imageUrls && msg.imageUrls.length > 0) ||
                        (msg.assessmentResult.pages && msg.assessmentResult.pages.length > 0)
                      ) && (
                        <MarkedAnswerSheetViewer
                          imageUri={msg.assessmentResult.pages?.[0]?.original_image_url || msg.imageUrl || msg.assessmentResult.generated_marked_image_url || ''}
                          imageUris={msg.assessmentResult.pages?.map((p: any) => p.original_image_url) || msg.imageUrls}
                          assessment={msg.assessmentResult}
                          onReevaluateWithGpt4o={() => handleReevaluateGpt4o(msg)}
                          isReevaluating={isReevaluatingId === msg.id}
                          onUpdateAssessment={(updated) => {
                            setMessages(prev => prev.map(m => m.id === msg.id ? { ...m, assessmentResult: updated } : m));
                          }}
                        />
                      )}

                      {/* PDF Card */}
                      {msg.attachment && msg.attachment.type === 'pdf' && (
                        <View style={[styles.chatPdfCard, styles.aiPdfCard]}>
                          <View style={styles.pdfIconBadge}>
                            <FileText size={18} color="#EF4444" />
                          </View>
                          <View style={styles.pdfCardInfo}>
                            <Text style={[styles.pdfCardTitle, { color: colors.text }]} numberOfLines={1}>
                              {msg.attachment.name}
                            </Text>
                            <Text style={[styles.pdfCardSubtitle, { color: colors.textSecondary }]}>
                              {msg.attachment.size ? `${(msg.attachment.size / 1024).toFixed(0)} KB • ` : ''}PDF Submission
                            </Text>
                          </View>
                        </View>
                      )}

                      {msg.isError && (
                        <View style={styles.errorHeaderRow}>
                          <AlertCircle size={14} color={colors.error || '#EF4444'} style={{ marginRight: 6 }} />
                          <Text style={[styles.errorHeaderTitle, { color: colors.error || '#EF4444' }]}>
                            Connection Timeout
                          </Text>
                        </View>
                      )}

                      <FormattedMessage content={msg.content} isUser={false} />

                      {/* Retry Action Button on Timeout/Error */}
                      {!isUser && msg.canRetry && msg.retryPayload && (
                        <View style={styles.retryActionContainer}>
                          <Pressable
                            style={({ pressed }) => [
                              styles.retryButton,
                              { backgroundColor: colors.surfaceHighlight || '#F1F5F9', borderColor: colors.border },
                              pressed && { opacity: 0.75, transform: [{ scale: 0.98 }] }
                            ]}
                            onPress={() => handleRetry(msg.id, msg.retryPayload!.text, msg.retryPayload!.attachment)}
                          >
                            <RefreshCw size={13} color={colors.text} style={{ marginRight: 6 }} />
                            <Text style={[styles.retryButtonText, { color: colors.text }]}>
                              Resend Prompt
                            </Text>
                          </Pressable>
                        </View>
                      )}

                      {/* Dynamic Contextual Learning Options */}
                      {!isUser && msg.interactiveOptions && msg.interactiveOptions.options && (
                        <View style={styles.interactiveCardsContainer}>
                          {msg.interactiveOptions.options.map((opt) => {
                            const IconComp = 
                              opt.icon === 'Lightbulb' ? Lightbulb :
                              opt.icon === 'Copy' ? Copy :
                              opt.icon === 'Edit3' ? Edit3 :
                              BookOpen;

                            return (
                              <Pressable
                                key={opt.id}
                                style={({ pressed }) => [
                                  styles.optionCard,
                                  { backgroundColor: colors.background, borderColor: colors.border },
                                  pressed && { 
                                    borderColor: colors.primary, 
                                    backgroundColor: `${colors.primary}12`,
                                    transform: [{ scale: 0.98 }]
                                  }
                                ]}
                                onPress={() => handleSendMessage(opt.action_prompt)}
                              >
                                <View style={styles.optionCardHeader}>
                                  <View style={[styles.optionIconBadge, { backgroundColor: `${colors.primary}18` }]}>
                                    <IconComp size={13} color={colors.primary} />
                                  </View>
                                  <Text style={[styles.optionCardTitle, { color: colors.text }]} numberOfLines={1}>
                                    {opt.title}
                                  </Text>
                                  <ChevronRight size={14} color={colors.textSecondary} />
                                </View>
                                <Text style={[styles.optionCardSubtitle, { color: colors.textSecondary }]}>
                                  {opt.subtitle}
                                </Text>
                              </Pressable>
                            );
                          })}
                        </View>
                      )}
                    </View>
                  </View>
                ) : (
                  <View
                    style={[
                      styles.messageBubble,
                      styles.userBubble,
                      { backgroundColor: colors.primary }
                    ]}
                  >
                    {/* Multi-image gallery grid — shown when student uploads multiple pages */}
                    {msg.attachments && msg.attachments.length > 1 ? (
                      <View style={styles.multiImageGrid}>
                        {msg.attachments.map((att, attIdx) => att.type === 'image' ? (
                          <Pressable
                            key={`att_${attIdx}`}
                            onPress={() => setSelectedFullImage(att.uri || null)}
                            style={({ pressed }) => [styles.multiImageCell, pressed && { opacity: 0.85 }]}
                          >
                            <Image
                              source={{ uri: att.uri }}
                              style={styles.multiImageThumb}
                              resizeMode="cover"
                            />
                            <View style={styles.multiImageBadge}>
                              <Text style={styles.multiImageBadgeText}>P{attIdx + 1}</Text>
                            </View>
                          </Pressable>
                        ) : null)}
                        <Text style={styles.multiImageCountLabel}>
                          {msg.attachments.filter(a => a.type === 'image').length} pages sent
                        </Text>
                      </View>
                    ) : (
                      /* Single photo / attachment */
                      (msg.imageUrl || (msg.attachment && msg.attachment.type === 'image')) && (
                        <Pressable
                          onPress={() => setSelectedFullImage(msg.attachment?.uri || msg.imageUrl || null)}
                          style={({ pressed }) => [styles.chatImageWrapper, pressed && { opacity: 0.9 }]}
                        >
                          <Image
                            source={{ uri: msg.attachment?.uri || msg.imageUrl }}
                            style={styles.chatAttachedImage}
                            resizeMode="contain"
                          />
                        </Pressable>
                      )
                    )}

                    {/* PDF Card */}
                    {msg.attachment && msg.attachment.type === 'pdf' && (
                      <View style={[styles.chatPdfCard, styles.userPdfCard]}>
                        <View style={styles.pdfIconBadge}>
                          <FileText size={18} color="#EF4444" />
                        </View>
                        <View style={styles.pdfCardInfo}>
                          <Text style={[styles.pdfCardTitle, { color: '#FFFFFF' }]} numberOfLines={1}>
                            {msg.attachment.name}
                          </Text>
                          <Text style={[styles.pdfCardSubtitle, { color: 'rgba(255,255,255,0.75)' }]}>
                            {msg.attachment.size ? `${(msg.attachment.size / 1024).toFixed(0)} KB • ` : ''}PDF Submission
                          </Text>
                        </View>
                      </View>
                    )}

                    <FormattedMessage content={msg.content} isUser={true} />
                  </View>
                )}
              </View>
            );
          })}

          {isAiThinking && (
            <View style={[styles.messageRow, styles.aiRow]}>
              <View style={styles.aiMessageContainer}>
                <View style={styles.aiMessageHeader}>
                  <View style={styles.aiMessageHeaderLeft}>
                    <View style={[styles.miniAvatar, { backgroundColor: `${colors.primary}15` }]}>
                      <Bot size={11} color={colors.primary} />
                    </View>
                    <Text style={[styles.aiSenderName, { color: colors.text }]}>Mentora Tutor</Text>
                  </View>
                </View>
                <View style={[styles.aiBubble, styles.thinkingBubble, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <ActivityIndicator size="small" color={colors.primary} />
                  <Text style={[styles.thinkingText, { color: colors.textSecondary }]}>
                    Senior Examiner is thinking & evaluating mark scheme...
                  </Text>
                </View>
              </View>
            </View>
          )}
        </ScrollView>

        {/* Upload Attachment Preview (Single or Multiple Photos/PDF) */}
        {uploadedAttachments.length > 0 && (
          <View style={[styles.attachmentPreviewBar, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.attachmentScrollContent}
            >
              {uploadedAttachments.map((att, idx) => (
                <View
                  key={`att_${idx}_${att.uri}`}
                  style={[
                    styles.attachmentItemCard,
                    { backgroundColor: colors.surfaceHighlight || '#F8FAFC', borderColor: colors.border }
                  ]}
                >
                  {att.type === 'image' ? (
                    <Image source={{ uri: att.uri }} style={styles.attachmentThumbnail} />
                  ) : (
                    <View style={[styles.pdfPreviewBadge, { backgroundColor: '#FEE2E2' }]}>
                      <FileText size={16} color="#EF4444" />
                    </View>
                  )}
                  <View style={styles.attachmentPreviewTextContainer}>
                    <Text style={[styles.attachmentPreviewTitle, { color: colors.text }]} numberOfLines={1}>
                      {att.name}
                    </Text>
                    <Text style={[styles.attachmentPreviewSubtitle, { color: colors.textSecondary }]}>
                      {att.type === 'pdf' ? 'PDF document' : `Page ${idx + 1}`}
                    </Text>
                  </View>
                  <Pressable
                    onPress={() => {
                      try {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      } catch (_h) {}
                      setUploadedAttachments(prev => prev.filter((_, i) => i !== idx));
                    }}
                    style={styles.removeAttachmentBtn}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    accessibilityLabel={`Remove attachment ${idx + 1}`}
                  >
                    <X size={14} color={colors.textSecondary} />
                  </Pressable>
                </View>
              ))}
            </ScrollView>
          </View>
        )}

        {/* Quick Suggestion Chips */}
        {!isAiThinking && (
          <View style={[styles.suggestionsRow, { backgroundColor: colors.surface, borderTopColor: colors.border }]}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.suggestionsScrollContent}
            >
              {QUICK_SUGGESTIONS.map((sug) => (
                <Pressable
                  key={sug.id}
                  style={({ pressed }) => [
                    styles.suggestionChip,
                    {
                      backgroundColor: colors.surfaceHighlight || '#F8FAFC',
                      borderColor: colors.border
                    },
                    pressed && {
                      backgroundColor: `${colors.primary}12`,
                      borderColor: colors.primary,
                      transform: [{ scale: 0.97 }]
                    }
                  ]}
                  onPress={() => handleSelectQuickSuggestion(sug.prompt)}
                >
                  <Text style={[styles.suggestionChipText, { color: colors.text }]}>
                    {sug.label}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        )}

        {/* Clean Bottom Chat Input Bar */}
        <View style={[styles.inputBar, { backgroundColor: colors.surface, borderTopColor: colors.border }]}>
          {/* Text Input Pill with Embedded Plus Button & Send Button */}
          <View
            style={[
              styles.textInputWrapper,
              {
                backgroundColor: colors.backgroundElement || colors.surfaceHighlight || '#F8FAFC',
                borderColor: isInputFocused ? colors.primary : colors.border
              }
            ]}
          >
            {/* Embedded Plus Attachment Button */}
            <Pressable
              style={({ pressed }) => [
                styles.embeddedPlusBtn,
                { backgroundColor: colors.surfaceHighlight || '#F1F5F9', borderColor: colors.border },
                pressed && { opacity: 0.7, transform: [{ scale: 0.92 }] }
              ]}
              onPress={handleOpenAttachmentOptions}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityLabel="Add photo or document"
            >
              <Plus size={18} color={colors.textSecondary || '#64748B'} strokeWidth={2.4} />
            </Pressable>

            <TextInput
              style={[styles.textInput, { color: colors.text }]}
              placeholder="Ask a question or upload working..."
              placeholderTextColor={colors.textTertiary || '#94A3B8'}
              value={chatMessage}
              onChangeText={setChatMessage}
              onFocus={() => setIsInputFocused(true)}
              onBlur={() => setIsInputFocused(false)}
              multiline
            />

            <Pressable
              style={({ pressed }) => [
                styles.sendBtn,
                {
                  backgroundColor: (chatMessage.trim() || uploadedAttachments.length > 0)
                    ? colors.primary
                    : (colors.border || '#E2E8F0')
                },
                pressed && { transform: [{ scale: 0.92 }] }
              ]}
              onPress={() => {
                try {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                } catch (_h) {}
                handleSendMessage();
              }}
              disabled={(!chatMessage.trim() && uploadedAttachments.length === 0) || isAiThinking}
            >
              <Send
                color={(chatMessage.trim() || uploadedAttachments.length > 0) ? '#FFFFFF' : (colors.textTertiary || '#94A3B8')}
                size={15}
              />
            </Pressable>
          </View>
        </View>

        {/* Attachment Options Modal Sheet (Android / Web & Fallback) */}
        <Modal
          visible={showAttachmentMenu}
          transparent
          animationType="fade"
          onRequestClose={() => setShowAttachmentMenu(false)}
        >
          <Pressable
            style={styles.actionSheetBackdrop}
            onPress={() => setShowAttachmentMenu(false)}
          >
            <View
              style={[
                styles.actionSheetCard,
                { backgroundColor: colors.surface, borderColor: colors.border }
              ]}
            >
              <View style={styles.actionSheetHeader}>
                <Text style={[styles.actionSheetTitle, { color: colors.text }]}>Upload Working</Text>
                <Text style={[styles.actionSheetSubtitle, { color: colors.textSecondary }]}>
                  Choose how you want to provide your answer
                </Text>
              </View>

              <Pressable
                style={({ pressed }) => [
                  styles.actionSheetOption,
                  { backgroundColor: colors.surfaceHighlight || '#F8FAFC', borderColor: colors.border },
                  pressed && { opacity: 0.7 }
                ]}
                onPress={() => {
                  setShowAttachmentMenu(false);
                  setTimeout(() => handleTakePhoto(), 200);
                }}
              >
                <View style={[styles.actionSheetIconCircle, { backgroundColor: '#E0F2FE' }]}>
                  <Camera size={20} color="#0284C7" />
                </View>
                <View style={styles.actionSheetOptionTextContainer}>
                  <Text style={[styles.actionSheetOptionTitle, { color: colors.text }]}>Take Photo</Text>
                  <Text style={[styles.actionSheetOptionDesc, { color: colors.textSecondary }]}>
                    Use camera to photograph handwritten work
                  </Text>
                </View>
              </Pressable>

              <Pressable
                style={({ pressed }) => [
                  styles.actionSheetOption,
                  { backgroundColor: colors.surfaceHighlight || '#F8FAFC', borderColor: colors.border },
                  pressed && { opacity: 0.7 }
                ]}
                onPress={() => {
                  setShowAttachmentMenu(false);
                  setTimeout(() => handlePickImage(), 200);
                }}
              >
                <View style={[styles.actionSheetIconCircle, { backgroundColor: '#F3E8FF' }]}>
                  <ImageIcon size={20} color="#9333EA" />
                </View>
                <View style={styles.actionSheetOptionTextContainer}>
                  <Text style={[styles.actionSheetOptionTitle, { color: colors.text }]}>Choose from Gallery</Text>
                  <Text style={[styles.actionSheetOptionDesc, { color: colors.textSecondary }]}>
                    Select photos from your library
                  </Text>
                </View>
              </Pressable>

              <Pressable
                style={({ pressed }) => [
                  styles.actionSheetOption,
                  { backgroundColor: colors.surfaceHighlight || '#F8FAFC', borderColor: colors.border },
                  pressed && { opacity: 0.7 }
                ]}
                onPress={() => {
                  setShowAttachmentMenu(false);
                  setTimeout(() => handlePickDocument(), 200);
                }}
              >
                <View style={[styles.actionSheetIconCircle, { backgroundColor: '#FEE2E2' }]}>
                  <FileText size={20} color="#DC2626" />
                </View>
                <View style={styles.actionSheetOptionTextContainer}>
                  <Text style={[styles.actionSheetOptionTitle, { color: colors.text }]}>Upload Document</Text>
                  <Text style={[styles.actionSheetOptionDesc, { color: colors.textSecondary }]}>
                    Upload PDF question paper or answers
                  </Text>
                </View>
              </Pressable>

              <Pressable
                style={[styles.actionSheetCancelBtn, { borderColor: colors.border }]}
                onPress={() => setShowAttachmentMenu(false)}
              >
                <Text style={[styles.actionSheetCancelText, { color: colors.textSecondary }]}>Cancel</Text>
              </Pressable>
            </View>
          </Pressable>
        </Modal>

        {/* Full-Screen Image Viewer Modal */}
        <Modal
          visible={!!selectedFullImage}
          transparent
          animationType="fade"
          onRequestClose={() => setSelectedFullImage(null)}
        >
          <View style={styles.fullImageModalOverlay}>
            <Pressable 
              style={styles.fullImageCloseBtn}
              onPress={() => setSelectedFullImage(null)}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            >
              <X size={22} color="#FFFFFF" />
            </Pressable>
            {selectedFullImage && (
              <Image 
                source={{ uri: selectedFullImage }} 
                style={styles.fullImage}
                resizeMode="contain" 
              />
            )}
          </View>
        </Modal>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
    zIndex: 99999,
    elevation: 20,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  modalContainer: {
    height: SCREEN_HEIGHT * 0.88,
    maxHeight: '92%',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.12,
    shadowRadius: 18,
    elevation: 25,
  },
  header: {
    paddingTop: 10,
    paddingBottom: spacing.sm + 2,
    borderBottomWidth: 1,
  },
  dragHandle: {
    width: 40,
    height: 4.5,
    borderRadius: 3,
    backgroundColor: '#CBD5E1',
    alignSelf: 'center',
    marginBottom: 10,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md + 2,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm + 2,
    flex: 1,
    marginRight: spacing.sm,
  },
  avatarBadge: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  onlineStatusDot: {
    width: 9,
    height: 9,
    borderRadius: 4.5,
    backgroundColor: '#10B981',
    position: 'absolute',
    bottom: -1,
    right: -1,
    borderWidth: 2,
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerTitle: {
    fontSize: 16,
    fontFamily: 'Outfit_700Bold',
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  activePillBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
    borderWidth: 1,
  },
  activePillText: {
    fontSize: 11,
    fontFamily: 'Outfit_600SemiBold',
    fontWeight: '600',
  },
  headerSubtitle: {
    fontSize: 12,
    fontFamily: 'Outfit_400Regular',
    marginTop: 2,
  },
  headerRightActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerIconButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chatScroll: {
    flex: 1,
  },
  chatContent: {
    padding: spacing.md,
    paddingBottom: spacing.lg,
  },
  messageRow: {
    flexDirection: 'row',
    marginBottom: spacing.md + 2,
    alignItems: 'flex-start',
    gap: 8,
  },
  userRow: {
    justifyContent: 'flex-end',
  },
  aiRow: {
    justifyContent: 'flex-start',
  },
  aiMessageContainer: {
    maxWidth: '94%',
    width: '94%',
  },
  aiMessageHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
    paddingHorizontal: 4,
  },
  aiMessageHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  miniAvatar: {
    width: 20,
    height: 20,
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
  },
  aiSenderName: {
    fontSize: 12,
    fontFamily: 'Outfit_600SemiBold',
    fontWeight: '600',
  },
  aiRoleBadge: {
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderRadius: 6,
  },
  aiRoleBadgeText: {
    fontSize: 10,
    fontFamily: 'Outfit_600SemiBold',
    fontWeight: '600',
  },
  actionIconBtn: {
    padding: 4,
  },
  copiedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  copiedText: {
    fontSize: 11,
    fontFamily: 'Outfit_600SemiBold',
    fontWeight: '600',
  },
  messageAvatar: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
  messageBubble: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 18,
  },
  userBubble: {
    maxWidth: '84%',
    borderBottomRightRadius: 4,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 1.5 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  aiBubble: {
    borderTopLeftRadius: 6,
    borderWidth: 1,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 1,
  },
  aiBubbleWithOptions: {
    maxWidth: '100%',
  },
  interactiveCardsContainer: {
    marginTop: spacing.sm + 2,
    gap: 8,
  },
  optionCard: {
    padding: spacing.sm + 2,
    borderRadius: borderRadius.md,
    borderWidth: 1,
  },
  optionCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 2,
  },
  optionIconBadge: {
    width: 22,
    height: 22,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionCardTitle: {
    flex: 1,
    fontSize: typography.sizes.xs + 0.5,
    fontWeight: typography.weights.semibold,
  },
  optionCardSubtitle: {
    fontSize: 11.5,
    lineHeight: 16,
    marginLeft: 30,
  },
  messageText: {
    fontSize: typography.sizes.sm,
    lineHeight: 21,
  },
  errorHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  errorHeaderTitle: {
    fontSize: 12,
    fontWeight: typography.weights.semibold,
    fontFamily: 'Outfit_600SemiBold',
  },
  retryActionContainer: {
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.06)',
    alignItems: 'flex-start',
  },
  retryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: borderRadius.md,
    borderWidth: 1,
  },
  retryButtonText: {
    fontSize: typography.sizes.xs,
    fontWeight: typography.weights.semibold,
    fontFamily: 'Outfit_600SemiBold',
  },
  chatImageWrapper: {
    marginBottom: spacing.xs,
    borderRadius: borderRadius.md,
    overflow: 'hidden',
  },
  chatAttachedImage: {
    width: 230,
    height: 180,
    borderRadius: borderRadius.md,
    backgroundColor: 'rgba(0, 0, 0, 0.04)',
  },
  multiImageGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 5,
    marginBottom: spacing.xs,
    maxWidth: 250,
  },
  multiImageCell: {
    position: 'relative',
    width: 116,
    height: 90,
    borderRadius: 8,
    overflow: 'hidden',
  },
  multiImageThumb: {
    width: '100%',
    height: '100%',
  },
  multiImageBadge: {
    position: 'absolute',
    top: 4,
    left: 4,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: 5,
    paddingHorizontal: 5,
    paddingVertical: 2,
  },
  multiImageBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  multiImageCountLabel: {
    width: '100%',
    fontSize: 11,
    color: 'rgba(255,255,255,0.75)',
    fontWeight: '500',
    marginTop: 2,
  },
  fullImageModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.94)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  fullImageCloseBtn: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 54 : 32,
    right: 20,
    zIndex: 10,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  fullImage: {
    width: '94%',
    height: '82%',
  },
  chatPdfCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.sm,
    borderRadius: borderRadius.md,
    marginBottom: spacing.xs,
    gap: 8,
    maxWidth: 240,
  },
  userPdfCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.18)',
  },
  aiPdfCard: {
    backgroundColor: 'rgba(0, 0, 0, 0.04)',
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.08)',
  },
  pdfIconBadge: {
    width: 32,
    height: 32,
    borderRadius: borderRadius.sm,
    backgroundColor: '#FEE2E2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pdfCardInfo: {
    flex: 1,
  },
  pdfCardTitle: {
    fontSize: typography.sizes.xs,
    fontWeight: typography.weights.semibold,
    fontFamily: 'Outfit_600SemiBold',
  },
  pdfCardSubtitle: {
    fontSize: 10,
    marginTop: 2,
  },
  thinkingBubble: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.md,
  },
  thinkingText: {
    fontSize: typography.sizes.xs,
    fontStyle: 'italic',
  },
  attachmentPreviewBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderTopWidth: 1,
    gap: spacing.sm,
  },
  attachmentThumbnail: {
    width: 36,
    height: 36,
    borderRadius: borderRadius.sm,
  },
  pdfPreviewBadge: {
    width: 36,
    height: 36,
    borderRadius: borderRadius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  attachmentPreviewTextContainer: {
    flex: 1,
  },
  attachmentPreviewTitle: {
    fontSize: typography.sizes.xs,
    fontWeight: typography.weights.semibold,
    fontFamily: 'Outfit_600SemiBold',
  },
  attachmentPreviewSubtitle: {
    fontSize: 10,
    marginTop: 1,
  },
  removeAttachmentBtn: {
    padding: 6,
  },
  suggestionsRow: {
    paddingVertical: 8,
    borderTopWidth: 1,
  },
  suggestionsScrollContent: {
    paddingHorizontal: spacing.md,
    gap: 8,
  },
  suggestionChip: {
    paddingHorizontal: 13,
    paddingVertical: 7,
    borderRadius: 16,
    borderWidth: 1,
  },
  suggestionChipText: {
    fontSize: 12,
    fontFamily: 'Outfit_500Medium',
    fontWeight: '500',
  },
  attachmentScrollContent: {
    gap: 8,
    paddingVertical: 2,
  },
  attachmentItemCard: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    gap: 8,
    maxWidth: 220,
  },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingTop: 8,
    paddingBottom: Platform.OS === 'ios' ? 24 : spacing.sm,
    borderTopWidth: 1,
    gap: 8,
  },
  embeddedPlusBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 4,
  },
  textInputWrapper: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 24,
    borderWidth: 1.5,
    paddingLeft: 6,
    paddingRight: 6,
    paddingVertical: 3,
    minHeight: 44,
  },
  textInput: {
    flex: 1,
    fontSize: 13.5,
    fontFamily: 'Outfit_400Regular',
    paddingVertical: 6,
    paddingHorizontal: 4,
    maxHeight: 96,
  },
  sendBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 4,
  },
  actionSheetBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  actionSheetCard: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    borderBottomWidth: 0,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: Platform.OS === 'ios' ? 36 : spacing.lg,
    gap: 12,
  },
  actionSheetHeader: {
    marginBottom: 4,
  },
  actionSheetTitle: {
    fontSize: 17,
    fontWeight: '700',
    fontFamily: 'Outfit_700Bold',
  },
  actionSheetSubtitle: {
    fontSize: 13,
    marginTop: 2,
  },
  actionSheetOption: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    gap: 14,
  },
  actionSheetIconCircle: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionSheetOptionTextContainer: {
    flex: 1,
  },
  actionSheetOptionTitle: {
    fontSize: 15,
    fontWeight: '600',
    fontFamily: 'Outfit_600SemiBold',
  },
  actionSheetOptionDesc: {
    fontSize: 12,
    marginTop: 1,
  },
  actionSheetCancelBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    marginTop: 4,
  },
  actionSheetCancelText: {
    fontSize: 15,
    fontWeight: '600',
    fontFamily: 'Outfit_600SemiBold',
  },
});
