import React, { useState, useEffect, useRef } from 'react';
import {X, Sparkles, Plus, UploadCloud, Search, Trash2, Eye, CheckCircle2, 
  AlertCircle, ChevronRight, ChevronLeft, Award, FileText, ArrowUp, 
  ArrowDown, RotateCcw, ZoomIn, ZoomOut, Check, HelpCircle, BookOpen, 
  Users, BarChart3, Clock, CheckCheck, RefreshCw, Layers, Maximize2, Minimize2, PanelRight, 
  PanelRightClose, Play, Pause, SlidersHorizontal, FolderUp, FileCheck, Loader2} from 'lucide-react';
import { renderPdfToPageImages } from '../lib/pdf-parser';
import { supabase } from '../lib/supabase';
import MarkedPaperOverlay from './MarkedPaperOverlay';
import { ensureAssessmentAnnotations } from '../lib/annotationUtils';

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
  markingMode: 'annotations' | 'ai_image';
  files: { file: File; name: string }[];
  status: 'queued' | 'uploading' | 'marking' | 'completed' | 'error';
  progress: number;
  stepDescription: string;
  errorMessage?: string;
  retries?: number;
  createdAt: number;
}

interface BatchStudentEntry {
  id: string;
  studentName: string;
  studentIdNumber?: string;
  sourceFileName: string;
  files: { file: File; name: string }[];
  pageCount: number;
  selected: boolean;
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
  assessment_result?: any;
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
  // Parallel Background Marking Queue & Worker Pool
  const [queue, setQueue] = useState<MarkingQueueItem[]>([]);
  const queueRef = useRef<MarkingQueueItem[]>([]);
  queueRef.current = queue;
  
  const [concurrency, setConcurrency] = useState<number>(4);
  const [isPaused, setIsPaused] = useState(false);
  const isPausedRef = useRef(false);
  isPausedRef.current = isPaused;

  const [activeCount, setActiveCount] = useState(0);
  const activeWorkerIdsRef = useRef<Set<string>>(new Set());
  const cachedPaperContextRef = useRef<{ manifestOverview: string; submissionQuestionsContext: string } | null>(null);

  // Upload Modal State (Single vs Batch Class)
  const [uploadTab, setUploadTab] = useState<'single' | 'batch'>('batch');
  const [batchEntries, setBatchEntries] = useState<BatchStudentEntry[]>([]);
  const [isParsingBatchPdfs, setIsParsingBatchPdfs] = useState(false);
  const [batchParsingProgress, setBatchParsingProgress] = useState('');
  const [isRenderingSinglePdf, setIsRenderingSinglePdf] = useState(false);
  const batchFileInputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  // Viewer State
  const [viewerPageIdx, setViewerPageIdx] = useState(0);
  const [viewerTab, setViewerTab] = useState<'script' | 'report'>('script');
  // Marking Mode (Token-Saver Vector Annotations vs Generative AI Inpaint Photos)
  const [markingPipelineMode, setMarkingPipelineMode] = useState<'annotations' | 'ai_image'>('annotations');
  const [viewerMode, setViewerMode] = useState<'annotations' | 'marked' | 'original'>('annotations');
  const [showSidebar, setShowSidebar] = useState(true); // Width in px for natural vertical scrolling
  const [selectedAnnotation, setSelectedAnnotation] = useState<any | null>(null);
  const [generatingPages, setGeneratingPages] = useState<Record<number, boolean>>({});
  const [loadingViewerId, setLoadingViewerId] = useState<string | null>(null);
  const [showAnnotationsComments, setShowAnnotationsComments] = useState(true);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchMarkedPapers = async () => {
    if (!paper?.id) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('marked_student_papers')
        .select('id, paper_id, student_name, student_id_number, total_score, max_score, percentage, page_images, created_at')
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

  const handleOpenViewer = async (paperItem: MarkedStudentPaper) => {
    if (paperItem.assessment_result) {
      setViewingPaper(paperItem);
      setViewerPageIdx(0);
      return;
    }
    setLoadingViewerId(paperItem.id);
    try {
      const { data, error } = await supabase
        .from('marked_student_papers')
        .select('id, paper_id, student_name, student_id_number, total_score, max_score, percentage, page_images, marked_image_url, assessment_result, created_at')
        .eq('id', paperItem.id)
        .single();

      if (error) throw error;
      if (data) {
        setViewingPaper(data);
        setViewerPageIdx(0);
        setMarkedPapers(prev => prev.map(p => p.id === data.id ? { ...p, ...data } : p));
      }
    } catch (err: any) {
      console.error('Failed to load marked script details:', err);
      alert('Failed to load marked script: ' + (err.message || err));
    } finally {
      setLoadingViewerId(null);
    }
  };

  useEffect(() => {
    fetchMarkedPapers();
  }, [paper?.id]);

  useEffect(() => {
    if (viewingPaper) {
      if (viewingPaper.marked_image_url || viewingPaper.assessment_result?.marking_mode === 'ai_image') {
        setViewerMode('marked');
      } else {
        setViewerMode('annotations');
      }
    }
  }, [viewingPaper?.id]);

  // Clean up object URLs on unmount
  useEffect(() => {
    return () => {
      selectedFiles.forEach(f => URL.revokeObjectURL(f.preview));
    };
  }, [selectedFiles]);

  // Eager generation of marked image ONLY when user is in 'marked' (AI Photo) mode
  useEffect(() => {
    if (!viewingPaper || viewerMode !== 'marked') return;
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
  }, [viewingPaper?.id, viewerPageIdx, viewerMode]);

  // Helper to cleanly extract a readable student name from file naming conventions
  const cleanStudentNameFromFilename = (filename: string): string => {
    let name = filename.replace(/\.(pdf|jpe?g|png|webp)$/i, '');
    name = name.replace(/^(student|candidate|paper|exam)[_\-\s]*\d+/i, '');
    name = name.replace(/[_\-\s]*(paper|physics|chem|bio|math|zimsec|cambridge|igcse|o_level|a_level)[_\-\s\d]*/gi, ' ');
    name = name.replace(/[_\-]+/g, ' ').trim();
    name = name.replace(/\s+/g, ' ');
    if (!name || name.length < 2) {
      return `Candidate ${Math.floor(100 + Math.random() * 900)}`;
    }
    return name
      .split(' ')
      .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
      .join(' ');
  };

  const handleFilesSelected = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const fileList = Array.from(files);

    const pdfFiles = fileList.filter(f => f.name.toLowerCase().endsWith('.pdf') || f.type === 'application/pdf');
    const imgFiles = fileList.filter(f => f.type.startsWith('image/'));

    // Handle standard images
    if (imgFiles.length > 0) {
      const newItems = imgFiles.map(file => ({
        file,
        preview: URL.createObjectURL(file),
        name: file.name
      }));
      setSelectedFiles(prev => [...prev, ...newItems]);
    }

    // Handle single PDF dropped in single mode (render pages to images)
    if (pdfFiles.length > 0) {
      setIsRenderingSinglePdf(true);
      try {
        for (const pdf of pdfFiles) {
          if (!studentName.trim()) {
            setStudentName(cleanStudentNameFromFilename(pdf.name));
          }
          const renderedPages = await renderPdfToPageImages(pdf);
          const newItems = renderedPages.map(p => ({
            file: p.file,
            preview: URL.createObjectURL(p.file),
            name: p.name
          }));
          setSelectedFiles(prev => [...prev, ...newItems]);
        }
      } catch (err) {
        console.error('Error rendering PDF:', err);
        alert('Could not render PDF pages: ' + (err as any).message);
      } finally {
        setIsRenderingSinglePdf(false);
      }
    }

    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    handleFilesSelected(e.dataTransfer.files);
  };

