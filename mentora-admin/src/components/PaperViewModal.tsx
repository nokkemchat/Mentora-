import React, { useState, useEffect } from 'react';
import { 
  X, BookOpen, Layers, Target, ChevronRight, FileText, ExternalLink, 
  Plus, Edit, Trash2, CheckCircle2, Sparkles, AlertCircle, Lightbulb, 
  FileCheck, Columns, RefreshCw, ChevronDown, ChevronUp, Award
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import MarkingSchemeModal from './MarkingSchemeModal';
import TeacherBulkMarkingModal from './TeacherBulkMarkingModal';

interface PaperViewModalProps {
  paperId: string;
  initialTab?: 'questions' | 'scheme' | 'combined';
  onClose: () => void;
}


export function romanToNum(str: string): number {
  const romanMap: Record<string, number> = { i: 1, v: 5, x: 10, l: 50, c: 100 };
  let num = 0;
  const s = str.toLowerCase();
  for (let i = 0; i < s.length; i++) {
    const curr = romanMap[s[i]] || 0;
    const next = romanMap[s[i + 1]] || 0;
    if (curr < next) {
      num -= curr;
    } else {
      num += curr;
    }
  }
  return num > 0 ? num : 999;
}

export function cleanPartLabel(label: string): string {
  if (!label) return '';
  return label.replace(/[()]/g, '').trim();
}

export function getPartRank(label: string): number {
  if (!label) return 9999;
  const clean = cleanPartLabel(label).toLowerCase();
  
  // Roman numeral: i, ii, iii, iv, v, vi, vii, viii, ix, x
  if (/^(i|v|x|l)+$/.test(clean)) {
    return romanToNum(clean);
  }
  
  // Single letter: a, b, c, d...
  if (/^[a-z]$/.test(clean)) {
    return clean.charCodeAt(0) - 96; // a -> 1, b -> 2...
  }
  
  // Digits: 1, 2, 3...
  if (/^\d+$/.test(clean)) {
    return parseInt(clean, 10);
  }
  
  return 9999;
}

export function sortParts<T extends { part_label?: string; created_at?: string }>(parts: T[]): T[] {
  return [...parts].sort((a, b) => {
    const rankA = getPartRank(a.part_label || '');
    const rankB = getPartRank(b.part_label || '');
    if (rankA !== rankB) return rankA - rankB;
    return (a.part_label || '').localeCompare(b.part_label || '', undefined, { numeric: true });
  });
}

export function getQuestionRank(qNum: any): number {
  if (!qNum) return 9999;
  const str = String(qNum).trim();
  const match = str.match(/\d+/);
  if (match) {
    return parseInt(match[0], 10);
  }
  return 9999;
}

export function sortQuestions<T extends { question_number?: any }>(questions: T[]): T[] {
  return [...questions].sort((a, b) => {
    const rankA = getQuestionRank(a.question_number);
    const rankB = getQuestionRank(b.question_number);
    if (rankA !== rankB) return rankA - rankB;
    return String(a.question_number || '').localeCompare(String(b.question_number || ''), undefined, { numeric: true });
  });
}

const RecursivePart = ({ part, allParts, allAssets }: { part: any, allParts: any[], allAssets: any[] }) => {
  const children = sortParts(allParts.filter(p => p.parent_part_id === part.id));
    
  return (
    <div className="pt-2">
      <div className="flex items-start">
        <span className="font-medium text-text mr-3 mt-0.5 shrink-0">({cleanPartLabel(part.part_label)})</span>
        <div className="flex-1">
          <p className="text-text text-sm leading-relaxed whitespace-pre-wrap">{part.content_text}</p>
          
          {/* Part Assets */}
          {allAssets?.filter((a: any) => a.part_id === part.id).map((asset: any) => (
            <div key={asset.id} className="mt-3 mb-2 rounded-lg overflow-hidden border border-border bg-background p-2">
              <span className="text-xs text-textMuted uppercase font-medium ml-2 mb-2 block">{asset.asset_type}</span>
              
              {asset.storage_path ? (
                <div className="bg-white rounded-lg p-3 mb-2 flex justify-center">
                  <img src={asset.storage_path} alt={asset.ai_description || 'Question Asset'} className="max-w-full max-h-[380px] object-contain rounded-md shadow-sm" />
                </div>
              ) : null}

              {asset.ai_description && (
                <div className="bg-surface p-3 rounded-lg text-sm text-text italic">
                  [Asset Description: {asset.ai_description}]
                </div>
              )}
            </div>
          ))}

          {/* Recursive Children */}
          {children.length > 0 && (
            <div className="space-y-4 mt-3 pl-2 sm:pl-4 border-l-2 border-border/50">
              {children.map(child => (
                <RecursivePart key={child.id} part={child} allParts={allParts} allAssets={allAssets} />
              ))}
            </div>
          )}
        </div>
        {part.marks && (
          <span className="text-sm font-medium text-textMuted ml-4 shrink-0">
            [{part.marks}]
          </span>
        )}
      </div>
    </div>
  );
};


const CombinedRecursivePart = ({
  part,
  allParts,
  allAssets
}: {
  part: any;
  allParts: any[];
  allAssets: any[];
}) => {
  const childParts = sortParts(allParts.filter((p: any) => p.parent_part_id === part.id));
  const partAssets = allAssets?.filter((a: any) => a.part_id === part.id) || [];

  return (
    <div className="space-y-1.5">
      <div className="text-xs text-text flex items-start gap-1.5">
        <span className="font-bold text-primary shrink-0">({cleanPartLabel(part.part_label)})</span>
        <span className="leading-relaxed whitespace-pre-wrap">{part.content_text}</span>
        {part.marks && <span className="text-textMuted ml-auto shrink-0 font-medium">[{part.marks}]</span>}
      </div>

      {/* Part-specific visual assets (diagrams, graphs, tables belonging directly to this sub-part) */}
      {partAssets.map((asset: any) => (
        asset.storage_path ? (
          <div key={asset.id} className="rounded-lg border border-border bg-white p-2 my-2 flex justify-center shadow-sm">
            <img
              src={asset.storage_path}
              alt={asset.ai_description || 'Part Diagram'}
              className="max-h-56 max-w-full object-contain rounded"
            />
          </div>
        ) : null
      ))}

      {childParts.length > 0 && (
        <div className="pl-3 sm:pl-4 space-y-2 border-l-2 border-border/40 ml-2 mt-1.5">
          {childParts.map((cp: any) => (
            <CombinedRecursivePart
              key={cp.id}
              part={cp}
              allParts={allParts}
              allAssets={allAssets}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export default function PaperViewModal({ paperId, initialTab = 'questions', onClose }: PaperViewModalProps) {
  const [loading, setLoading] = useState(true);
  const [paper, setPaper] = useState<any>(null);
  const [questions, setQuestions] = useState<any[]>([]);
  const [showMsModal, setShowMsModal] = useState(false);
  const [showBulkMarking, setShowBulkMarking] = useState(false);
  const [markedCount, setMarkedCount] = useState(0);
  const [activeTab, setActiveTab] = useState<'questions' | 'scheme' | 'combined'>(initialTab);
  const [selectedQNumber, setSelectedQNumber] = useState<string>('all');
  const [isProcessingMs, setIsProcessingMs] = useState(false);
  const [expandedQuestions, setExpandedQuestions] = useState<Record<string, boolean>>({});

  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  useEffect(() => {
    fetchPaperData();
  }, [paperId]);

  const fetchPaperData = async () => {
    setLoading(true);
    
    // Fetch paper metadata
    const { data: paperData } = await supabase
      .from('papers')
      .select('*')
      .eq('id', paperId)
      .single();
      
    if (paperData) {
      setPaper(paperData);
    }

    try {
      const { count } = await supabase
        .from('marked_student_papers')
        .select('*', { count: 'exact', head: true })
        .eq('paper_id', paperId);
      setMarkedCount(count || 0);
    } catch (e) {}

    // Fetch questions and nested parts
    const { data: questionsData } = await supabase
      .from('past_paper_questions')
      .select(`
        *,
        question_parts (
          id, part_label, content_text, marks, parent_part_id, created_at
        ),
        question_assets (
          id, asset_type, storage_path, ai_description, part_id
        )
      `)
      .eq('paper_id', paperId)
      .order('question_number', { ascending: true });

    if (questionsData && questionsData.length > 0) {
      const qIds = questionsData.map((q: any) => q.id);
      const { data: solutionsData } = await supabase
        .from('past_paper_solutions')
        .select('*')
        .in('question_id', qIds);

      const solMap = new Map<string, any>();
      (solutionsData || []).forEach((s: any) => solMap.set(s.question_id, s));

      const sorted = sortQuestions(
        questionsData.map((q: any) => ({
          ...q,
          solution: solMap.get(q.id) || null,
          question_parts: sortParts(q.question_parts || [])
        }))
      );
      setQuestions(sorted);
    } else {
      setQuestions([]);
    }
    
    setLoading(false);
  };

  const handleProcessMarkScheme = async () => {
    if (!paper?.mark_scheme_url) {
      setShowMsModal(true);
      return;
    }

    try {
      setIsProcessingMs(true);
      const { data, error } = await supabase.functions.invoke('process-marking-scheme', {
        body: { paper_id: paperId, mark_scheme_url: paper.mark_scheme_url }
      });
      if (error) throw error;
      alert(`Marking scheme processed successfully! ${data?.solutions_saved || 0} solutions extracted and mapped.`);
      await fetchPaperData();
    } catch (err: any) {
      console.error('Mark scheme error:', err);
      alert('Mark scheme error: ' + (err.message || err));
    } finally {
      setIsProcessingMs(false);
    }
  };

  const handleDeleteMarkScheme = async () => {
    if (!window.confirm('Are you sure you want to remove the marking scheme for this paper?')) return;

    try {
      const { error: dbError } = await supabase
        .from('papers')
        .update({ mark_scheme_url: null })
        .eq('id', paperId);

      if (dbError) throw dbError;

      await supabase
        .from('ingestion_jobs')
        .update({ mark_scheme_url: null })
        .eq('paper_id', paperId);

      fetchPaperData();
    } catch (err: any) {
      console.error('Error removing marking scheme:', err);
      alert('Failed to remove marking scheme');
    }
  };

  const toggleQuestionPrompt = (qId: string) => {
    setExpandedQuestions(prev => ({ ...prev, [qId]: !prev[qId] }));
  };

  const solutionsCount = questions.filter(q => q.solution).length;
  const totalMarks = questions.reduce((acc, q) => acc + (parseInt(q.marks) || 0), 0);

  const filteredQuestions = selectedQNumber === 'all'
    ? questions
    : questions.filter(q => String(q.question_number) === selectedQNumber);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm">
      <div className="bg-surface w-full max-w-5xl h-[90vh] rounded-[2rem] shadow-2xl border border-border flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="px-8 py-5 border-b border-border flex items-center justify-between shrink-0 bg-surface/50">
          <div>
            <div className="flex items-center gap-2.5">
              <h2 className="text-2xl font-bold text-text">
                {activeTab === 'scheme' ? 'Marking Scheme Breakdown' : activeTab === 'combined' ? 'Question Paper & Marking Scheme' : 'Question Paper Breakdown'}
              </h2>
              {paper?.type === 'ms' && (
                <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[#10b981]/15 text-[#10b981] border border-[#10b981]/30">
                  Mark Scheme
                </span>
              )}
            </div>
            <p className="text-sm text-textMuted mt-1 flex items-center gap-2">
              <span>{paper ? `${paper.subject} • ${paper.curriculum} • ${paper.year} • Paper ${paper.paper_number} ${paper.variant ? `(Variant ${paper.variant})` : ''}` : 'Loading...'}</span>
              {totalMarks > 0 && <span className="text-xs font-semibold px-2 py-0.5 bg-border/50 rounded-lg">Total: {totalMarks} Marks</span>}
            </p>
          </div>
          <button 
            onClick={onClose}
            className="p-2.5 hover:bg-border/50 rounded-2xl transition-colors text-textMuted hover:text-text cursor-pointer"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Navigation Tabs Bar */}
        <div className="px-8 pt-3 border-b border-border bg-surface flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="flex items-center space-x-1 sm:space-x-2">
            <button
              type="button"
              onClick={() => setActiveTab('questions')}
              className={`flex items-center gap-2 px-4 py-2.5 border-b-2 font-medium text-sm transition-all cursor-pointer ${
                activeTab === 'questions'
                  ? 'border-primary text-primary font-semibold'
                  : 'border-transparent text-textMuted hover:text-text'
              }`}
            >
              <BookOpen className="w-4 h-4" />
              <span>Questions Breakdown</span>
              <span className="ml-1 px-2 py-0.5 rounded-full text-xs bg-primary/10 text-primary font-bold">
                {questions.length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('scheme')}
              className={`flex items-center gap-2 px-4 py-2.5 border-b-2 font-medium text-sm transition-all cursor-pointer ${
                activeTab === 'scheme'
                  ? 'border-[#10b981] text-[#10b981] font-semibold'
                  : 'border-transparent text-textMuted hover:text-text'
              }`}
            >
              <FileCheck className="w-4 h-4" />
              <span>Marking Scheme Breakdown</span>
              <span className={`ml-1 px-2 py-0.5 rounded-full text-xs font-bold ${
                solutionsCount > 0
                  ? 'bg-[#10b981]/15 text-[#10b981]'
                  : 'bg-amber-500/10 text-amber-500'
              }`}>
                {solutionsCount} / {questions.length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('combined')}
              className={`flex items-center gap-2 px-4 py-2.5 border-b-2 font-medium text-sm transition-all cursor-pointer ${
                activeTab === 'combined'
                  ? 'border-purple-500 text-purple-500 font-semibold'
                  : 'border-transparent text-textMuted hover:text-text'
              }`}
            >
              <Columns className="w-4 h-4" />
              <span className="hidden sm:inline">Side-by-Side</span>
              <span className="sm:hidden">Combined</span>
            </button>
          </div>

          {/* Document links & Bulk Marking quick access */}
          {paper && (
            <div className="flex items-center gap-2 pb-2">
              <button
                type="button"
                onClick={() => setShowBulkMarking(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs font-semibold bg-primary text-white hover:bg-primaryHover transition-all cursor-pointer shadow-sm"
                title="Mark student papers with AI"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>Mark Students Papers</span>
                {markedCount > 0 && (
                  <span className="ml-1 px-1.5 py-0.2 rounded-full text-[10px] bg-white text-primary font-bold">
                    {markedCount}
                  </span>
                )}
              </button>
              {paper.pdf_url && (
                <a
                  href={paper.pdf_url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl text-xs font-medium text-primary bg-primary/10 hover:bg-primary/20 transition-colors"
                  title="Open Question Paper PDF"
                >
                  <FileText className="w-3 h-3" />
                  <span>QP PDF</span>
                  <ExternalLink className="w-2.5 h-2.5 opacity-70" />
                </a>
              )}
              {paper.mark_scheme_url ? (
                <a
                  href={paper.mark_scheme_url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl text-xs font-medium text-[#10b981] bg-[#10b981]/10 hover:bg-[#10b981]/20 transition-colors"
                  title="Open Marking Scheme PDF"
                >
                  <FileCheck className="w-3 h-3" />
                  <span>MS PDF</span>
                  <ExternalLink className="w-2.5 h-2.5 opacity-70" />
                </a>
              ) : (
                <button
                  type="button"
                  onClick={() => setShowMsModal(true)}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl text-xs font-medium text-textMuted border border-dashed border-border hover:text-primary hover:border-primary transition-colors cursor-pointer"
                >
                  <Plus className="w-3 h-3" />
                  <span>Attach MS</span>
                </button>
              )}
            </div>
          )}
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-6 sm:p-8 bg-background space-y-6">
          {loading ? (
            <div className="flex items-center justify-center py-24">
              <div className="flex flex-col items-center space-y-4 text-textMuted">
                <span className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
                <p className="font-medium">Loading extracted contents...</p>
              </div>
            </div>
          ) : (
            <>
              {/* MARKING SCHEME BREAKDOWN TAB */}
              {activeTab === 'scheme' && (
                <div className="space-y-6">
                  {/* Scheme Status & Header Banner */}
                  <div className="p-5 rounded-2xl border border-border bg-surface shadow-sm">
                    <div className="flex flex-wrap items-center justify-between gap-4">
                      <div className="flex items-start gap-3.5">
                        <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 ${
                          solutionsCount > 0 ? 'bg-[#10b981]/15 text-[#10b981]' : 'bg-amber-500/15 text-amber-500'
                        }`}>
                          <Award className="w-6 h-6" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <h3 className="text-lg font-bold text-text">
                              Official Examination Marking Scheme
                            </h3>
                            <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                              solutionsCount === questions.length && questions.length > 0
                                ? 'bg-[#10b981]/15 text-[#10b981] border border-[#10b981]/30'
                                : solutionsCount > 0
                                ? 'bg-blue-500/15 text-blue-500 border border-blue-500/30'
                                : 'bg-amber-500/15 text-amber-500 border border-amber-500/30'
                            }`}>
                              {solutionsCount === questions.length && questions.length > 0
                                ? 'Fully Extracted'
                                : solutionsCount > 0
                                ? `Partially Extracted (${solutionsCount}/${questions.length})`
                                : 'Extraction Pending'}
                            </span>
                          </div>
                          <p className="text-sm text-textMuted mt-1">
                            Rubric criteria, method marks (M), accuracy marks (A), independent marks (B), step-by-step worked solutions, and examiner insights.
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        {paper?.mark_scheme_url && (
                          <button
                            type="button"
                            onClick={handleProcessMarkScheme}
                            disabled={isProcessingMs}
                            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-[#10b981] text-white hover:bg-[#10b981]/90 shadow-sm transition-all disabled:opacity-50 cursor-pointer"
                          >
                            <RefreshCw className={`w-3.5 h-3.5 ${isProcessingMs ? 'animate-spin' : ''}`} />
                            <span>{isProcessingMs ? 'Processing Scheme...' : solutionsCount > 0 ? 'Re-extract Scheme' : 'Extract Scheme Now'}</span>
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => setShowMsModal(true)}
                          className="inline-flex items-center gap-1 px-3 py-2 rounded-xl text-xs font-medium border border-border bg-background hover:bg-surface text-textMuted hover:text-text transition-colors cursor-pointer"
                        >
                          <Edit className="w-3.5 h-3.5" />
                          <span>{paper?.mark_scheme_url ? 'Change File' : 'Attach PDF'}</span>
                        </button>
                      </div>
                    </div>

                    {/* Stats bar */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4 pt-4 border-t border-border/70">
                      <div className="bg-background/60 p-3 rounded-xl border border-border/50">
                        <span className="text-xs text-textMuted uppercase font-medium block">Exam Board</span>
                        <span className="text-sm font-bold text-text mt-0.5 block">{paper?.curriculum || 'ZIMSEC'}</span>
                      </div>
                      <div className="bg-background/60 p-3 rounded-xl border border-border/50">
                        <span className="text-xs text-textMuted uppercase font-medium block">Total Marks</span>
                        <span className="text-sm font-bold text-text mt-0.5 block">{totalMarks || 'N/A'} Marks</span>
                      </div>
                      <div className="bg-background/60 p-3 rounded-xl border border-border/50">
                        <span className="text-xs text-textMuted uppercase font-medium block">Questions Covered</span>
                        <span className="text-sm font-bold text-[#10b981] mt-0.5 block">{solutionsCount} of {questions.length}</span>
                      </div>
                      <div className="bg-background/60 p-3 rounded-xl border border-border/50">
                        <span className="text-xs text-textMuted uppercase font-medium block">Coverage</span>
                        <span className="text-sm font-bold text-text mt-0.5 block">
                          {questions.length > 0 ? Math.round((solutionsCount / questions.length) * 100) : 0}%
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Question Filter / Jump Pill Bar */}
                  {questions.length > 0 && (
                    <div className="flex items-center gap-2 overflow-x-auto pb-1">
                      <span className="text-xs font-semibold text-textMuted uppercase tracking-wider shrink-0 mr-1">Jump To:</span>
                      <button
                        type="button"
                        onClick={() => setSelectedQNumber('all')}
                        className={`px-3 py-1 rounded-xl text-xs font-medium transition-all cursor-pointer shrink-0 ${
                          selectedQNumber === 'all'
                            ? 'bg-primary text-white font-semibold shadow-sm'
                            : 'bg-surface text-textMuted border border-border hover:bg-border/50'
                        }`}
                      >
                        All Questions ({questions.length})
                      </button>
                      {questions.map((q) => (
                        <button
                          key={q.id}
                          type="button"
                          onClick={() => setSelectedQNumber(String(q.question_number))}
                          className={`px-3 py-1 rounded-xl text-xs font-medium transition-all cursor-pointer shrink-0 flex items-center gap-1.5 ${
                            selectedQNumber === String(q.question_number)
                              ? 'bg-[#10b981] text-white font-semibold shadow-sm'
                              : q.solution
                              ? 'bg-[#10b981]/10 text-[#10b981] border border-[#10b981]/20 hover:bg-[#10b981]/20'
                              : 'bg-surface text-textMuted border border-border hover:bg-border/50'
                          }`}
                        >
                          <span>Q{q.question_number}</span>
                          {q.marks && <span className="opacity-80 text-[10px]">({q.marks}m)</span>}
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Marking Scheme List */}
                  {filteredQuestions.length === 0 ? (
                    <div className="text-center py-16 bg-surface rounded-2xl border border-border">
                      <FileCheck className="w-10 h-10 text-textMuted mx-auto mb-3 opacity-40" />
                      <p className="text-textMuted font-medium">No questions found for this selection.</p>
                    </div>
                  ) : (
                    <div className="space-y-6">
                      {filteredQuestions.map((q) => (
                        <div key={q.id} className="bg-surface border border-border rounded-2xl p-6 shadow-sm space-y-4">
                          {/* Question header info */}
                          <div className="flex items-start justify-between gap-4 pb-4 border-b border-border">
                            <div className="flex items-center space-x-3">
                              <div className="w-11 h-11 rounded-xl bg-[#10b981]/10 text-[#10b981] border border-[#10b981]/20 flex items-center justify-center shrink-0 font-bold text-lg">
                                {q.question_number}
                              </div>
                              <div>
                                <div className="flex items-center gap-2">
                                  <h4 className="font-bold text-text text-base">Question {q.question_number} Marking Breakdown</h4>
                                  {q.solution ? (
                                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#10b981] bg-[#10b981]/10 px-2 py-0.5 rounded-md border border-[#10b981]/20">
                                      <CheckCircle2 className="w-3 h-3" /> Rubric Extracted
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-500 bg-amber-500/10 px-2 py-0.5 rounded-md border border-amber-500/20">
                                      <AlertCircle className="w-3 h-3" /> Missing Rubric
                                    </span>
                                  )}
                                </div>
                                <div className="flex flex-wrap items-center gap-2 text-xs text-textMuted mt-1">
                                  {q.topic && (
                                    <span className="px-2 py-0.5 bg-blue-500/10 text-blue-500 rounded-md font-medium">
                                      {q.topic}
                                    </span>
                                  )}
                                  {q.difficulty && (
                                    <span className="px-2 py-0.5 bg-purple-500/10 text-purple-500 rounded-md font-medium">
                                      {q.difficulty}
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>

                            <div className="flex items-center gap-3">
                              {q.marks && (
                                <span className="font-bold text-text bg-background px-3 py-1 rounded-xl border border-border text-sm">
                                  [{q.marks} Marks]
                                </span>
                              )}
                              <button
                                type="button"
                                onClick={() => toggleQuestionPrompt(q.id)}
                                className="p-1.5 text-textMuted hover:text-text rounded-lg hover:bg-background border border-transparent hover:border-border transition-colors text-xs inline-flex items-center gap-1 cursor-pointer"
                                title="Toggle original question text"
                              >
                                {expandedQuestions[q.id] ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                                <span className="hidden sm:inline">{expandedQuestions[q.id] ? 'Hide Question' : 'View Question'}</span>
                              </button>
                            </div>
                          </div>

                          {/* Collapsible original question preview */}
                          {expandedQuestions[q.id] && (
                            <div className="p-4 rounded-xl bg-background border border-border space-y-3">
                              <span className="text-xs font-semibold text-textMuted uppercase tracking-wider block">
                                Original Question Prompt
                              </span>
                              <p className="text-text text-sm leading-relaxed whitespace-pre-wrap">
                                {q.content_text}
                              </p>
                              {q.content_images && q.content_images.length > 0 && (
                                <div className="flex gap-3 overflow-x-auto pt-2">
                                  {q.content_images.map((imgUrl: string, idx: number) => (
                                    <img key={idx} src={imgUrl} alt="Diagram" className="max-h-40 rounded-lg border border-border bg-white p-1" />
                                  ))}
                                </div>
                              )}
                            </div>
                          )}

                          {/* Extracted Solution / Marking Scheme Content */}
                          {q.solution ? (
                            <div className="space-y-4 pt-1">
                              {/* Rubric Breakdown */}
                              {q.solution.official_mark_scheme && (
                                <div className="rounded-xl border border-[#10b981]/25 bg-[#10b981]/5 p-4">
                                  <h5 className="font-bold text-xs uppercase tracking-wider text-[#10b981] mb-2 flex items-center gap-1.5">
                                    <FileCheck className="w-4 h-4 text-[#10b981]" />
                                    Official Marking Criteria & Rubric Breakdown
                                  </h5>
                                  <div className="p-3.5 bg-surface rounded-xl border border-[#10b981]/20 text-text font-mono text-xs leading-relaxed whitespace-pre-wrap">
                                    {q.solution.official_mark_scheme}
                                  </div>
                                </div>
                              )}

                              {/* AI Model Worked Solution */}
                              {q.solution.ai_worked_solution && (
                                <div className="rounded-xl border border-primary/25 bg-primary/5 p-4">
                                  <h5 className="font-bold text-xs uppercase tracking-wider text-primary mb-2 flex items-center gap-1.5">
                                    <Sparkles className="w-4 h-4 text-primary" />
                                    Complete Step-by-Step Worked Solution
                                  </h5>
                                  <div className="p-3.5 bg-surface rounded-xl border border-primary/20 text-text text-sm leading-relaxed whitespace-pre-wrap">
                                    {q.solution.ai_worked_solution}
                                  </div>
                                </div>
                              )}

                              {/* Insights Grid: Common Mistakes & Examiner Tips */}
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {q.solution.common_mistakes && (
                                  <div className="p-4 rounded-xl border border-amber-500/25 bg-amber-500/5">
                                    <h5 className="font-bold text-xs uppercase tracking-wider text-amber-500 mb-1.5 flex items-center gap-1.5">
                                      <AlertCircle className="w-4 h-4 text-amber-500" />
                                      Common Student Misconceptions & Pitfalls
                                    </h5>
                                    <p className="text-xs text-text leading-relaxed whitespace-pre-wrap">
                                      {q.solution.common_mistakes}
                                    </p>
                                  </div>
                                )}

                                {q.solution.examiner_tips && (
                                  <div className="p-4 rounded-xl border border-blue-500/25 bg-blue-500/5">
                                    <h5 className="font-bold text-xs uppercase tracking-wider text-blue-500 mb-1.5 flex items-center gap-1.5">
                                      <Lightbulb className="w-4 h-4 text-blue-500" />
                                      Examiner Tips & Advice
                                    </h5>
                                    <p className="text-xs text-text leading-relaxed whitespace-pre-wrap">
                                      {q.solution.examiner_tips}
                                    </p>
                                  </div>
                                )}
                              </div>
                            </div>
                          ) : (
                            <div className="p-6 rounded-xl border border-dashed border-border text-center bg-background/50 space-y-2">
                              <p className="text-sm text-textMuted">
                                No marking scheme rubric or solution extracted for Question {q.question_number} yet.
                              </p>
                              {paper?.mark_scheme_url && (
                                <button
                                  type="button"
                                  onClick={handleProcessMarkScheme}
                                  disabled={isProcessingMs}
                                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-[#10b981]/10 text-[#10b981] border border-[#10b981]/20 hover:bg-[#10b981]/20 transition-colors cursor-pointer"
                                >
                                  <Sparkles className="w-3.5 h-3.5" />
                                  <span>Extract Scheme Rubrics</span>
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* QUESTIONS BREAKDOWN TAB */}
              {activeTab === 'questions' && (
                <div className="space-y-6">
                  {questions.length === 0 ? (
                    <div className="text-center py-20 bg-surface rounded-2xl border border-border">
                      <BookOpen className="w-10 h-10 text-textMuted mx-auto mb-3 opacity-40" />
                      <p className="text-textMuted">No questions have been extracted for this paper yet.</p>
                    </div>
                  ) : (
                    questions.map((q) => (
                      <div key={q.id} className="bg-surface border border-border rounded-2xl p-6 shadow-sm">
                        <div className="flex items-start justify-between mb-4">
                          <div className="flex items-center space-x-3">
                            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                              <span className="font-bold text-primary text-lg">{q.question_number}</span>
                            </div>
                            <div>
                              <div className="flex items-center space-x-2 text-xs font-medium mb-1">
                                {q.topic && (
                                  <span className="px-2 py-0.5 bg-blue-500/10 text-blue-500 rounded-lg flex items-center">
                                    <Layers className="w-3 h-3 mr-1" />
                                    {q.topic}
                                  </span>
                                )}
                                {q.difficulty && (
                                  <span className="px-2 py-0.5 bg-purple-500/10 text-purple-500 rounded-lg flex items-center">
                                    <Target className="w-3 h-3 mr-1" />
                                    {q.difficulty}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                          {q.marks && (
                            <span className="font-medium text-textMuted bg-background px-3 py-1 rounded-xl border border-border">
                              [{q.marks} marks]
                            </span>
                          )}
                        </div>

                        <p className="text-text text-base leading-relaxed mb-6 whitespace-pre-wrap">
                          {q.content_text}
                        </p>

                        {/* Question Assets */}
                        {q.question_assets?.filter((a: any) => !a.part_id).map((asset: any) => (
                          <div key={asset.id} className="mb-6 rounded-xl overflow-hidden border border-border bg-background p-2">
                            <span className="text-xs text-textMuted uppercase font-medium ml-2 mb-2 block">{asset.asset_type}</span>
                            {asset.storage_path ? (
                              <div className="bg-white rounded-lg p-4 mb-2 flex justify-center">
                                <img src={asset.storage_path} alt={asset.ai_description || 'Question Asset'} className="max-w-full max-h-[450px] object-contain rounded-md shadow-sm" />
                              </div>
                            ) : null}
                            {asset.ai_description && (
                              <div className="bg-surface p-3 rounded-lg text-sm text-text italic">
                                [Asset Description: {asset.ai_description}]
                              </div>
                            )}
                          </div>
                        ))}

                        {(!q.question_assets || q.question_assets.length === 0) && q.content_images?.map((imgUrl: string, idx: number) => (
                          <div key={idx} className="mb-6 rounded-xl overflow-hidden border border-border bg-background p-2">
                            <span className="text-xs text-textMuted uppercase font-medium ml-2 mb-2 block">diagram</span>
                            <div className="bg-white rounded-lg p-4 mb-2 flex justify-center">
                              <img src={imgUrl} alt={`Question diagram ${idx + 1}`} className="max-w-full max-h-[450px] object-contain rounded-md shadow-sm" />
                            </div>
                          </div>
                        ))}

                        {/* Sub parts */}
                        {q.question_parts && q.question_parts.length > 0 && (
                          <div className="space-y-4 pl-0 sm:pl-4">
                            {sortParts(q.question_parts.filter((p: any) => !p.parent_part_id))
                              .map((part: any) => (
                              <RecursivePart key={part.id} part={part} allParts={q.question_parts} allAssets={q.question_assets || []} />
                            ))}
                          </div>
                        )}

                        {/* Quick Solution Peek button if solution exists */}
                        {q.solution && (
                          <div className="mt-5 pt-4 border-t border-border/60 flex items-center justify-between">
                            <span className="text-xs font-medium text-[#10b981] flex items-center gap-1.5">
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              Official Marking Scheme & Worked Solution Available
                            </span>
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedQNumber(String(q.question_number));
                                setActiveTab('scheme');
                              }}
                              className="text-xs font-semibold text-primary hover:underline flex items-center gap-1 cursor-pointer"
                            >
                              <span>View Marking Scheme</span>
                              <ChevronRight className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              )}

              {/* COMBINED (SIDE-BY-SIDE) TAB */}
              {activeTab === 'combined' && (
                <div className="space-y-8">
                  {filteredQuestions.length === 0 ? (
                    <div className="text-center py-20 bg-surface rounded-2xl border border-border">
                      <Columns className="w-10 h-10 text-textMuted mx-auto mb-3 opacity-40" />
                      <p className="text-textMuted">No questions found to compare.</p>
                    </div>
                  ) : (
                    filteredQuestions.map((q) => (
                      <div key={q.id} className="bg-surface border border-border rounded-2xl p-6 shadow-sm space-y-6">
                        {/* Header */}
                        <div className="flex items-center justify-between pb-3 border-b border-border">
                          <div className="flex items-center space-x-2">
                            <span className="w-8 h-8 rounded-lg bg-primary/10 text-primary font-bold flex items-center justify-center text-sm">
                              Q{q.question_number}
                            </span>
                            <span className="font-bold text-text">Question {q.question_number}</span>
                            {q.topic && <span className="text-xs text-textMuted">• {q.topic}</span>}
                          </div>
                          {q.marks && (
                            <span className="text-xs font-semibold px-2.5 py-1 rounded-lg bg-background border border-border">
                              [{q.marks} Marks]
                            </span>
                          )}
                        </div>

                        {/* 2-Column Grid */}
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
                          {/* Left: Question Content */}
                          <div className="space-y-4 p-4 rounded-xl bg-background border border-border">
                            <h5 className="text-xs font-bold uppercase tracking-wider text-textMuted flex items-center gap-1.5">
                              <BookOpen className="w-3.5 h-3.5 text-primary" />
                              Question Paper Content
                            </h5>
                            <p className="text-text text-sm leading-relaxed whitespace-pre-wrap">
                              {q.content_text}
                            </p>

                            {/* Stem-level visual assets only */}
                            {q.question_assets?.filter((a: any) => !a.part_id).map((asset: any) => (
                              asset.storage_path ? (
                                <div key={asset.id} className="rounded-lg border border-border bg-white p-2 flex justify-center shadow-sm">
                                  <img src={asset.storage_path} alt={asset.ai_description || 'diagram'} className="max-h-56 max-w-full object-contain rounded" />
                                </div>
                              ) : null
                            ))}

                            {/* Fallback to content_images only if no question_assets exist */}
                            {(!q.question_assets || q.question_assets.length === 0) && q.content_images?.map((imgUrl: string, idx: number) => (
                              <div key={idx} className="rounded-lg border border-border bg-white p-2 flex justify-center shadow-sm">
                                <img src={imgUrl} alt="diagram" className="max-h-48 max-w-full object-contain rounded" />
                              </div>
                            ))}

                            {q.question_parts && q.question_parts.length > 0 && (
                              <div className="space-y-3 pt-3 border-t border-border/50">
                                {sortParts(q.question_parts.filter((p: any) => !p.parent_part_id))
                                  .map((part: any) => (
                                    <CombinedRecursivePart
                                      key={part.id}
                                      part={part}
                                      allParts={q.question_parts}
                                      allAssets={q.question_assets || []}
                                    />
                                  ))}
                              </div>
                            )}
                          </div>

                          {/* Right: Marking Scheme & Solution */}
                          <div className="space-y-4 p-4 rounded-xl bg-[#10b981]/5 border border-[#10b981]/20">
                            <h5 className="text-xs font-bold uppercase tracking-wider text-[#10b981] flex items-center gap-1.5">
                              <FileCheck className="w-3.5 h-3.5 text-[#10b981]" />
                              Marking Scheme & Rubric
                            </h5>

                            {q.solution ? (
                              <div className="space-y-3">
                                {q.solution.official_mark_scheme && (
                                  <div>
                                    <span className="text-[11px] font-semibold text-textMuted uppercase block mb-1">Rubric Criteria:</span>
                                    <div className="p-2.5 bg-surface rounded-lg border border-[#10b981]/20 font-mono text-xs whitespace-pre-wrap">
                                      {q.solution.official_mark_scheme}
                                    </div>
                                  </div>
                                )}

                                {q.solution.ai_worked_solution && (
                                  <div>
                                    <span className="text-[11px] font-semibold text-textMuted uppercase block mb-1">Worked Solution:</span>
                                    <div className="p-2.5 bg-surface rounded-lg border border-border text-xs leading-relaxed whitespace-pre-wrap">
                                      {q.solution.ai_worked_solution}
                                    </div>
                                  </div>
                                )}

                                {q.solution.examiner_tips && (
                                  <div className="p-2.5 bg-blue-500/10 border border-blue-500/20 rounded-lg text-xs text-text">
                                    <span className="font-bold text-blue-500 block mb-0.5">Examiner Tip:</span>
                                    {q.solution.examiner_tips}
                                  </div>
                                )}
                              </div>
                            ) : (
                              <p className="text-xs text-textMuted italic py-4 text-center">
                                No marking scheme extracted for this question yet.
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}
            </>
          )}
        </div>

        {/* Marking Scheme Modal */}
        {showMsModal && paper && (
          <MarkingSchemeModal
            paper={paper}
            onClose={() => setShowMsModal(false)}
            onSuccess={() => {
              setShowMsModal(false);
              fetchPaperData();
            }}
          />
        )}

        {/* Bulk Marking Modal */}
        {showBulkMarking && paper && (
          <TeacherBulkMarkingModal
            paper={paper}
            onClose={() => setShowBulkMarking(false)}
            onPaperUpdated={fetchPaperData}
          />
        )}
      </div>
    </div>
  );
}
