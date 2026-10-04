import React, { useState, useEffect, useRef } from 'react';
import {X, Sparkles, Plus, UploadCloud, Search, Trash2, Eye, CheckCircle2, 
  AlertCircle, ChevronRight, ChevronLeft, Award, FileText, ArrowUp, 
  ArrowDown, RotateCcw, ZoomIn, ZoomOut, Check, HelpCircle, BookOpen, 
  Users, BarChart3, Clock, CheckCheck, RefreshCw, Layers, Maximize2, Minimize2, PanelRight, PanelRightClose} from 'lucide-react';
import { supabase } from '../lib/supabase';

interface TeacherBulkMarkingModalProps {
  paper: any;
  onClose: () => void;
  onPaperUpdated?: () => void;
}

interface MarkingQueueItem {
  id: string;
  studentName: string;
  studentIdNumber?: string;
  studentNotes?: string;
  files: { file: File; name: string }[];
  status: 'queued' | 'uploading' | 'marking' | 'completed' | 'error';
  progress: number;
  stepDescription: string;
  errorMessage?: string;
  createdAt: number;
}

interface MarkedStudentPaper {
  id: string;
  paper_id: string;
  student_name: string;
  student_id_number?: string;
  total_score: number;
  max_score: number;
  percentage: number;
  page_images: string[];
  marked_image_url?: string;
  assessment_result: any;
  created_at: string;
}

/**
 * Replicates the exact mobile app question context preparation from src/lib/tutorAgent.ts
 */
async function fetchCompletePaperQuestionsContext(paperId: string, paperMeta: any) {
  try {
    // 1. Fetch all questions for this paper from Supabase
    const { data: qData, error: qErr } = await supabase
      .from('past_paper_questions')
      .select('*')
      .eq('paper_id', paperId)
      .order('question_number', { ascending: true });

    if (qErr || !qData || qData.length === 0) {
      console.warn('fetchCompletePaperQuestionsContext: no DB questions found');
      return {
        manifestOverview: `Paper ${paperMeta?.paper_number || '1'} (${paperMeta?.subject || 'Science'})`,
        submissionQuestionsContext: `Examination paper for ${paperMeta?.subject || 'Science'} ${paperMeta?.year || ''}. Standard syllabus marking scheme applies.`
      };
    }

    // Sort questions numerically (1, 2, 3... 9, 10)
    qData.sort((a: any, b: any) => {
      const numA = parseInt(String(a.question_number).match(/\d+/)?.[0] || '0', 10);
      const numB = parseInt(String(b.question_number).match(/\d+/)?.[0] || '0', 10);
      if (numA !== numB) return numA - numB;
      return String(a.question_number).localeCompare(String(b.question_number), undefined, { numeric: true });
    });

    // 2. Fetch all solutions for official mark schemes
    const qIds = qData.map((q: any) => q.id);
    const { data: solData } = await supabase
      .from('past_paper_solutions')
      .select('*')
      .in('question_id', qIds);

    const solMap = new Map<string, any>();
    if (solData && solData.length > 0) {
      solData.forEach((s: any) => solMap.set(s.question_id, s));
    }

    const allPaperQuestions = qData.map((item: any) => {
      const solution = solMap.get(item.id);
      const markScheme = item.mark_scheme || solution?.official_mark_scheme || 'Standard examination syllabus criteria apply.';
      const contentText = item.content_text || `Question ${item.question_number}`;
      return {
        id: item.id,
        paper_id: item.paper_id,
        question_number: String(item.question_number),
        topic: item.topic || 'General Topic',
        subtopic: item.subtopic,
        marks: Number(item.marks) || 5,
        content_text: contentText,
        mark_scheme: markScheme
      };
    });

    const manifestOverview = allPaperQuestions.map(m => 
      `• Question ${m.question_number} [${m.marks} marks] - Topic: ${m.topic}${m.subtopic ? ` (${m.subtopic})` : ''}`
    ).join('\n');

    const submissionQuestionsContext = allPaperQuestions.map(q => 
      `QUESTION ${q.question_number} [${q.marks} marks] — Topic: ${q.topic}${q.subtopic ? ` (${q.subtopic})` : ''}\nContent / Sub-parts:\n${q.content_text}\n\nOfficial Mark Scheme:\n${q.mark_scheme}`
    ).join('\n\n---\n\n');

    return { manifestOverview, submissionQuestionsContext };
  } catch (err) {
    console.error('fetchCompletePaperQuestionsContext error:', err);
    return {
      manifestOverview: '',
      submissionQuestionsContext: ''
    };
  }
}