  // Batch Multi-PDF / Class Upload Handlers
  // Helper to read all entries in a DirectoryEntry in batches (Chromium requires while loop)
  const readAllEntriesInDir = async (dirEntry: any): Promise<any[]> => {
    const dirReader = dirEntry.createReader();
    const allEntries: any[] = [];
    while (true) {
      const batch: any[] = await new Promise((resolve) => {
        dirReader.readEntries((ents: any[]) => resolve(ents || []));
      });
      if (!batch || batch.length === 0) break;
      allEntries.push(...batch);
    }
    return allEntries;
  };

  // Recursively read all image & PDF files from a leaf directory entry
  const readDirectoryFiles = async (dirEntry: any): Promise<{ file: File; name: string }[]> => {
    const entries = await readAllEntriesInDir(dirEntry);
    const results: { file: File; name: string }[] = [];

    for (const ent of entries) {
      if (ent.isFile) {
        const f: File = await new Promise((resolve) => ent.file(resolve));
        if (f.name.toLowerCase().endsWith('.pdf') || f.type === 'application/pdf') {
          try {
            const pages = await renderPdfToPageImages(f);
            results.push(...pages);
          } catch (e) {
            console.warn('PDF parse error inside directory:', f.name, e);
          }
        } else if (f.type.startsWith('image/') || f.name.match(/\.(png|jpe?g|webp)$/i)) {
          results.push({ file: f, name: f.name });
        }
      } else if (ent.isDirectory) {
        const nested = await readDirectoryFiles(ent);
        results.push(...nested);
      }
    }
    return results;
  };

  // Batch Multi-PDF / Class Upload Handlers (Handles files and folder inputs)
  const handleBatchFilesSelected = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const fileList = Array.from(files);
    setIsParsingBatchPdfs(true);
    setBatchParsingProgress('Analyzing files...');

    const newEntries: BatchStudentEntry[] = [];