export default function TeacherBulkMarkingModal({ paper, onClose, onPaperUpdated }: TeacherBulkMarkingModalProps) {
  const [markedPapers, setMarkedPapers] = useState<MarkedStudentPaper[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [viewingPaper, setViewingPaper] = useState<MarkedStudentPaper | null>(null);

  // Upload Form State
  const [studentName, setStudentName] = useState('');
  const [studentIdNumber, setStudentIdNumber] = useState('');
  const [studentNotes, setStudentNotes] = useState('');
  const [selectedFiles, setSelectedFiles] = useState<{ file: File; preview: string; name: string }[]>([]);
  // Sequential Background Marking Queue
  const [queue, setQueue] = useState<MarkingQueueItem[]>([]);
  const queueRef = useRef<MarkingQueueItem[]>([]);
  queueRef.current = queue;
  const isProcessingRef = useRef(false);
  const [dragOver, setDragOver] = useState(false);

  // Viewer State
  const [viewerPageIdx, setViewerPageIdx] = useState(0);
  const [viewerTab, setViewerTab] = useState<'script' | 'report'>('script');
  const [viewerMode, setViewerMode] = useState<'marked' | 'original'>('marked');
  const [showSidebar, setShowSidebar] = useState(true); // Width in px for natural vertical scrolling
  const [selectedAnnotation, setSelectedAnnotation] = useState<any | null>(null);
  const [generatingPages, setGeneratingPages] = useState<Record<number, boolean>>({});

  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchMarkedPapers = async () => {
    if (!paper?.id) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('marked_student_papers')
        .select('*')
        .eq('paper_id', paper.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setMarkedPapers(data || []);
    } catch (err: any) {
      console.error('Error fetching marked student papers:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMarkedPapers();
  }, [paper?.id]);

  // Clean up object URLs on unmount
  useEffect(() => {
    return () => {
      selectedFiles.forEach(f => URL.revokeObjectURL(f.preview));
    };
  }, [selectedFiles]);

  // Eager generation of marked image if missing for active page (same as mobile app)
  useEffect(() => {
    if (!viewingPaper) return;
    const pageData = viewingPaper.assessment_result?.pages?.[viewerPageIdx];
    const hasMarked = pageData?.marked_image_url || (viewerPageIdx === 0 && viewingPaper.marked_image_url);
    const origImg = pageData?.original_image_url || viewingPaper.page_images?.[viewerPageIdx];

    if (!hasMarked && origImg && !generatingPages[viewerPageIdx]) {
      setGeneratingPages(prev => ({ ...prev, [viewerPageIdx]: true }));

      supabase.functions.invoke('tutor-chat', {
        body: {
          action: 'generate_marked_image',
          assessment: viewingPaper.assessment_result,
          image_url: origImg,
          page_index: viewerPageIdx
        }
      }).then(async ({ data }) => {
        if (data?.image_url) {
          const updated = { ...viewingPaper };
          if (!updated.assessment_result.pages) {
            updated.assessment_result.pages = [];
          }
          if (!updated.assessment_result.pages[viewerPageIdx]) {
            updated.assessment_result.pages[viewerPageIdx] = { original_image_url: origImg };
          }
          updated.assessment_result.pages[viewerPageIdx].marked_image_url = data.image_url;
          if (viewerPageIdx === 0) {
            updated.marked_image_url = data.image_url;
          }
          setViewingPaper(updated);

          await supabase
            .from('marked_student_papers')
            .update({
              marked_image_url: updated.marked_image_url,
              assessment_result: updated.assessment_result
            })
            .eq('id', viewingPaper.id);
        }
      }).catch(err => {
        console.warn('generate_marked_image error:', err);
      }).finally(() => {
        setGeneratingPages(prev => ({ ...prev, [viewerPageIdx]: false }));
      });
    }
  }, [viewingPaper?.id, viewerPageIdx]);

  const handleFilesSelected = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const newItems = Array.from(files)
      .filter(file => file.type.startsWith('image/'))
      .map(file => ({
        file,
        preview: URL.createObjectURL(file),
        name: file.name
      }));

    setSelectedFiles(prev => [...prev, ...newItems]);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    handleFilesSelected(e.dataTransfer.files);
  };

  const handleMoveFile = (idx: number, direction: 'up' | 'down') => {
    const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (targetIdx < 0 || targetIdx >= selectedFiles.length) return;
    const updated = [...selectedFiles];
    const temp = updated[idx];
    updated[idx] = updated[targetIdx];
    updated[targetIdx] = temp;
    setSelectedFiles(updated);
  };

  const handleRemoveFile = (idx: number) => {
    const item = selectedFiles[idx];
    if (item) URL.revokeObjectURL(item.preview);
    setSelectedFiles(prev => prev.filter((_, i) => i !== idx));
  };

  const resetUploadForm = () => {
    selectedFiles.forEach(f => URL.revokeObjectURL(f.preview));
    setSelectedFiles([]);
    setStudentName('');
    setStudentIdNumber('');
    setStudentNotes('');
    setDragOver(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleRemoveFromQueue = (id: string) => {
    setQueue(prev => prev.filter(item => item.id !== id));
  };

  const handleRegeneratePageMarking = async (pageIdx: number) => {
    if (!viewingPaper) return;
    const pageData = viewingPaper.assessment_result?.pages?.[pageIdx];
    const origImg = pageData?.original_image_url || viewingPaper.page_images?.[pageIdx];
    if (!origImg) return;

    setGeneratingPages(prev => ({ ...prev, [pageIdx]: true }));
    try {
      const { data } = await supabase.functions.invoke('tutor-chat', {
        body: {
          action: 'generate_marked_image',
          assessment: viewingPaper.assessment_result,
          image_url: origImg,
          page_index: pageIdx
        }
      });

      if (data?.image_url) {
        const updated = { ...viewingPaper };
        if (!updated.assessment_result.pages) {
          updated.assessment_result.pages = [];
        }
        if (!updated.assessment_result.pages[pageIdx]) {
          updated.assessment_result.pages[pageIdx] = { original_image_url: origImg };
        }
        updated.assessment_result.pages[pageIdx].marked_image_url = data.image_url;
        if (pageIdx === 0) {
          updated.marked_image_url = data.image_url;
        }
        setViewingPaper(updated);

        await supabase
          .from('marked_student_papers')
          .update({
            marked_image_url: updated.marked_image_url,
            assessment_result: updated.assessment_result
          })
          .eq('id', viewingPaper.id);

        await fetchMarkedPapers();
      }
    } catch (err) {
      console.warn('handleRegeneratePageMarking error:', err);
    } finally {
      setGeneratingPages(prev => ({ ...prev, [pageIdx]: false }));
    }
  };

  const handleRetryQueueItem = (id: string) => {
    setQueue(prev => prev.map(item => item.id === id ? {
      ...item,
      status: 'queued',
      progress: 0,
      errorMessage: undefined,
      stepDescription: 'Retrying - waiting in queue...'
    } : item));
  };

  // Convert File to base64 fallback
  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  const handleQueueStudentPaper = (e: React.FormEvent) => {
    e.preventDefault();
    if (!studentName.trim()) {
      alert('Please enter the student’s name.');
      return;
    }
    if (selectedFiles.length === 0) {
      alert('Please upload at least one image of the student’s handwritten answer script.');
      return;
    }

    const newItem: MarkingQueueItem = {
      id: `queue-${Date.now()}-${Math.random().toString(36).substring(5)}`,
      studentName: studentName.trim(),
      studentIdNumber: studentIdNumber.trim() || undefined,
      studentNotes: studentNotes.trim() || undefined,
      files: selectedFiles.map(f => ({ file: f.file, name: f.name })),
      status: 'queued',
      progress: 0,
      stepDescription: 'Waiting in queue...',
      createdAt: Date.now()
    };

    setQueue(prev => [...prev, newItem]);
    setShowUploadModal(false);
    resetUploadForm();
  };

  const processNextInQueue = async () => {
    if (isProcessingRef.current) return;

    const currentItem = queueRef.current.find(item => item.status === 'queued');
    if (!currentItem) return;

    isProcessingRef.current = true;
    const currentId = currentItem.id;

    setQueue(prev => prev.map(it => it.id === currentId ? {
      ...it,
      status: 'uploading',
      stepDescription: 'Uploading page scans to storage...',
      progress: 15
    } : it));

    try {
      // Step 1: Upload images to Supabase storage bucket 'student_attempts'
      const uploadedUrls: string[] = [];
      for (let i = 0; i < currentItem.files.length; i++) {
        const item = currentItem.files[i];
        const ext = item.file.name.split('.').pop() || 'jpg';
        const storagePath = `bulk_markings/${paper.id}/${Date.now()}_${i}_${Math.random().toString(36).substring(7)}.${ext}`;

        try {
          const { error: uploadErr } = await supabase.storage
            .from('student_attempts')
            .upload(storagePath, item.file, { cacheControl: '3600', upsert: true });

          if (uploadErr) {
            console.warn('Storage upload error, using base64 fallback:', uploadErr);
            const b64 = await fileToBase64(item.file);
            uploadedUrls.push(b64);
          } else {
            const { data: pubData } = supabase.storage
              .from('student_attempts')
              .getPublicUrl(storagePath);
            uploadedUrls.push(pubData.publicUrl);
          }
        } catch (upErr) {
          console.warn('Upload catch, using base64:', upErr);
          const b64 = await fileToBase64(item.file);
          uploadedUrls.push(b64);
        }

        setQueue(prev => prev.map(it => it.id === currentId ? {
          ...it,
          progress: Math.round(15 + ((i + 1) / currentItem.files.length) * 20),
          stepDescription: `Uploading scan ${i + 1} of ${currentItem.files.length}...`
        } : it));
      }

      // Step 2: Fetch complete questions & official mark scheme context
      setQueue(prev => prev.map(it => it.id === currentId ? {
        ...it,
        status: 'marking',
        stepDescription: 'Matching with official mark schemes & syllabus...',
        progress: 40
      } : it));

      const { manifestOverview, submissionQuestionsContext } = await fetchCompletePaperQuestionsContext(paper.id, paper);

      const paperTitle = `${paper.subject} Paper ${paper.paper_number} (${paper.year})`;
      const subject = paper.subject;
      const curriculum = paper.curriculum || 'Cambridge / ZIMSEC';

      const contextualizedMessage = `You are the Mentora Senior Chief Examiner for "${paperTitle}" (${subject} - ${curriculum}).
The student has uploaded an exam answer sheet / booklet for marking.

EXAM PAPER — ALL QUESTIONS & OFFICIAL MARK SCHEMES:
${submissionQuestionsContext}

EXAMINER ASSESSMENT & MARKING INSTRUCTIONS:
1. QUESTION IDENTIFICATION:
   - Carefully inspect the student's submission. Read handwritten question numbers and examine equations, diagrams, and written responses.
   - MATCH the student's work to the exact corresponding question in the EXAM PAPER above.
   - Set "identified_question_number" to that question number.
   - Set "identified_topic" to that question's topic.
   - The question's "total_max_score" MUST ALWAYS BE THE FULL OFFICIAL MARKS of that identified question from the paper header above.

2. RIGOROUS SUB-PART MARKING & DIAGRAM AUDITING:
   - Inspect every official sub-part belonging to the identified question.
   - Award Method (M), Accuracy (A), Independent/Diagram (B), and Explanation (E) marks strictly matching the official mark scheme criteria.
   - For missed points, formulate concrete, constructive handwritten teacher corrections.
   - Check for unanswered or omitted subparts and include them with 0 marks.

3. VISUAL INK ANNOTATIONS & INKING:
   - Apply inline checkmarks (✓) at each earned point.
   - Stamp margin subpart fractions (e.g. "✓ (2/2)").
   - Stamp question total score (e.g. "Total: 8/9").`;

      setQueue(prev => prev.map(it => it.id === currentId ? {
        ...it,
        stepDescription: 'Chief Examiner evaluating working & inking red marks...',
        progress: 65
      } : it));

      // Step 3: Invoke tutor-chat
      const { data, error } = await supabase.functions.invoke('tutor-chat', {
        body: {
          action: 'assess_attempt',
          paper_id: paper.id,
          message: contextualizedMessage,
          context: {
            questionText: submissionQuestionsContext,
            allQuestionsContext: submissionQuestionsContext,
            manifestOverview,
            subject: paper.subject,
            curriculum: paper.curriculum
          },
          all_questions_context: submissionQuestionsContext,
          question_text: submissionQuestionsContext,
          images: uploadedUrls,
          student_answer: currentItem.studentNotes?.trim() || undefined,
          generate_marked_image: true,
          metadata: {
            student_name: currentItem.studentName.trim(),
            student_id_number: currentItem.studentIdNumber?.trim() || undefined,
            role: 'teacher_bulk_marking'
          }
        }
      });

      if (error) {
        throw new Error(error.message || 'Marking agent failed to assess attempt');
      }

      setQueue(prev => prev.map(it => it.id === currentId ? {
        ...it,
        stepDescription: 'Finalizing assessment & saving marked script...',
        progress: 90
      } : it));

      const assessment = data?.assessment || {};
      const totalScore = Number(assessment.total_score ?? 0);
      const maxScore = Number(assessment.total_max_score ?? 0);
      const percentage = maxScore > 0 
        ? Math.round((totalScore / maxScore) * 100) 
        : Number(assessment.percentage ?? 0);

      // Reconcile primary marked image
      const primaryMarkedUrl = data?.marked_image_url || assessment.pages?.[0]?.marked_image_url || null;

      // Reconcile canonical page images in sorted order
      const canonicalPageImages = Array.isArray(assessment.pages) && assessment.pages.length > 0
        ? assessment.pages.map((p: any) => p.original_image_url).filter(Boolean)
        : uploadedUrls;
      const sortedPageImages = canonicalPageImages.length === uploadedUrls.length 
        ? canonicalPageImages 
        : uploadedUrls;

      // Save into marked_student_papers
      const newRecord = {
        paper_id: paper.id,
        student_name: currentItem.studentName.trim(),
        student_id_number: currentItem.studentIdNumber?.trim() || null,
        total_score: totalScore,
        max_score: maxScore,
        percentage: percentage,
        page_images: sortedPageImages,
        marked_image_url: primaryMarkedUrl,
        assessment_result: assessment
      };

      const { data: inserted, error: insertErr } = await supabase
        .from('marked_student_papers')
        .insert(newRecord)
        .select()
        .single();

      if (insertErr) throw insertErr;

      // Refresh list
      await fetchMarkedPapers();
      if (onPaperUpdated) onPaperUpdated();

      setQueue(prev => prev.map(it => it.id === currentId ? {
        ...it,
        status: 'completed',
        progress: 100,
        stepDescription: `Marking complete! Scored ${totalScore}/${maxScore} (${percentage}%)`
      } : it));

      // Remove completed item after 5 seconds
      setTimeout(() => {
        setQueue(prev => prev.filter(it => it.id !== currentId));
      }, 5000);

    } catch (err: any) {
      console.error('Queue processing error:', err);
      setQueue(prev => prev.map(it => it.id === currentId ? {
        ...it,
        status: 'error',
        errorMessage: err.message || 'Marking failed',
        stepDescription: 'Marking encountered an error'
      } : it));
    } finally {
      isProcessingRef.current = false;
      // 1500ms safety buffer before starting next queued paper to prevent rate limits
      setTimeout(() => {
        processNextInQueue();
      }, 1500);
    }
  };

  useEffect(() => {
    if (!isProcessingRef.current && queue.some(q => q.status === 'queued')) {
      processNextInQueue();
    }
  }, [queue]);

  const handleDeleteMarkedPaper = async (paperId: string, studentName: string) => {
    if (!window.confirm(`Are you sure you want to delete the marked paper for "${studentName}"?`)) return;
    try {
      const { error } = await supabase
        .from('marked_student_papers')
        .delete()
        .eq('id', paperId);

      if (error) throw error;
      setMarkedPapers(prev => prev.filter(p => p.id !== paperId));
      if (onPaperUpdated) onPaperUpdated();
    } catch (err: any) {
      console.error('Delete error:', err);
      alert('Failed to delete marked paper: ' + (err.message || err));
    }
  };

  // Filtered papers
  const filteredPapers = markedPapers.filter(p => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return true;
    return (
      p.student_name.toLowerCase().includes(q) ||
      (p.student_id_number && p.student_id_number.toLowerCase().includes(q))
    );
  });

  // Calculate statistics
  const totalCount = markedPapers.length;
  const avgScore = totalCount > 0 
    ? Math.round(markedPapers.reduce((sum, p) => sum + (p.percentage || 0), 0) / totalCount)
    : 0;
  const highestScore = totalCount > 0
    ? Math.max(...markedPapers.map(p => p.percentage || 0))
    : 0;
  const passRate = totalCount > 0
    ? Math.round((markedPapers.filter(p => (p.percentage || 0) >= 50).length / totalCount) * 100)
    : 0;

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-2 sm:p-4 overflow-hidden">
      <div className="bg-surface border border-border rounded-3xl w-full max-w-6xl max-h-[94vh] flex flex-col shadow-2xl overflow-hidden">
        
        {/* Header */}
        <div className="px-6 py-5 border-b border-border bg-background/50 flex items-center justify-between gap-4 shrink-0">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-primary/10 border border-primary/25 flex items-center justify-center text-primary shrink-0 shadow-inner">
              <Sparkles className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2.5 flex-wrap">
                <h2 className="text-xl font-bold text-text">
                  Bulk Marking — {paper?.subject} Paper {paper?.paper_number}
                </h2>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-primary/15 text-primary border border-primary/30">
                  {paper?.curriculum || 'Exam Paper'}
                </span>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-border text-textMuted">
                  {paper?.year} {paper?.session ? `(${paper.session})` : ''}
                </span>
              </div>
              <p className="text-xs text-textMuted mt-1">
                Upload student answer sheets to automatically grade with the Mentora AI Senior Examiner against the official mark scheme.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {queue.some(q => q.status === 'uploading' || q.status === 'marking') && (
              <div className="hidden sm:flex items-center gap-2 bg-primary/10 border border-primary/25 text-primary text-xs font-semibold px-3 py-2 rounded-2xl animate-pulse">
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                <span>Marking Active ({queue.filter(q => q.status === 'uploading' || q.status === 'marking').length}/1)</span>
              </div>
            )}
            <button
              onClick={() => {
                resetUploadForm();
                setShowUploadModal(true);
              }}
              className="flex items-center gap-2 bg-primary hover:bg-primaryHover text-white px-4 py-2.5 rounded-2xl font-semibold text-sm transition-all shadow-lg shadow-primary/20 hover:scale-[1.02] cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Mark New Paper</span>
            </button>
            <button 
              onClick={onClose}
              className="p-2 hover:bg-border/50 rounded-2xl transition-colors text-textMuted hover:text-text cursor-pointer"
              title="Close"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Quick Analytics Bar */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 px-6 py-3.5 bg-surface border-b border-border/80 shrink-0">
          <div className="bg-background/60 border border-border/60 rounded-2xl p-3 flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-blue-500/10 text-blue-400 flex items-center justify-center shrink-0">
              <Users className="w-4 h-4" />
            </div>
            <div>
              <span className="text-[11px] text-textMuted font-medium block">Total Marked</span>
              <span className="text-base font-bold text-text">{totalCount} {totalCount === 1 ? 'Student' : 'Students'}</span>
            </div>
          </div>

          <div className="bg-background/60 border border-border/60 rounded-2xl p-3 flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-purple-500/10 text-purple-400 flex items-center justify-center shrink-0">
              <BarChart3 className="w-4 h-4" />
            </div>
            <div>
              <span className="text-[11px] text-textMuted font-medium block">Class Average</span>
              <span className="text-base font-bold text-text">{avgScore}%</span>
            </div>
          </div>

          <div className="bg-background/60 border border-border/60 rounded-2xl p-3 flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-[#10b981]/10 text-[#10b981] flex items-center justify-center shrink-0">
              <Award className="w-4 h-4" />
            </div>
            <div>
              <span className="text-[11px] text-textMuted font-medium block">Top Score</span>
              <span className="text-base font-bold text-text">{highestScore}%</span>
            </div>
          </div>

          <div className="bg-background/60 border border-border/60 rounded-2xl p-3 flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-amber-500/10 text-amber-400 flex items-center justify-center shrink-0">
              <CheckCheck className="w-4 h-4" />
            </div>
            <div>
              <span className="text-[11px] text-textMuted font-medium block">Pass Rate (≥50%)</span>
              <span className="text-base font-bold text-text">{passRate}%</span>
            </div>
          </div>
        </div>

        {/* Search & Actions Bar */}
        <div className="px-6 py-3 border-b border-border bg-surface flex items-center justify-between gap-4 shrink-0">
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 text-textMuted absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search by student name or candidate ID..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-background border border-border rounded-xl text-sm text-text placeholder-textMuted focus:outline-none focus:border-primary transition-colors"
            />
          </div>

          <button
            onClick={fetchMarkedPapers}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-2 bg-background hover:bg-border/50 border border-border rounded-xl text-xs font-medium text-textMuted hover:text-text transition-colors cursor-pointer"
            title="Refresh List"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>

        {/* Students Table / List */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* Active Marking Queue Panel */}
          {queue.length > 0 && (
            <div className="mb-6 bg-surface border border-primary/30 rounded-2xl p-4 shadow-sm space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shrink-0">
                    <Sparkles className="w-4 h-4 animate-spin" style={{ animationDuration: '4s' }} />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-text uppercase tracking-wider flex items-center gap-2">
                      <span>Live Marking Queue</span>
                      <span className="bg-primary/20 text-primary text-[10px] px-2 py-0.5 rounded-full font-semibold">
                        {queue.some(q => q.status === 'uploading' || q.status === 'marking') ? '1 Active' : 'Idle'}
                        {queue.filter(q => q.status === 'queued').length > 0 && ` • ${queue.filter(q => q.status === 'queued').length} Queued`}
                      </span>
                    </h4>
                    <p className="text-[11px] text-textMuted">
                      Papers are graded sequentially one-by-one by the Senior Examiner to prevent API rate limits.
                    </p>
                  </div>
                </div>

                <button
                  onClick={() => {
                    resetUploadForm();
                    setShowUploadModal(true);
                  }}
                  className="inline-flex items-center gap-1.5 bg-primary/15 hover:bg-primary/25 text-primary border border-primary/30 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Queue Another Student</span>
                </button>
              </div>

              {/* Queue Items */}
              <div className="space-y-2 pt-1">
                {queue.map((item, idx) => {
                  const isActive = item.status === 'uploading' || item.status === 'marking';
                  const isQueued = item.status === 'queued';
                  const isCompleted = item.status === 'completed';
                  const isError = item.status === 'error';

                  return (
                    <div 
                      key={item.id}
                      className={`p-3 rounded-xl border transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                        isActive 
                          ? 'bg-primary/5 border-primary/40 shadow-sm'
                          : isCompleted
                          ? 'bg-emerald-500/5 border-emerald-500/30'
                          : isError
                          ? 'bg-error/5 border-error/30'
                          : 'bg-background/60 border-border'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold shrink-0 ${
                          isActive 
                            ? 'bg-primary/20 text-primary animate-pulse'
                            : isCompleted
                            ? 'bg-emerald-500/20 text-emerald-400'
                            : isError
                            ? 'bg-error/20 text-error'
                            : 'bg-surface border border-border text-textMuted'
                        }`}>
                          {isCompleted ? <Check className="w-4 h-4" /> : isError ? <AlertCircle className="w-4 h-4" /> : idx + 1}
                        </div>

                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-text text-xs truncate">{item.studentName}</span>
                            {item.studentIdNumber && (
                              <span className="text-[10px] text-textMuted font-mono">({item.studentIdNumber})</span>
                            )}
                            <span className="text-[10px] text-textMuted">• {item.files.length} {item.files.length === 1 ? 'page' : 'pages'}</span>
                          </div>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className={`text-[11px] font-medium ${
                              isActive ? 'text-primary' : isCompleted ? 'text-emerald-400' : isError ? 'text-error' : 'text-textMuted'
                            }`}>
                              {item.stepDescription}
                            </span>
                            {isActive && (
                              <span className="text-[10px] font-mono text-primary/70">({item.progress}%)</span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Right status or action */}
                      <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                        {isActive && (
                          <div className="w-24 sm:w-32 bg-border/60 rounded-full h-1.5 overflow-hidden">
                            <div 
                              className="bg-primary h-full transition-all duration-300 rounded-full"
                              style={{ width: `${item.progress}%` }}
                            />
                          </div>
                        )}

                        {isQueued && (
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] font-medium bg-border/60 text-textMuted px-2 py-0.5 rounded-md">
                              In Line
                            </span>
                            <button
                              onClick={() => handleRemoveFromQueue(item.id)}
                              className="p-1 hover:bg-error/15 text-textMuted hover:text-error rounded transition-colors cursor-pointer"
                              title="Remove from queue"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )}

                        {isError && (
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => handleRetryQueueItem(item.id)}
                              className="px-2.5 py-1 bg-error/15 hover:bg-error/25 text-error rounded-lg text-xs font-semibold transition-colors cursor-pointer"
                            >
                              Retry
                            </button>
                            <button
                              onClick={() => handleRemoveFromQueue(item.id)}
                              className="p-1 hover:bg-border/60 text-textMuted rounded cursor-pointer"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          {loading ? (
            <div className="flex flex-col items-center justify-center py-20 text-textMuted space-y-3">
              <RefreshCw className="w-8 h-8 animate-spin text-primary" />
              <p className="text-sm font-medium">Loading marked student papers...</p>
            </div>
          ) : filteredPapers.length === 0 ? (
            <div className="text-center py-16 px-4 bg-background/40 border border-dashed border-border rounded-3xl max-w-xl mx-auto my-6">
              <div className="w-16 h-16 rounded-3xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary mx-auto mb-4">
                <FileText className="w-8 h-8" />
              </div>
              <h3 className="text-lg font-bold text-text">No Marked Student Papers Yet</h3>
              <p className="text-sm text-textMuted mt-1.5 max-w-md mx-auto">
                {searchQuery 
                  ? 'No students found matching your search term.' 
                  : 'Start grading your class papers. Click the button below to upload handwritten scripts for automatic examiner assessment.'}
              </p>
              {!searchQuery && (
                <button
                  onClick={() => {
                    resetUploadForm();
                    setShowUploadModal(true);
                  }}
                  className="mt-5 inline-flex items-center gap-2 bg-primary hover:bg-primaryHover text-white px-5 py-2.5 rounded-2xl font-semibold text-sm transition-all shadow-md cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  <span>Mark First Student Paper</span>
                </button>
              )}
            </div>
          ) : (
            <div className="bg-background/60 border border-border rounded-2xl overflow-hidden shadow-sm">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-surface/80 border-b border-border text-textMuted text-xs font-semibold uppercase tracking-wider">
                    <th className="p-4">Student</th>
                    <th className="p-4">Score</th>
                    <th className="p-4">Percentage</th>
                    <th className="p-4">Pages</th>
                    <th className="p-4">Questions Checked</th>
                    <th className="p-4">Date Marked</th>
                    <th className="p-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {filteredPapers.map((paperItem) => {
                    const pct = paperItem.percentage || 0;
                    const pctBadgeColor = pct >= 75
                      ? 'bg-[#10b981]/15 text-[#10b981] border-[#10b981]/30'
                      : pct >= 50
                      ? 'bg-blue-500/15 text-blue-400 border-blue-500/30'
                      : 'bg-error/15 text-error border-error/30';

                    const qSummaries = paperItem.assessment_result?.question_summaries || [];
                    const pagesCount = Array.isArray(paperItem.assessment_result?.pages) && paperItem.assessment_result.pages.length > 0
                      ? paperItem.assessment_result.pages.length
                      : (Array.isArray(paperItem.page_images) ? paperItem.page_images.length : 1);

                    return (
                      <tr 
                        key={paperItem.id}
                        className="hover:bg-surface/50 transition-colors group"
                      >
                        <td className="p-4">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary font-bold text-sm shrink-0">
                              {paperItem.student_name.charAt(0).toUpperCase()}
                            </div>
                            <div>
                              <span className="font-semibold text-text block text-sm">
                                {paperItem.student_name}
                              </span>
                              {paperItem.student_id_number && (
                                <span className="text-xs text-textMuted block font-mono">
                                  ID: {paperItem.student_id_number}
                                </span>
                              )}
                            </div>
                          </div>
                        </td>

                        <td className="p-4">
                          <div className="flex items-baseline gap-1">
                            <span className="text-base font-bold text-text">
                              {paperItem.total_score}
                            </span>
                            <span className="text-xs text-textMuted">
                              / {paperItem.max_score} marks
                            </span>
                          </div>
                        </td>

                        <td className="p-4">
                          <span className={`inline-flex items-center px-2.5 py-1 rounded-xl text-xs font-bold border ${pctBadgeColor}`}>
                            {pct}%
                          </span>
                        </td>

                        <td className="p-4 text-sm text-textMuted">
                          <span className="inline-flex items-center gap-1">
                            <Layers className="w-3.5 h-3.5" />
                            <span>{pagesCount} {pagesCount === 1 ? 'page' : 'pages'}</span>
                          </span>
                        </td>

                        <td className="p-4">
                          <div className="flex flex-wrap gap-1 max-w-xs">
                            {qSummaries.length > 0 ? (
                              qSummaries.map((qs: any, i: number) => (
                                <span 
                                  key={i} 
                                  className="px-2 py-0.5 rounded-lg text-[11px] font-medium bg-surface border border-border text-textMuted"
                                  title={`Q${qs.question_number}: ${qs.score}/${qs.max_score} marks`}
                                >
                                  Q{qs.question_number} ({qs.score}/{qs.max_score})
                                </span>
                              ))
                            ) : (
                              <span className="text-xs text-textMuted">Standard Script</span>
                            )}
                          </div>
                        </td>

                        <td className="p-4 text-xs text-textMuted">
                          <span className="flex items-center gap-1.5">
                            <Clock className="w-3.5 h-3.5" />
                            <span>{new Date(paperItem.created_at).toLocaleDateString()}</span>
                          </span>
                        </td>

                        <td className="p-4 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => {
                                setViewingPaper(paperItem);
                                setViewerPageIdx(0);
                              }}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-primary/10 text-primary border border-primary/20 hover:bg-primary/20 transition-all cursor-pointer shadow-sm"
                              title="View Full Marked Paper Script"
                            >
                              <Eye className="w-3.5 h-3.5" />
                              <span>View Marked Script</span>
                            </button>
                            <button
                              onClick={() => handleDeleteMarkedPaper(paperItem.id, paperItem.student_name)}
                              className="p-1.5 text-textMuted hover:text-error hover:bg-error/10 rounded-xl transition-colors cursor-pointer"
                              title="Delete Marked Paper"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

      </div>

      {/* ========================================================================= */}
      {/* SUB-MODAL: MARK NEW STUDENT PAPER (UPLOAD & AGENT MARKING)                */}
      {/* ========================================================================= */}
      {showUploadModal && (
        <div className="fixed inset-0 z-60 bg-black/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-6">
          <div className="bg-surface border border-border rounded-3xl w-full max-w-2xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden relative">
            
            {/* Modal Header */}
            <div className="px-6 py-5 border-b border-border bg-background/50 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shrink-0">
                  <Sparkles className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-text">Mark New Student Paper</h3>
                  <p className="text-xs text-textMuted">
                    {paper?.subject} Paper {paper?.paper_number} • {paper?.curriculum} ({paper?.year})
                  </p>
                </div>
              </div>

              <button
                onClick={() => setShowUploadModal(false)}
                className="p-2 hover:bg-border/50 rounded-2xl transition-colors text-textMuted hover:text-text cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body / Form */}
            <div className="flex-1 overflow-y-auto p-6 space-y-5">
<form onSubmit={handleQueueStudentPaper} className="space-y-5">
                  

                  {/* Student Details */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-textMuted uppercase tracking-wider mb-2">
                        Student Full Name <span className="text-error">*</span>
                      </label>
                      <input
                        type="text"
                        required
                        placeholder="e.g. Tinashe Moyo"
                        value={studentName}
                        onChange={(e) => setStudentName(e.target.value)}
                        className="w-full px-4 py-2.5 bg-background border border-border rounded-2xl text-sm text-text placeholder-textMuted focus:outline-none focus:border-primary transition-colors"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-textMuted uppercase tracking-wider mb-2">
                        Student / Candidate ID <span className="text-textMuted font-normal">(Optional)</span>
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. CAND-2026-042"
                        value={studentIdNumber}
                        onChange={(e) => setStudentIdNumber(e.target.value)}
                        className="w-full px-4 py-2.5 bg-background border border-border rounded-2xl text-sm text-text placeholder-textMuted focus:outline-none focus:border-primary transition-colors font-mono"
                      />
                    </div>
                  </div>

                  {/* Image Upload Area */}
                  <div>
                    <label className="block text-xs font-semibold text-textMuted uppercase tracking-wider mb-2">
                      Upload Student Answer Sheets / Booklet <span className="text-error">*</span>
                    </label>

                    {/* Drag and Drop Box */}
                    <div
                      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                      onDragLeave={() => setDragOver(false)}
                      onDrop={handleDrop}
                      onClick={() => fileInputRef.current?.click()}
                      className={`border-2 border-dashed rounded-3xl p-6 text-center cursor-pointer transition-all flex flex-col items-center justify-center gap-2.5 ${
                        dragOver 
                          ? 'border-primary bg-primary/10 scale-[1.01]' 
                          : 'border-border hover:border-primary/50 bg-background/50 hover:bg-background'
                      }`}
                    >
                      <input 
                        type="file" 
                        ref={fileInputRef}
                        multiple 
                        accept="image/*" 
                        onChange={(e) => handleFilesSelected(e.target.files)} 
                        className="hidden" 
                      />
                      <div className="w-12 h-12 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary">
                        <UploadCloud className="w-6 h-6" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-text">
                          Click to select or drag and drop handwritten answer pages
                        </p>
                        <p className="text-xs text-textMuted mt-0.5">
                          Supports PNG, JPG, JPEG, WEBP. You can upload multiple pages.
                        </p>
                      </div>
                    </div>

                    {/* Page Previews List */}
                    {selectedFiles.length > 0 && (
                      <div className="mt-4 space-y-2">
                        <div className="flex items-center justify-between text-xs text-textMuted px-1">
                          <span>{selectedFiles.length} {selectedFiles.length === 1 ? 'Page' : 'Pages'} selected (Arrange in reading order)</span>
                          <button
                            type="button"
                            onClick={() => fileInputRef.current?.click()}
                            className="text-primary hover:underline font-medium cursor-pointer"
                          >
                            + Add more pages
                          </button>
                        </div>

                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 max-h-56 overflow-y-auto p-1">
                          {selectedFiles.map((item, idx) => (
                            <div 
                              key={idx}
                              className="relative bg-background border border-border rounded-2xl p-2 group hover:border-primary/40 transition-colors flex flex-col"
                            >
                              <div className="relative aspect-[3/4] bg-surface rounded-xl overflow-hidden mb-2 border border-border/50">
                                <img 
                                  src={item.preview} 
                                  alt={`Page ${idx + 1}`} 
                                  className="w-full h-full object-cover" 
                                />
                                <div className="absolute top-1.5 left-1.5 bg-black/70 backdrop-blur-sm text-white text-[11px] font-bold px-2 py-0.5 rounded-lg border border-white/20">
                                  Page {idx + 1}
                                </div>
                              </div>

                              <div className="flex items-center justify-between gap-1 text-[11px] text-textMuted mt-auto">
                                <span className="truncate max-w-[80px]" title={item.name}>
                                  {item.name}
                                </span>
                                <div className="flex items-center gap-0.5">
                                  <button
                                    type="button"
                                    onClick={() => handleMoveFile(idx, 'up')}
                                    disabled={idx === 0}
                                    className="p-1 hover:bg-border/60 rounded disabled:opacity-30 text-text cursor-pointer"
                                    title="Move earlier"
                                  >
                                    <ArrowUp className="w-3 h-3" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleMoveFile(idx, 'down')}
                                    disabled={idx === selectedFiles.length - 1}
                                    className="p-1 hover:bg-border/60 rounded disabled:opacity-30 text-text cursor-pointer"
                                    title="Move later"
                                  >
                                    <ArrowDown className="w-3 h-3" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleRemoveFile(idx)}
                                    className="p-1 hover:bg-error/20 text-error rounded cursor-pointer"
                                    title="Remove page"
                                  >
                                    <Trash2 className="w-3 h-3" />
                                  </button>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Optional Notes */}
                  <div>
                    <label className="block text-xs font-semibold text-textMuted uppercase tracking-wider mb-2">
                      Teacher Notes / Candidate Remarks <span className="text-textMuted font-normal">(Optional)</span>
                    </label>
                    <textarea
                      rows={2}
                      placeholder="e.g. Student sat exam under standard timed conditions."
                      value={studentNotes}
                      onChange={(e) => setStudentNotes(e.target.value)}
                      className="w-full px-4 py-2.5 bg-background border border-border rounded-2xl text-xs text-text placeholder-textMuted focus:outline-none focus:border-primary transition-colors resize-none"
                    />
                  </div>

                  {/* Actions */}
                  <div className="pt-2 flex items-center justify-end gap-3 border-t border-border">
                    <button
                      type="button"
                      onClick={() => setShowUploadModal(false)}
                      className="px-4 py-2.5 border border-border hover:bg-border/40 text-textMuted hover:text-text rounded-2xl text-sm font-medium transition-colors cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={!studentName.trim() || selectedFiles.length === 0}
                      className="flex items-center gap-2 bg-primary hover:bg-primaryHover disabled:opacity-50 text-white px-5 py-2.5 rounded-2xl text-sm font-semibold transition-all shadow-md cursor-pointer"
                    >
                      <Sparkles className="w-4 h-4" />
                      <span>Add to Marking Queue</span>
                    </button>
                  </div>
                </form>
            </div>

          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* FULLSCREEN / INTERACTIVE MARKED PAPER SCRIPT VIEWER                       */}
      {/* (NO ANNOTATIONS ON TOP OF MARKED IMAGES, FULL HEIGHT UNCROPPED VIEW)       */}
      {/* ========================================================================= */}
      {viewingPaper && (
        <div className="fixed inset-0 z-70 bg-black/90 backdrop-blur-md flex items-center justify-center p-2 sm:p-4">
          <div className="bg-surface border border-border rounded-3xl w-full max-w-[96vw] h-[94vh] flex flex-col shadow-2xl overflow-hidden">
            
            {/* Viewer Top Bar */}
            <div className="px-6 py-3.5 border-b border-border bg-background/60 flex items-center justify-between gap-4 shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary font-bold">
                  {viewingPaper.student_name.charAt(0).toUpperCase()}
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-base font-bold text-text">
                      {viewingPaper.student_name}
                    </h3>
                    {viewingPaper.student_id_number && (
                      <span className="text-xs text-textMuted font-mono">
                        ({viewingPaper.student_id_number})
                      </span>
                    )}
                    <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold border ${
                      viewingPaper.percentage >= 75 
                        ? 'bg-[#10b981]/15 text-[#10b981] border-[#10b981]/30'
                        : viewingPaper.percentage >= 50
                        ? 'bg-blue-500/15 text-blue-400 border-blue-500/30'
                        : 'bg-error/15 text-error border-error/30'
                    }`}>
                      Score: {viewingPaper.total_score} / {viewingPaper.max_score} ({viewingPaper.percentage}%)
                    </span>
                  </div>
                  <p className="text-xs text-textMuted mt-0.5">
                    {paper?.subject} Paper {paper?.paper_number} • Marked on {new Date(viewingPaper.created_at).toLocaleString()}
                  </p>
                </div>
              </div>

              {/* Viewer Tabs & Close */}
              <div className="flex items-center gap-3">
                <div className="flex items-center bg-background border border-border rounded-xl p-1">
                  <button
                    onClick={() => setViewerTab('script')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                      viewerTab === 'script'
                        ? 'bg-primary text-white shadow'
                        : 'text-textMuted hover:text-text'
                    }`}
                  >
                    Marked Script
                  </button>
                  <button
                    onClick={() => setViewerTab('report')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                      viewerTab === 'report'
                        ? 'bg-primary text-white shadow'
                        : 'text-textMuted hover:text-text'
                    }`}
                  >
                    Examiner Report & Criteria
                  </button>
                </div>

                {/* Toggle Explanations Sidebar */}
                <button
                  onClick={() => setShowSidebar(s => !s)}
                  className={`p-2 rounded-2xl transition-colors cursor-pointer ${
                    showSidebar 
                      ? 'bg-primary/10 text-primary border border-primary/25' 
                      : 'hover:bg-border/50 text-textMuted hover:text-text border border-transparent'
                  }`}
                  title={showSidebar ? "Hide Explanations" : "Show Explanations Sidebar"}
                >
                  {showSidebar ? <PanelRightClose className="w-5 h-5" /> : <PanelRight className="w-5 h-5" />}
                </button>

                <button
                  onClick={() => setViewingPaper(null)}
                  className="p-2 hover:bg-border/50 rounded-2xl transition-colors text-textMuted hover:text-text cursor-pointer"
                  title="Close Viewer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Viewer Content Body */}
            {viewerTab === 'script' ? (() => {
              const pagesList: any[] = (viewingPaper.assessment_result?.pages && viewingPaper.assessment_result.pages.length > 0)
                ? viewingPaper.assessment_result.pages
                : (viewingPaper.page_images || []).map((url: string, idx: number) => ({
                    page_index: idx,
                    original_image_url: url,
                    marked_image_url: idx === 0 ? viewingPaper.marked_image_url : undefined
                  }));
              const totalPages = Math.max(pagesList.length, 1);
              const currentPage = pagesList[viewerPageIdx] || pagesList[0];
              const pageOriginalUrl = currentPage?.original_image_url || viewingPaper.page_images?.[viewerPageIdx] || '';
              const pageMarkedUrl = currentPage?.marked_image_url || (viewerPageIdx === 0 ? viewingPaper.marked_image_url : null);
              const displayUrl = (viewerMode === 'marked' && pageMarkedUrl) ? pageMarkedUrl : pageOriginalUrl;
              const isPageGenerating = generatingPages[viewerPageIdx];

              return (
              <div className="flex-1 flex flex-col md:flex-row overflow-hidden bg-background">
                {/* Visual Canvas Area */}
                <div className="flex-1 flex flex-col overflow-hidden relative border-r border-border">
                  
                  {/* Script Toolbar */}
                  <div className="px-4 py-2.5 bg-surface border-b border-border flex items-center justify-between gap-3 shrink-0 flex-wrap">
                    {/* Page Switcher */}
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setViewerPageIdx(prev => Math.max(0, prev - 1))}
                        disabled={viewerPageIdx === 0}
                        className="p-1.5 hover:bg-border/60 rounded-lg text-text disabled:opacity-30 cursor-pointer"
                        title="Previous Page"
                      >
                        <ChevronLeft className="w-4 h-4" />
                      </button>
                      <span className="text-xs font-semibold text-text">
                        Page {viewerPageIdx + 1} of {totalPages}
                      </span>
                      <button
                        onClick={() => setViewerPageIdx(prev => Math.min(totalPages - 1, prev + 1))}
                        disabled={viewerPageIdx === totalPages - 1}
                        className="p-1.5 hover:bg-border/60 rounded-lg text-text disabled:opacity-30 cursor-pointer"
                        title="Next Page"
                      >
                        <ChevronRight className="w-4 h-4" />
                      </button>
                    </div>

                    {/* Mode selector: Marked vs Original */}
                    <div className="flex items-center gap-1 bg-background border border-border rounded-xl p-0.5 text-xs">
                      <button
                        onClick={() => setViewerMode('marked')}
                        className={`px-3 py-1 rounded-lg font-medium transition-colors cursor-pointer ${
                          viewerMode === 'marked' ? 'bg-primary/20 text-primary font-semibold shadow-sm' : 'text-textMuted hover:text-text'
                        }`}
                      >
                        Red-Ink Marked
                      </button>
                      <button
                        onClick={() => setViewerMode('original')}
                        className={`px-3 py-1 rounded-lg font-medium transition-colors cursor-pointer ${
                          viewerMode === 'original' ? 'bg-primary/20 text-primary font-semibold shadow-sm' : 'text-textMuted hover:text-text'
                        }`}
                      >
                        Original
                      </button>
                    </div>

                    {/* Quick Open in New Tab for raw high-res inspection */}
                    <a
                      href={displayUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-2.5 py-1 text-xs text-textMuted hover:text-primary hover:bg-primary/10 rounded-xl border border-transparent hover:border-primary/20 transition-all font-medium cursor-pointer"
                      title="Open full-resolution image in new browser tab"
                    >
                      Open Raw Image ↗
                    </a>
                  </div>

                  {/* Main Image Display - Fully Contained (Whole image 100% visible on screen) */}
                  <div className="flex-1 min-h-0 p-3 sm:p-5 bg-[#0a0d14] flex items-center justify-center overflow-hidden">
                    <div className="relative w-full h-full flex items-center justify-center">
                      {/* Generation Status Badge */}
                      {viewerMode === 'marked' && isPageGenerating && (
                        <div className="absolute top-3 right-3 z-20 bg-primary/90 backdrop-blur-md text-white text-xs font-semibold px-3 py-1.5 rounded-full shadow-lg flex items-center gap-2">
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                          <span>Rendering Authentic Teacher Red Ink...</span>
                        </div>
                      )}

                      {/* 
                        CONTAINED IMAGE:
                        max-h-full & max-w-full with object-contain ensures the entire page 
                        (top to bottom, left to right) is 100% visible inside the window at all times!
                      */}
                      <img
                        src={displayUrl}
                        alt={`Student submission page ${viewerPageIdx + 1}`}
                        className="max-h-full max-w-full w-auto h-auto object-contain rounded-xl shadow-2xl bg-white select-none border border-gray-300"
                      />
                    </div>
                  </div>

                  {/* Thumbnail Strip */}
                  {totalPages > 1 && (
                    <div className="px-4 py-2.5 bg-surface border-t border-border flex items-center gap-2 overflow-x-auto shrink-0">
                      {pagesList.map((p: any, idx: number) => {
                        const thumbUrl = (viewerMode === 'marked' && p.marked_image_url) 
                          ? p.marked_image_url 
                          : (p.original_image_url || viewingPaper.page_images?.[idx]);
                        return (
                          <button
                            key={idx}
                            onClick={() => setViewerPageIdx(idx)}
                            className={`relative w-12 h-16 rounded-lg overflow-hidden border-2 transition-all shrink-0 cursor-pointer ${
                              viewerPageIdx === idx 
                                ? 'border-primary ring-2 ring-primary/30 scale-105' 
                                : 'border-border/60 opacity-60 hover:opacity-100'
                            }`}
                          >
                            <img src={thumbUrl} alt={`Thumb ${idx + 1}`} className="w-full h-full object-cover" />
                            <span className="absolute bottom-0 inset-x-0 bg-black/80 text-[10px] text-white text-center font-bold">
                              {idx + 1}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Right Side: Question-by-Question Explanation Markings */}
                {showSidebar && (
                <div className="w-full md:w-96 lg:w-[440px] bg-surface flex flex-col overflow-y-auto p-4 shrink-0 border-t md:border-t-0 border-border">
                  <div className="flex items-center justify-between gap-2 mb-3 pb-2 border-b border-border/60">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-text flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-primary" />
                      <span>Question Marking Explanations</span>
                    </h4>
                    <span className="text-[11px] font-semibold text-textMuted bg-background px-2.5 py-0.5 rounded-full border border-border">
                      Page {viewerPageIdx + 1}
                    </span>
                  </div>

                  {(() => {
                    const qSummaries = viewingPaper.assessment_result?.question_summaries || [];
                    
                    // Filter questions that appear on this page if multi-page, or fallback to all questions
                    let relevantQuestions = qSummaries.filter((qs: any) => 
                      Array.isArray(qs.spanned_pages) && qs.spanned_pages.includes(viewerPageIdx)
                    );
                    if (relevantQuestions.length === 0) {
                      relevantQuestions = qSummaries;
                    }

                    // Fallback for single-question assessment
                    if (relevantQuestions.length === 0) {
                      const singleSubparts = viewingPaper.assessment_result?.subparts || [];
                      relevantQuestions = [{
                        question_number: viewingPaper.assessment_result?.identified_question_number || '1',
                        topic: viewingPaper.assessment_result?.identified_topic || 'Exam Question',
                        score: viewingPaper.total_score,
                        max_score: viewingPaper.max_score,
                        subparts: singleSubparts
                      }];
                    }

                    return (
                      <div className="space-y-4">
                        {relevantQuestions.map((qs: any, qIdx: number) => {
                          const qScore = Number(qs.score ?? 0);
                          const qMax = Number(qs.max_score ?? 10);
                          const qPct = qMax > 0 ? Math.round((qScore / qMax) * 100) : 0;
                          
                          const subparts = Array.isArray(qs.subparts) && qs.subparts.length > 0 
                            ? qs.subparts 
                            : (viewingPaper.assessment_result?.subparts || []);

                          // Filter subparts belonging to this page if multi-page and page_index is defined
                          const pageSubparts = subparts.filter((sp: any) => 
                            sp.page_index === undefined || sp.page_index === viewerPageIdx || subparts.length <= 4
                          );
                          const displaySubparts = pageSubparts.length > 0 ? pageSubparts : subparts;

                          return (
                            <div 
                              key={qIdx}
                              className="bg-background/80 border border-border/80 rounded-2xl p-4 space-y-3.5 shadow-sm"
                            >
                              {/* Question Summary Header */}
                              <div className="flex items-start justify-between gap-2 border-b border-border/60 pb-2.5">
                                <div>
                                  <h5 className="font-bold text-text text-sm flex items-center gap-1.5">
                                    <BookOpen className="w-3.5 h-3.5 text-primary" />
                                    <span>Question {qs.question_number}</span>
                                  </h5>
                                  <p className="text-[11px] text-textMuted mt-0.5 line-clamp-1">
                                    {qs.topic || 'Exam Question'}
                                  </p>
                                </div>
                                <div className="text-right shrink-0">
                                  <span className={`inline-flex items-center px-2 py-0.5 rounded-lg text-xs font-bold border ${
                                    qPct >= 75
                                      ? 'bg-[#10b981]/15 text-[#10b981] border-[#10b981]/30'
                                      : qPct >= 50
                                      ? 'bg-blue-500/15 text-blue-400 border-blue-500/30'
                                      : 'bg-error/15 text-error border-error/30'
                                  }`}>
                                    {qScore} / {qMax} marks
                                  </span>
                                </div>
                              </div>

                              {/* Subparts Explanation Cards */}
                              <div className="space-y-3">
                                {displaySubparts.map((sp: any, spIdx: number) => {
                                  const spScore = Number(sp.score ?? 0);
                                  const spMax = Number(sp.max_score ?? 1);
                                  const isFullMarks = spScore === spMax && spMax > 0;
                                  const isZeroMarks = spScore === 0;

                                  return (
                                    <div 
                                      key={spIdx}
                                      className={`rounded-xl p-3 space-y-2 border text-xs transition-colors ${
                                        isFullMarks 
                                          ? 'bg-[#10b981]/5 border-[#10b981]/20' 
                                          : isZeroMarks 
                                          ? 'bg-error/5 border-error/20' 
                                          : 'bg-surface border-border/80'
                                      }`}
                                    >
                                      {/* Subpart Title & Score */}
                                      <div className="flex items-center justify-between gap-2">
                                        <span className="font-bold text-text flex items-center gap-1.5">
                                          <span className="text-primary font-mono font-bold">
                                            Part {sp.part_label || `(${spIdx + 1})`}
                                          </span>
                                        </span>
                                        <span className={`px-2 py-0.5 rounded-md font-bold text-[11px] border ${
                                          isFullMarks
                                            ? 'bg-[#10b981]/20 text-[#10b981] border-[#10b981]/30'
                                            : isZeroMarks
                                            ? 'bg-error/20 text-error border-error/30'
                                            : 'bg-amber-500/20 text-amber-400 border-amber-500/30'
                                        }`}>
                                          {spScore} / {spMax} {spMax === 1 ? 'mark' : 'marks'}
                                        </span>
                                      </div>

                                      {/* Points Awarded (Explanation of Earned Marks) */}
                                      {Array.isArray(sp.marks_awarded) && sp.marks_awarded.length > 0 && (
                                        <div className="space-y-1">
                                          <span className="text-[10px] font-bold uppercase tracking-wider text-[#10b981] flex items-center gap-1">
                                            <Check className="w-3 h-3 text-[#10b981]" />
                                            <span>Mark Scheme Points Earned:</span>
                                          </span>
                                          <div className="space-y-1 pl-1">
                                            {sp.marks_awarded.map((m: string, mi: number) => (
                                              <p key={mi} className="text-text leading-relaxed text-[11px]">
                                                {m}
                                              </p>
                                            ))}
                                          </div>
                                        </div>
                                      )}

                                      {/* Deductions & Mistakes Explanation */}
                                      {Array.isArray(sp.deductions) && sp.deductions.length > 0 && (
                                        <div className="space-y-1">
                                          <span className="text-[10px] font-bold uppercase tracking-wider text-error flex items-center gap-1">
                                            <X className="w-3 h-3 text-error" />
                                            <span>Lost Marks / Reason for Deduction:</span>
                                          </span>
                                          <div className="space-y-1 pl-1">
                                            {sp.deductions.map((d: string, di: number) => (
                                              <p key={di} className="text-error/90 leading-relaxed text-[11px]">
                                                {d}
                                              </p>
                                            ))}
                                          </div>
                                        </div>
                                      )}

                                      {/* Teacher Constructive Correction Note */}
                                      {sp.teacher_correction_note && (
                                        <div className="bg-red-500/10 border border-red-500/25 rounded-lg p-2.5 text-red-200">
                                          <span className="text-[10px] font-bold text-red-400 block mb-0.5">
                                            ✍ Teacher Red-Ink Correction:
                                          </span>
                                          <p className="text-[11px] leading-relaxed font-medium">
                                            {sp.teacher_correction_note}
                                          </p>
                                        </div>
                                      )}

                                      {/* How to Answer / Model Method */}
                                      {sp.constructive_correction && (
                                        <div className="bg-primary/10 border border-primary/20 rounded-lg p-2 text-textMuted">
                                          <span className="text-[10px] font-bold text-primary block mb-0.5">
                                            💡 Examiner Worked Method:
                                          </span>
                                          <p className="text-[11px] leading-relaxed">
                                            {sp.constructive_correction}
                                          </p>
                                        </div>
                                      )}

                                      {/* General Feedback if any */}
                                      {sp.feedback && !sp.marks_awarded && !sp.deductions && (
                                        <p className="text-[11px] text-textMuted leading-relaxed italic">
                                          {sp.feedback}
                                        </p>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    );
                  })()}
                </div>
                )}
              </div>
            );
            })() : (
              /* TAB 2: EXAMINER REPORT & SYLLABUS CRITERIA */
              <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-background">
                {/* Overall Feedback Card */}
                {viewingPaper.assessment_result?.overall_feedback && (
                  <div className="bg-surface border border-border rounded-3xl p-5 shadow-sm space-y-2">
                    <h4 className="text-sm font-bold text-text flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-primary" />
                      <span>Senior Examiner Overall Assessment</span>
                    </h4>
                    <p className="text-xs text-textMuted leading-relaxed">
                      {viewingPaper.assessment_result.overall_feedback}
                    </p>
                  </div>
                )}

                {/* Question-by-Question Breakdown */}
                <div className="space-y-4">
                  <h4 className="text-sm font-bold text-text uppercase tracking-wider text-textMuted">
                    Question-by-Question Performance
                  </h4>

                  {(() => {
                    const qSummaries = viewingPaper.assessment_result?.question_summaries || [];
                    if (qSummaries.length === 0) {
                      return (
                        <p className="text-xs text-textMuted">No itemized question breakdown found.</p>
                      );
                    }

                    return qSummaries.map((qs: any, qIdx: number) => {
                      const qScore = Number(qs.score ?? 0);
                      const qMax = Number(qs.max_score ?? 10);
                      const qPct = qMax > 0 ? Math.round((qScore / qMax) * 100) : 0;

                      return (
                        <div key={qIdx} className="bg-surface border border-border rounded-3xl p-5 shadow-sm space-y-4">
                          <div className="flex items-center justify-between gap-3 border-b border-border/60 pb-3">
                            <div>
                              <h5 className="font-bold text-text text-base">
                                Question {qs.question_number}: {qs.topic || 'Exam Question'}
                              </h5>
                              <span className="text-xs text-textMuted">
                                Spanned Pages: {(qs.spanned_pages || [0]).map((p: number) => p + 1).join(', ')}
                              </span>
                            </div>
                            <div className="text-right">
                              <span className="text-lg font-bold text-text block">
                                {qScore} / {qMax}
                              </span>
                              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${
                                qPct >= 75 
                                  ? 'bg-[#10b981]/15 text-[#10b981] border-[#10b981]/30'
                                  : qPct >= 50
                                  ? 'bg-blue-500/15 text-blue-400 border-blue-500/30'
                                  : 'bg-error/15 text-error border-error/30'
                              }`}>
                                {qPct}%
                              </span>
                            </div>
                          </div>

                          {/* Subparts */}
                          {Array.isArray(qs.subparts) && qs.subparts.length > 0 && (
                            <div className="space-y-3">
                              {qs.subparts.map((sp: any, spIdx: number) => (
                                <div key={spIdx} className="bg-background/60 border border-border/80 rounded-2xl p-3.5 space-y-2 text-xs">
                                  <div className="flex items-center justify-between">
                                    <span className="font-bold text-primary">
                                      Part {sp.part_label || `(${spIdx + 1})`}
                                    </span>
                                    <span className="font-bold text-text">
                                      {sp.score} / {sp.max_score} marks
                                    </span>
                                  </div>

                                  {/* Marks Awarded Points */}
                                  {Array.isArray(sp.marks_awarded) && sp.marks_awarded.length > 0 && (
                                    <div className="space-y-1">
                                      <span className="text-[11px] font-semibold text-[#10b981] block">
                                        Points Earned:
                                      </span>
                                      {sp.marks_awarded.map((m: string, mi: number) => (
                                        <div key={mi} className="flex items-start gap-1.5 text-textMuted">
                                          <Check className="w-3.5 h-3.5 text-[#10b981] shrink-0 mt-0.5" />
                                          <span>{m}</span>
                                        </div>
                                      ))}
                                    </div>
                                  )}

                                  {/* Deductions / Mistakes */}
                                  {Array.isArray(sp.deductions) && sp.deductions.length > 0 && (
                                    <div className="space-y-1">
                                      <span className="text-[11px] font-semibold text-error block">
                                        Lost Marks & Deductions:
                                      </span>
                                      {sp.deductions.map((d: string, di: number) => (
                                        <div key={di} className="flex items-start gap-1.5 text-textMuted">
                                          <X className="w-3.5 h-3.5 text-error shrink-0 mt-0.5" />
                                          <span>{d}</span>
                                        </div>
                                      ))}
                                    </div>
                                  )}

                                  {/* Constructive Teacher Correction */}
                                  {sp.teacher_correction_note && (
                                    <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-2.5 text-red-300">
                                      <strong className="block text-[11px] text-red-400 font-bold mb-0.5">
                                        Teacher Red-Ink Correction Note:
                                      </strong>
                                      <span>{sp.teacher_correction_note}</span>
                                    </div>
                                  )}

                                  {/* Model Answer */}
                                  {sp.constructive_correction && (
                                    <div className="bg-primary/10 border border-primary/20 rounded-xl p-2.5 text-textMuted">
                                      <strong className="block text-[11px] text-primary font-bold mb-0.5">
                                        Examiner Method & How to Answer:
                                      </strong>
                                      <span>{sp.constructive_correction}</span>
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    });
                  })()}
                </div>
              </div>
            )}

          </div>
        </div>
      )}

    </div>
  );
}