    try {
      // Check if files come from directories (webkitRelativePath)
      const hasRelativePaths = fileList.some(f => Boolean(f.webkitRelativePath && f.webkitRelativePath.includes('/')));
      if (hasRelativePaths) {
        // Group files by immediate parent folder
        const folderGroups = new Map<string, File[]>();
        for (const file of fileList) {
          if (!file.type.startsWith('image/') && !file.name.match(/\.(png|jpe?g|webp|pdf)$/i)) continue;
          const parts = file.webkitRelativePath.split('/').filter(Boolean);
          // If path is "Students_Batch_Marking/01_Tinashe_Moyo/Page_1.png", folder name is 01_Tinashe_Moyo
          const folderName = parts.length >= 2 ? parts[parts.length - 2] : parts[0];
          if (!folderGroups.has(folderName)) {
            folderGroups.set(folderName, []);
          }
          folderGroups.get(folderName)!.push(file);
        }

        for (const [folderName, grpFiles] of folderGroups.entries()) {
          grpFiles.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
          newEntries.push({
            id: `batch-${Date.now()}-${newEntries.length}-${Math.random().toString(36).substring(5)}`,
            studentName: cleanStudentNameFromFilename(folderName),
            sourceFileName: folderName,
            files: grpFiles.map(f => ({ file: f, name: f.name })),
            pageCount: grpFiles.length,
            selected: true
          });
        }
        setBatchEntries(prev => [...prev, ...newEntries]);
        return;
      }

      // Standard standalone files
      const total = fileList.length;
      for (let i = 0; i < fileList.length; i++) {
        const file = fileList[i];
        setBatchParsingProgress(`Processing file ${i + 1} of ${total}: "${file.name}"...`);

        if (file.name.toLowerCase().endsWith('.pdf') || file.type === 'application/pdf') {
          try {
            const pages = await renderPdfToPageImages(file);
            if (pages.length > 0) {
              newEntries.push({
                id: `batch-${Date.now()}-${i}-${Math.random().toString(36).substring(5)}`,
                studentName: cleanStudentNameFromFilename(file.name),
                sourceFileName: file.name,
                files: pages,
                pageCount: pages.length,
                selected: true
              });
            }
          } catch (pdfErr) {
            console.warn('Failed to parse PDF', file.name, pdfErr);
          }
        } else if (file.type.startsWith('image/')) {
          newEntries.push({
            id: `batch-${Date.now()}-${i}-${Math.random().toString(36).substring(5)}`,
            studentName: cleanStudentNameFromFilename(file.name),
            sourceFileName: file.name,
            files: [{ file, name: file.name }],
            pageCount: 1,
            selected: true
          });
        }
      }

      setBatchEntries(prev => [...prev, ...newEntries]);
    } catch (err: any) {
      console.error('Batch parse error:', err);
      alert('Error analyzing batch files: ' + (err.message || err));
    } finally {
      setIsParsingBatchPdfs(false);
      setBatchParsingProgress('');
      if (batchFileInputRef.current) batchFileInputRef.current.value = '';
    }
  };

  const handleBatchDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);

    // CRITICAL: Extract ALL DataTransferItem entries synchronously BEFORE any await!
    // Chromium invalidates DataTransferItems on the next event loop tick if await is called.
    const rawEntries: any[] = [];
    if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
      for (let i = 0; i < e.dataTransfer.items.length; i++) {
        const item = e.dataTransfer.items[i];
        try {
          const entry = (item as any).webkitGetAsEntry?.();
          if (entry) {
            rawEntries.push(entry);
          }
        } catch (err) {
          console.warn('Error extracting webkit entry:', err);
        }
      }
    }

    if (rawEntries.length === 0) {
      // Fallback to standard files if no webkit entries
      handleBatchFilesSelected(e.dataTransfer.files);
      return;
    }

    setIsParsingBatchPdfs(true);
    setBatchParsingProgress('Scanning dropped folders & files...');
    const newEntries: BatchStudentEntry[] = [];

    try {
      // Expand any container directory (e.g. if teacher dropped the parent "Students_Batch_Marking" folder)
      const studentTargets: { name: string; entry: any }[] = [];

      for (const entry of rawEntries) {
        if (entry.isDirectory) {
          const children = await readAllEntriesInDir(entry);
          const subDirs = children.filter(c => c.isDirectory);
          if (subDirs.length > 0) {
            // Container directory: unpack each subfolder as an individual student
            for (const sub of subDirs) {
              studentTargets.push({ name: sub.name, entry: sub });
            }
          } else {
            // Leaf directory for one student
            studentTargets.push({ name: entry.name, entry });
          }
        } else if (entry.isFile) {
          studentTargets.push({ name: entry.name, entry });
        }
      }

      // Process all detected student targets
      for (let idx = 0; idx < studentTargets.length; idx++) {
        const target = studentTargets[idx];
        setBatchParsingProgress(`Reading student ${idx + 1} of ${studentTargets.length}: "${target.name}"...`);

        if (target.entry.isDirectory) {
          const dirFiles = await readDirectoryFiles(target.entry);
          // Sort pages naturally: Page_1, Page_2, etc.
          dirFiles.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));

          if (dirFiles.length > 0) {
            newEntries.push({
              id: `batch-${Date.now()}-${idx}-${Math.random().toString(36).substring(5)}`,
              studentName: cleanStudentNameFromFilename(target.name),
              sourceFileName: target.name,
              files: dirFiles,
              pageCount: dirFiles.length,
              selected: true
            });
          }
        } else if (target.entry.isFile) {
          const file: File = await new Promise((resolve) => target.entry.file(resolve));
          if (file.name.toLowerCase().endsWith('.pdf') || file.type === 'application/pdf') {
            const pages = await renderPdfToPageImages(file);
            if (pages.length > 0) {
              newEntries.push({
                id: `batch-${Date.now()}-${idx}-${Math.random().toString(36).substring(5)}`,
                studentName: cleanStudentNameFromFilename(file.name),
                sourceFileName: file.name,
                files: pages,
                pageCount: pages.length,
                selected: true
              });
            }
          } else if (file.type.startsWith('image/')) {
            newEntries.push({
              id: `batch-${Date.now()}-${idx}-${Math.random().toString(36).substring(5)}`,
              studentName: cleanStudentNameFromFilename(file.name),
              sourceFileName: file.name,
              files: [{ file, name: file.name }],
              pageCount: 1,
              selected: true
            });
          }
        }
      }

      // Sort entries naturally by student name / folder prefix
      newEntries.sort((a, b) => a.sourceFileName.localeCompare(b.sourceFileName, undefined, { numeric: true }));
      setBatchEntries(prev => [...prev, ...newEntries]);
    } catch (err: any) {
      console.error('Batch drop parsing error:', err);
      alert('Error parsing dropped folders: ' + (err.message || err));
    } finally {
      setIsParsingBatchPdfs(false);
      setBatchParsingProgress('');
    }
  };

  const handleQueueBatchStudents = () => {
    const selected = batchEntries.filter(b => b.selected);
    if (selected.length === 0) {
      alert('Please select at least one student paper to queue.');
      return;
    }

    const newQueueItems: MarkingQueueItem[] = selected.map((item, idx) => ({
      id: `queue-${Date.now()}-${idx}-${Math.random().toString(36).substring(5)}`,
      studentName: item.studentName.trim() || `Candidate ${idx + 1}`,
      studentIdNumber: item.studentIdNumber?.trim() || undefined,
      markingMode: markingPipelineMode,
      files: item.files,
      status: 'queued',
      progress: 0,
      stepDescription: 'Waiting in queue...',
      createdAt: Date.now() + idx
    }));

    setQueue(prev => [...prev, ...newQueueItems]);
    setBatchEntries([]);
    setShowUploadModal(false);
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
      markingMode: markingPipelineMode,
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

    const handleClearCompleted = () => {
    setQueue(prev => prev.filter(item => item.status !== 'completed'));
  };

  const handleCancelQueued = () => {
    setQueue(prev => prev.filter(item => item.status !== 'queued'));
  };

  const getPaperQuestionsContext = async () => {
    if (cachedPaperContextRef.current) {
      return cachedPaperContextRef.current;
    }
    const ctx = await fetchCompletePaperQuestionsContext(paper.id, paper);
    cachedPaperContextRef.current = ctx;
    return ctx;
  };

  const processQueueItem = async (currentId: string) => {
    const currentItem = queueRef.current.find(item => item.id === currentId);
    if (!currentItem) return;

    setQueue(prev => prev.map(it => it.id === currentId ? {
      ...it,
      status: 'uploading',
      stepDescription: `Uploading ${currentItem.files.length} scans to storage in parallel...`,
      progress: 15
    } : it));

    try {
      // Step 1: Upload images in parallel to Supabase storage bucket 'student_attempts'
      const uploadPromises = currentItem.files.map(async (fItem, i) => {
        const ext = fItem.file.name.split('.').pop() || 'jpg';
        const storagePath = `bulk_markings/${paper.id}/${Date.now()}_${i}_${Math.random().toString(36).substring(7)}.${ext}`;
        try {
          const { error: uploadErr } = await supabase.storage
            .from('student_attempts')
            .upload(storagePath, fItem.file, { cacheControl: '3600', upsert: true });

          if (uploadErr) {
            console.warn('Storage upload error, using base64 fallback:', uploadErr);
            return await fileToBase64(fItem.file);
          } else {
            const { data: pubData } = supabase.storage
              .from('student_attempts')
              .getPublicUrl(storagePath);
            return pubData.publicUrl;
          }
        } catch (upErr) {
          console.warn('Upload catch, using base64:', upErr);
          return await fileToBase64(fItem.file);
        }
      });

      const uploadedUrls = await Promise.all(uploadPromises);

      // Step 2: Fetch complete questions & official mark scheme context (cached)
      setQueue(prev => prev.map(it => it.id === currentId ? {
        ...it,
        status: 'marking',
        stepDescription: 'Chief Examiner evaluating working & inking marks...',
        progress: 45
      } : it));

      const { manifestOverview, submissionQuestionsContext } = await getPaperQuestionsContext();

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
   - Stamp margin subpart fractions (e.g. "(2/2)").
   - Stamp question total score (e.g. "Total: 8/9").`;

      // Step 3: Invoke tutor-chat with exponential backoff on 429
      let data: any = null;
      let error: any = null;
      const maxRetries = 3;

      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
          const resp = await supabase.functions.invoke('tutor-chat', {
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
              seed: 42,
              temperature: 0.0,
              student_answer: currentItem.studentNotes?.trim() || undefined,
              generate_marked_image: currentItem.markingMode === 'ai_image',
              metadata: {
                student_name: currentItem.studentName.trim(),
                student_id_number: currentItem.studentIdNumber?.trim() || undefined,
                role: 'teacher_bulk_marking'
              }
            }
          });

          if (resp.error) {
            const errStr = resp.error.message || String(resp.error);
            const isRateLimit = errStr.includes('429') || errStr.toLowerCase().includes('rate limit');
            const isTimeout = errStr.includes('504') || errStr.toLowerCase().includes('timeout');
            if ((isRateLimit || isTimeout) && attempt < maxRetries) {
              const backoffSec = Math.round(2 + attempt * 3 + Math.random() * 2);
              setQueue(prev => prev.map(it => it.id === currentId ? {
                ...it,
                retries: attempt + 1,
                stepDescription: `Rate limit hit — cooling down for ${backoffSec}s (retry ${attempt + 1}/${maxRetries})...`
              } : it));
              await new Promise(r => setTimeout(r, backoffSec * 1000));
              continue;
            }
            throw new Error(errStr);
          }

          data = resp.data;
          error = null;
          break;
        } catch (callErr: any) {
          const errStr = callErr.message || String(callErr);
          const isRateLimit = errStr.includes('429') || errStr.toLowerCase().includes('rate limit');
          if (isRateLimit && attempt < maxRetries) {
            const backoffSec = Math.round(2 + attempt * 3 + Math.random() * 2);
            setQueue(prev => prev.map(it => it.id === currentId ? {
              ...it,
              retries: attempt + 1,
              stepDescription: `Rate limit hit — cooling down for ${backoffSec}s (retry ${attempt + 1}/${maxRetries})...`
            } : it));
            await new Promise(r => setTimeout(r, backoffSec * 1000));
            continue;
          }
          error = callErr;
          break;
        }
      }

      if (error || !data) {
        throw error || new Error('Marking agent failed to assess attempt');
      }

      setQueue(prev => prev.map(it => it.id === currentId ? {
        ...it,
        stepDescription: 'Finalizing assessment & saving marked script...',
        progress: 88
      } : it));

      const assessment = data?.assessment || {};
      const totalScore = Number(assessment.total_score ?? 0);
      const maxScore = Number(assessment.total_max_score ?? 0);
      const percentage = maxScore > 0 
        ? Math.round((totalScore / maxScore) * 100) 
        : Number(assessment.percentage ?? 0);

      // Reconcile primary marked image and ensure it is uploaded to storage if base64
      let primaryMarkedUrl = data?.marked_image_url || assessment.pages?.[0]?.marked_image_url || null;
      if (primaryMarkedUrl && typeof primaryMarkedUrl === 'string' && (primaryMarkedUrl.startsWith('data:image') || primaryMarkedUrl.length > 500)) {
        try {
          const b64Data = primaryMarkedUrl.includes(',') ? primaryMarkedUrl.split(',')[1] : primaryMarkedUrl;
          const byteCharacters = atob(b64Data);
          const byteNumbers = new Array(byteCharacters.length);
          for (let b = 0; b < byteCharacters.length; b++) {
            byteNumbers[b] = byteCharacters.charCodeAt(b);
          }
          const byteArray = new Uint8Array(byteNumbers);
          const blob = new Blob([byteArray], { type: 'image/png' });
          const storagePath = `bulk_markings/${paper.id}/${Date.now()}_marked_${Math.random().toString(36).substring(7)}.png`;
          const { error: upErr } = await supabase.storage
            .from('student_attempts')
            .upload(storagePath, blob, { contentType: 'image/png', upsert: true });
          if (!upErr) {
            const { data: pubData } = supabase.storage.from('student_attempts').getPublicUrl(storagePath);
            primaryMarkedUrl = pubData.publicUrl;
            if (assessment.pages?.[0]?.marked_image_url) {
              assessment.pages[0].marked_image_url = pubData.publicUrl;
            }
          } else {
            console.warn('Could not upload marked image to storage:', upErr);
            primaryMarkedUrl = null;
            if (assessment.pages?.[0]?.marked_image_url) {
              assessment.pages[0].marked_image_url = null;
            }
          }
        } catch (e) {
          console.warn('Could not upload marked image to storage:', e);
          primaryMarkedUrl = null;
          if (assessment.pages?.[0]?.marked_image_url) {
            assessment.pages[0].marked_image_url = null;
          }
        }
      }

      // Sanitize assessment pages so no huge base64 strings get saved into JSON
      if (Array.isArray(assessment.pages)) {
        for (const p of assessment.pages) {
          if (p.marked_image_url && typeof p.marked_image_url === 'string' && (p.marked_image_url.startsWith('data:image') || p.marked_image_url.length > 500)) {
            if (primaryMarkedUrl && !primaryMarkedUrl.startsWith('data:image')) {
              p.marked_image_url = primaryMarkedUrl;
            } else {
              p.marked_image_url = null;
            }
          }
        }
      }

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
        .select('id, paper_id, student_name, student_id_number, total_score, max_score, percentage, page_images, created_at')
        .single();

      if (insertErr) throw insertErr;

      // Optimistic instant update of table
      if (inserted) {
        setMarkedPapers(prev => [inserted, ...prev.filter(p => p.id !== inserted.id)]);
      }
      if (onPaperUpdated) onPaperUpdated();

      setQueue(prev => prev.map(it => it.id === currentId ? {
        ...it,
        status: 'completed',
        progress: 100,
        stepDescription: `Marking complete! Scored ${totalScore}/${maxScore} (${percentage}%)`
      } : it));

      // Auto-remove completed item after 6 seconds
      setTimeout(() => {
        setQueue(prev => prev.filter(it => it.id !== currentId));
      }, 6000);

    } catch (err: any) {
      console.error('Queue processing error for', currentItem?.studentName, err);
      setQueue(prev => prev.map(it => it.id === currentId ? {
        ...it,
        status: 'error',
        errorMessage: err.message || 'Marking failed',
        stepDescription: 'Marking encountered an error'
      } : it));
    }
  };

  const dispatchQueue = () => {
    if (isPausedRef.current) return;

    const currentQueue = queueRef.current;
    const queuedItems = currentQueue.filter(
      item => item.status === 'queued' && !activeWorkerIdsRef.current.has(item.id)
    );

    const availableSlots = concurrency - activeWorkerIdsRef.current.size;
    if (availableSlots <= 0 || queuedItems.length === 0) return;

    const itemsToStart = queuedItems.slice(0, availableSlots);
    for (const item of itemsToStart) {
      activeWorkerIdsRef.current.add(item.id);
      setActiveCount(activeWorkerIdsRef.current.size);

      processQueueItem(item.id).finally(() => {
        activeWorkerIdsRef.current.delete(item.id);
        setActiveCount(activeWorkerIdsRef.current.size);
        // Stagger dispatch slightly to spread API calls smoothly
        setTimeout(() => {
          dispatchQueue();
        }, 350);
      });
    }
  };

  useEffect(() => {
    dispatchQueue();
  }, [queue, concurrency, isPaused]);

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
            {activeCount > 0 && (
              <div className="hidden sm:flex items-center gap-2 bg-primary/10 border border-primary/25 text-primary text-xs font-semibold px-3 py-2 rounded-2xl animate-pulse">
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                <span>Parallel Marking Active ({activeCount}/{concurrency} Workers)</span>
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
          {queue.length > 0 && (() => {
            const activeItems = queue.filter(q => q.status === 'uploading' || q.status === 'marking');
            const queuedItems = queue.filter(q => q.status === 'queued');
            const completedItems = queue.filter(q => q.status === 'completed');
            const errorItems = queue.filter(q => q.status === 'error');
            const totalCount = queue.length;
            const progressPct = totalCount > 0 ? Math.round((completedItems.length / totalCount) * 100) : 0;

            // Sort queue: active first, then queued, then error, then completed
            const sortedQueue = [...queue].sort((a, b) => {
              const score = (s: string) => s === 'uploading' || s === 'marking' ? 1 : s === 'queued' ? 2 : s === 'error' ? 3 : 4;
              return score(a.status) - score(b.status);
            });

            return (
              <div className="mb-6 bg-surface border border-primary/30 rounded-2xl p-4 shadow-sm space-y-4">
                {/* Panel Header & Controls */}
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pb-3 border-b border-border/80">
                  <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shrink-0">
                      <Sparkles className="w-4 h-4 animate-spin" style={{ animationDuration: '4s' }} />
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-text uppercase tracking-wider flex items-center gap-2 flex-wrap">
                        <span>Parallel Examiner Pool</span>
                        <span className="bg-primary/20 text-primary text-[10px] px-2 py-0.5 rounded-full font-semibold">
                          {activeItems.length > 0 ? `${activeItems.length} Active` : isPaused ? 'Paused' : 'Idle'}
                          {queuedItems.length > 0 && ` • ${queuedItems.length} Queued`}
                          {completedItems.length > 0 && ` • ${completedItems.length} Done`}
                        </span>
                      </h4>
                      <p className="text-[11px] text-textMuted mt-0.5">
                        Grading multi-student batches concurrently with OpenAI prompt caching and collision-free grounding.
                      </p>
                    </div>
                  </div>

                  {/* Worker Concurrency & Action Controls */}
                  <div className="flex items-center gap-2 flex-wrap self-start lg:self-auto">
                    {/* Concurrency Selector */}
                    <div className="flex items-center bg-background border border-border rounded-xl p-0.5 text-xs">
                      <span className="px-2 text-[10px] text-textMuted font-semibold flex items-center gap-1">
                        <SlidersHorizontal className="w-3 h-3" />
                        Workers:
                      </span>
                      {[2, 4, 6].map((num) => (
                        <button
                          key={num}
                          onClick={() => setConcurrency(num)}
                          className={`px-2 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                            concurrency === num
                              ? 'bg-primary text-white shadow-sm'
                              : 'text-textMuted hover:text-text hover:bg-border/40'
                          }`}
                          title={`Run ${num} student papers concurrently`}
                        >
                          {num}x{num === 4 ? ' ★' : ''}
                        </button>
                      ))}
                    </div>

                    {/* Pause / Resume Button */}
                    <button
                      onClick={() => setIsPaused(prev => !prev)}
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all cursor-pointer ${
                        isPaused
                          ? 'bg-amber-500/15 border-amber-500/30 text-amber-400 hover:bg-amber-500/25'
                          : 'bg-background hover:bg-border/50 border-border text-textMuted hover:text-text'
                      }`}
                      title={isPaused ? 'Resume marking queue' : 'Pause queue after active papers'}
                    >
                      {isPaused ? <Play className="w-3.5 h-3.5 fill-current" /> : <Pause className="w-3.5 h-3.5" />}
                      <span>{isPaused ? 'Resume' : 'Pause'}</span>
                    </button>

                    {/* Clear / Cancel Controls */}
                    {completedItems.length > 0 && (
                      <button
                        onClick={handleClearCompleted}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-background hover:bg-border/50 border border-border text-textMuted hover:text-text rounded-xl text-xs font-medium transition-colors cursor-pointer"
                        title="Clear completed students from queue"
                      >
                        Clear Done
                      </button>
                    )}

                    {queuedItems.length > 0 && (
                      <button
                        onClick={handleCancelQueued}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-background hover:bg-error/15 border border-border hover:border-error/30 text-textMuted hover:text-error rounded-xl text-xs font-medium transition-colors cursor-pointer"
                        title="Cancel all waiting student papers"
                      >
                        Cancel Waiting
                      </button>
                    )}

                    <button
                      onClick={() => {
                        resetUploadForm();
                        setShowUploadModal(true);
                      }}
                      className="inline-flex items-center gap-1.5 bg-primary/15 hover:bg-primary/25 text-primary border border-primary/30 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ml-auto sm:ml-0"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Add Papers</span>
                    </button>
                  </div>
                </div>

                {/* Batch Progress Bar */}
                {totalCount > 1 && (
                  <div className="bg-background/60 border border-border/60 rounded-xl p-2.5 space-y-1.5">
                    <div className="flex items-center justify-between text-xs text-textMuted">
                      <span className="font-medium text-text">
                        Batch Progress: {completedItems.length} of {totalCount} Papers Graded
                      </span>
                      <span className="font-mono font-bold text-primary">{progressPct}%</span>
                    </div>
                    <div className="w-full bg-border/60 rounded-full h-2 overflow-hidden">
                      <div
                        className="bg-primary h-full transition-all duration-500 rounded-full"
                        style={{ width: `${progressPct}%` }}
                      />
                    </div>
                  </div>
                )}

                {/* Queue Items List */}
                <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                  {sortedQueue.map((item, idx) => {
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
                            {isActive ? (
                              <RefreshCw className="w-3.5 h-3.5 animate-spin text-primary" />
                            ) : isCompleted ? (
                              <Check className="w-4 h-4" />
                            ) : isError ? (
                              <AlertCircle className="w-4 h-4" />
                            ) : (
                              idx + 1
                            )}
                          </div>

                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-text text-xs truncate">{item.studentName}</span>
                              {item.studentIdNumber && (
                                <span className="text-[10px] text-textMuted font-mono">({item.studentIdNumber})</span>
                              )}
                              <span className="text-[10px] text-textMuted">• {item.files.length} {item.files.length === 1 ? 'page' : 'pages'}</span>
                              {item.retries && item.retries > 0 && (
                                <span className="text-[9px] bg-amber-500/15 text-amber-400 border border-amber-500/30 px-1.5 py-0.2 rounded font-mono">
                                  Retry {item.retries}/3
                                </span>
                              )}
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
            );
          })()}
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
                              onClick={() => handleOpenViewer(paperItem)}
                              disabled={loadingViewerId === paperItem.id}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-primary/10 text-primary border border-primary/20 hover:bg-primary/20 transition-all cursor-pointer shadow-sm disabled:opacity-50"
                              title="View Full Marked Paper Script"
                            >
                              {loadingViewerId === paperItem.id ? (
                                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                              ) : (
                                <Eye className="w-3.5 h-3.5" />
                              )}
                              <span>{loadingViewerId === paperItem.id ? 'Loading...' : 'View Marked Script'}</span>
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
      {/* SUB-MODAL: MARK NEW STUDENT PAPERS (SINGLE OR BATCH WHOLE CLASS) */}
      {/* ========================================================================= */}
      {showUploadModal && (
        <div className="fixed inset-0 z-60 bg-black/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-6">
          <div className="bg-surface border border-border rounded-3xl w-full max-w-3xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden relative">
            
            {/* Modal Header */}
            <div className="px-6 py-5 border-b border-border bg-background/50 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shrink-0">
                  <Sparkles className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-text">Mark Student Papers</h3>
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

            {/* Mode Switcher Tabs */}
            <div className="px-6 pt-4 pb-1 border-b border-border/80 bg-background/30 flex items-center gap-2">
              <button
                onClick={() => setUploadTab('batch')}
                className={`flex items-center gap-2 px-4 py-2 rounded-2xl text-xs font-bold transition-all cursor-pointer ${
                  uploadTab === 'batch'
                    ? 'bg-primary text-white shadow-md shadow-primary/20'
                    : 'text-textMuted hover:text-text hover:bg-surface border border-transparent'
                }`}
              >
                <FolderUp className="w-4 h-4" />
                <span>Batch Upload Class (Multi-PDF / Folder)</span>
                <span className={`text-[10px] px-2 py-0.2 rounded-full ${
                  uploadTab === 'batch' ? 'bg-white/20 text-white' : 'bg-primary/10 text-primary'
                }`}>
                  High-Throughput
                </span>
              </button>

              <button
                onClick={() => setUploadTab('single')}
                className={`flex items-center gap-2 px-4 py-2 rounded-2xl text-xs font-bold transition-all cursor-pointer ${
                  uploadTab === 'single'
                    ? 'bg-primary text-white shadow-md shadow-primary/20'
                    : 'text-textMuted hover:text-text hover:bg-surface border border-transparent'
                }`}
              >
                <FileCheck className="w-4 h-4" />
                <span>Single Student Paper</span>
              </button>
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-y-auto p-6 space-y-5">
              
              {/* Marking Pipeline Mode (Vector Annotations vs Generative AI Inpaint) */}
              <div>
                <label className="block text-xs font-semibold text-textMuted uppercase tracking-wider mb-2">
                  Examiner Marking Pipeline
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div
                    onClick={() => setMarkingPipelineMode('annotations')}
                    className={`p-3.5 rounded-2xl border cursor-pointer transition-all ${
                      markingPipelineMode === 'annotations'
                        ? 'border-primary bg-primary/10 shadow-sm'
                        : 'border-border bg-background/50 hover:bg-background'
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className="text-base">✏️</span>
                      <span className="text-xs font-bold text-text">Vector Annotations</span>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#10b981]/15 text-[#10b981] border border-[#10b981]/30 ml-auto">
                        0 Image Tokens
                      </span>
                    </div>
                    <p className="text-[11px] text-textMuted leading-relaxed">
                      Examiner visual assessment with collision-free checkmarks, subpart fractions & handwritten red teacher corrections.
                    </p>
                  </div>

                  <div
                    onClick={() => setMarkingPipelineMode('ai_image')}
                    className={`p-3.5 rounded-2xl border cursor-pointer transition-all ${
                      markingPipelineMode === 'ai_image'
                        ? 'border-primary bg-primary/10 shadow-sm'
                        : 'border-border bg-background/50 hover:bg-background'
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className="text-base">🤖</span>
                      <span className="text-xs font-bold text-text">AI Photo Inpaint</span>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/30 ml-auto">
                        Uses Image Tokens
                      </span>
                    </div>
                    <p className="text-[11px] text-textMuted leading-relaxed">
                      Synthesizes red ballpoint pen directly into pixels using generative image models. Consumes image tokens.
                    </p>
                  </div>
                </div>
              </div>

              {/* TAB 1: BATCH CLASS UPLOAD */}
              {uploadTab === 'batch' && (
                <div className="space-y-4">
                  {/* Batch Drop Zone */}
                  <div>
                    <label className="block text-xs font-semibold text-textMuted uppercase tracking-wider mb-2">
                      Upload Class Exams (Drop Multiple PDFs or Scans)
                    </label>

                    <div
                      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                      onDragLeave={() => setDragOver(false)}
                      onDrop={handleBatchDrop}
                      onClick={() => !isParsingBatchPdfs && batchFileInputRef.current?.click()}
                      className={`border-2 border-dashed rounded-3xl p-7 text-center cursor-pointer transition-all flex flex-col items-center justify-center gap-3 ${
                        isParsingBatchPdfs
                          ? 'border-primary/50 bg-primary/5 cursor-wait'
                          : dragOver 
                          ? 'border-primary bg-primary/10 scale-[1.01]' 
                          : 'border-border hover:border-primary/50 bg-background/50 hover:bg-background'
                      }`}
                    >
                      <input 
                        type="file" 
                        ref={batchFileInputRef}
                        multiple 
                        accept=".pdf,image/*" 
                        onChange={(e) => handleBatchFilesSelected(e.target.files)} 
                        className="hidden" 
                      />

                      {isParsingBatchPdfs ? (
                        <>
                          <div className="w-12 h-12 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary">
                            <Loader2 className="w-6 h-6 animate-spin" />
                          </div>
                          <div>
                            <p className="text-sm font-bold text-text">Rendering and analyzing student papers...</p>
                            <p className="text-xs text-primary font-mono mt-1">{batchParsingProgress}</p>
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="w-12 h-12 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary">
                            <FolderUp className="w-6 h-6" />
                          </div>
                          <div>
                            <p className="text-sm font-semibold text-text">
                              Click or drag and drop up to 200 student PDFs or scanned booklets
                            </p>
                            <p className="text-xs text-textMuted mt-1">
                              Supports multi-page PDFs (e.g. 7 pages per paper). Student names are auto-detected from filenames.
                            </p>
                          </div>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Batch Entries Table */}
                  {batchEntries.length > 0 && (
                    <div className="space-y-3 pt-2">
                      <div className="flex items-center justify-between text-xs px-1">
                        <div className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={batchEntries.every(b => b.selected)}
                            onChange={(e) => {
                              const checked = e.target.checked;
                              setBatchEntries(prev => prev.map(b => ({ ...b, selected: checked })));
                            }}
                            className="rounded border-border text-primary cursor-pointer"
                          />
                          <span className="font-semibold text-text">
                            {batchEntries.filter(b => b.selected).length} of {batchEntries.length} Students Selected
                          </span>
                          <span className="text-textMuted font-mono">
                            ({batchEntries.reduce((acc, b) => b.selected ? acc + b.pageCount : acc, 0)} Total Pages)
                          </span>
                        </div>

                        <button
                          type="button"
                          onClick={() => setBatchEntries([])}
                          className="text-error hover:underline text-[11px] font-medium cursor-pointer"
                        >
                          Clear list
                        </button>
                      </div>

                      <div className="border border-border rounded-2xl max-h-72 overflow-y-auto divide-y divide-border/60 bg-background/50">
                        {batchEntries.map((entry, idx) => (
                          <div key={entry.id} className="p-3 flex items-center justify-between gap-3 hover:bg-surface/50 transition-colors">
                            <div className="flex items-center gap-3 min-w-0 flex-1">
                              <input
                                type="checkbox"
                                checked={entry.selected}
                                onChange={(e) => {
                                  const checked = e.target.checked;
                                  setBatchEntries(prev => prev.map(b => b.id === entry.id ? { ...b, selected: checked } : b));
                                }}
                                className="rounded border-border text-primary cursor-pointer shrink-0"
                              />
                              <span className="text-xs font-mono text-textMuted w-5 shrink-0">#{idx + 1}</span>
                              <div className="flex-1 min-w-0">
                                <input
                                  type="text"
                                  value={entry.studentName}
                                  onChange={(e) => {
                                    const val = e.target.value;
                                    setBatchEntries(prev => prev.map(b => b.id === entry.id ? { ...b, studentName: val } : b));
                                  }}
                                  placeholder="Student Name"
                                  className="w-full px-2.5 py-1 text-xs font-semibold text-text bg-background border border-border/80 rounded-lg focus:outline-none focus:border-primary"
                                />
                                <div className="flex items-center gap-2 mt-1 text-[10px] text-textMuted">
                                  <span className="truncate max-w-[200px]" title={entry.sourceFileName}>
                                    📄 {entry.sourceFileName}
                                  </span>
                                  <span className="px-1.5 py-0.2 rounded bg-primary/10 text-primary font-bold">
                                    {entry.pageCount} {entry.pageCount === 1 ? 'page' : 'pages'}
                                  </span>
                                </div>
                              </div>
                            </div>

                            <button
                              type="button"
                              onClick={() => setBatchEntries(prev => prev.filter(b => b.id !== entry.id))}
                              className="p-1.5 text-textMuted hover:text-error hover:bg-error/10 rounded-lg transition-colors cursor-pointer shrink-0"
                              title="Remove"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        ))}
                      </div>

                      {/* Batch Action Bar */}
                      <div className="pt-3 border-t border-border flex items-center justify-between gap-3">
                        <div className="text-[11px] text-textMuted">
                          Estimated marking duration: <span className="text-text font-semibold">~1-2 minutes</span> with {concurrency}x parallel workers.
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setShowUploadModal(false)}
                            className="px-4 py-2 border border-border hover:bg-border/40 text-textMuted hover:text-text rounded-2xl text-xs font-medium transition-colors cursor-pointer"
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            onClick={handleQueueBatchStudents}
                            disabled={batchEntries.filter(b => b.selected).length === 0 || isParsingBatchPdfs}
                            className="flex items-center gap-2 bg-primary hover:bg-primaryHover disabled:opacity-50 text-white px-5 py-2.5 rounded-2xl text-xs font-bold transition-all shadow-md cursor-pointer"
                          >
                            <Sparkles className="w-4 h-4" />
                            <span>
                              Queue Batch ({batchEntries.filter(b => b.selected).length} Students)
                            </span>
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* TAB 2: SINGLE STUDENT PAPER FORM */}
              {uploadTab === 'single' && (
                <form onSubmit={handleQueueStudentPaper} className="space-y-4">
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

                  {/* Image/PDF Upload Area */}
                  <div>
                    <label className="block text-xs font-semibold text-textMuted uppercase tracking-wider mb-2">
                      Upload Answer Script / Booklet <span className="text-error">*</span>
                    </label>

                    <div
                      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                      onDragLeave={() => setDragOver(false)}
                      onDrop={handleDrop}
                      onClick={() => !isRenderingSinglePdf && fileInputRef.current?.click()}
                      className={`border-2 border-dashed rounded-3xl p-6 text-center cursor-pointer transition-all flex flex-col items-center justify-center gap-2.5 ${
                        isRenderingSinglePdf
                          ? 'border-primary/50 bg-primary/5 cursor-wait'
                          : dragOver 
                          ? 'border-primary bg-primary/10 scale-[1.01]' 
                          : 'border-border hover:border-primary/50 bg-background/50 hover:bg-background'
                      }`}
                    >
                      <input 
                        type="file" 
                        ref={fileInputRef}
                        multiple 
                        accept=".pdf,image/*" 
                        onChange={(e) => handleFilesSelected(e.target.files)} 
                        className="hidden" 
                      />
                      
                      {isRenderingSinglePdf ? (
                        <>
                          <div className="w-12 h-12 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary">
                            <Loader2 className="w-6 h-6 animate-spin" />
                          </div>
                          <div>
                            <p className="text-sm font-semibold text-text">
                              Rendering PDF pages into high-res images...
                            </p>
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="w-12 h-12 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary">
                            <UploadCloud className="w-6 h-6" />
                          </div>
                          <div>
                            <p className="text-sm font-semibold text-text">
                              Click or drag and drop handwritten answer pages or PDF
                            </p>
                            <p className="text-xs text-textMuted mt-0.5">
                              Supports multi-page PDFs, PNG, JPG, JPEG, WEBP.
                            </p>
                          </div>
                        </>
                      )}
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
              )}
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

                    {/* Comments on/off toggle for annotations mode */}
                    {viewerMode === 'annotations' && (
                      <button
                        onClick={() => setShowAnnotationsComments(prev => !prev)}
                        className={`px-2.5 py-1 text-xs rounded-xl font-medium border transition-colors cursor-pointer flex items-center gap-1.5 ${
                          showAnnotationsComments
                            ? 'bg-red-500/10 border-red-500/30 text-red-400 font-semibold shadow-xs'
                            : 'bg-background border-border text-textMuted hover:text-text'
                        }`}
                        title="Toggle visible examiner comments and correction notes on the paper"
                      >
                        <span>💬</span>
                        <span>{showAnnotationsComments ? 'Comments On' : 'Comments Off'}</span>
                      </button>
                    )}

                    {/* Mode selector: Annotations vs AI Photo vs Original */}
                    <div className="flex items-center gap-1 bg-background border border-border rounded-xl p-0.5 text-xs">
                      <button
                        onClick={() => setViewerMode('annotations')}
                        className={`px-3 py-1 rounded-lg font-medium transition-colors cursor-pointer flex items-center gap-1.5 ${
                          viewerMode === 'annotations' ? 'bg-primary/20 text-primary font-semibold shadow-sm' : 'text-textMuted hover:text-text'
                        }`}
                        title="Interactive vector ticks, mark badges & comments (Zero Image Tokens)"
                      >
                        <span>✏️</span>
                        <span>Annotations</span>
                      </button>
                      <button
                        onClick={() => setViewerMode('marked')}
                        className={`px-3 py-1 rounded-lg font-medium transition-colors cursor-pointer flex items-center gap-1.5 ${
                          viewerMode === 'marked' ? 'bg-primary/20 text-primary font-semibold shadow-sm' : 'text-textMuted hover:text-text'
                        }`}
                        title="Generative photorealistic marked image"
                      >
                        <span>🤖</span>
                        <span>AI Photo</span>
                      </button>
                      <button
                        onClick={() => setViewerMode('original')}
                        className={`px-3 py-1 rounded-lg font-medium transition-colors cursor-pointer flex items-center gap-1.5 ${
                          viewerMode === 'original' ? 'bg-primary/20 text-primary font-semibold shadow-sm' : 'text-textMuted hover:text-text'
                        }`}
                        title="Clean untouched student script"
                      >
                        <span>📄</span>
                        <span>Original</span>
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

                      {viewerMode === 'annotations' ? (
                        <MarkedPaperOverlay
                          imageUrl={pageOriginalUrl}
                          annotations={ensureAssessmentAnnotations(viewingPaper.assessment_result, viewerPageIdx)}
                          showAnnotations={true}
                          showComments={showAnnotationsComments}
                          altText={`Student submission page ${viewerPageIdx + 1}`}
                        />
                      ) : viewerMode === 'marked' ? (
                        pageMarkedUrl ? (
                          <img
                            src={pageMarkedUrl}
                            alt={`Student submission marked page ${viewerPageIdx + 1}`}
                            className="max-h-full max-w-full w-auto h-auto object-contain rounded-xl shadow-2xl bg-white select-none border border-gray-300"
                          />
                        ) : (
                          <div className="flex flex-col items-center justify-center p-6 text-center max-w-md bg-surface/90 border border-border rounded-2xl shadow-xl">
                            <div className="w-12 h-12 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary mb-3">
                              <Sparkles className="w-6 h-6" />
                            </div>
                            <h4 className="text-sm font-bold text-text mb-1">No AI Photo Generated Yet</h4>
                            <p className="text-xs text-textMuted mb-4 leading-relaxed">
                              This submission was marked in <span className="text-primary font-semibold">Annotations Mode</span> (saving image tokens). You can render the photorealistic ballpoint pen photo now if needed.
                            </p>
                            <button
                              onClick={() => handleRegeneratePageMarking(viewerPageIdx)}
                              disabled={isPageGenerating}
                              className="flex items-center gap-2 bg-primary hover:bg-primaryHover text-white px-4 py-2 rounded-xl text-xs font-semibold transition-all shadow-md cursor-pointer disabled:opacity-50"
                            >
                              {isPageGenerating ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                              <span>{isPageGenerating ? 'Rendering Teacher Ink...' : 'Generate AI Photo (Uses Tokens)'}</span>
                            </button>
                          </div>
                        )
                      ) : (
                        <img
                          src={pageOriginalUrl}
                          alt={`Student submission page ${viewerPageIdx + 1}`}
                          className="max-h-full max-w-full w-auto h-auto object-contain rounded-xl shadow-2xl bg-white select-none border border-gray-300"
                        />
                      )}
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
