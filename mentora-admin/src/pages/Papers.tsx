import React, { useState, useEffect } from 'react';
import { Search, Filter, Plus, Edit, Trash2, Eye, BarChart2, BookOpen, ChevronDown, ChevronUp, UploadCloud, FileText, ExternalLink, FileCheck, Sparkles, RefreshCw, CheckCircle2, GraduationCap } from 'lucide-react';
import { supabase } from '../lib/supabase';
import PaperFormModal from '../components/PaperFormModal';
import BulkUploadModal from '../components/BulkUploadModal';
import PaperViewModal from '../components/PaperViewModal';
import MarkingSchemeModal from '../components/MarkingSchemeModal';
import TeacherBulkMarkingModal from '../components/TeacherBulkMarkingModal';
import { useAuth } from '../context/AuthContext';

export default function Papers() {
  const { user, isAdmin, isTeacher, isStudent } = useAuth();
  const [search, setSearch] = useState('');
  const [showFormModal, setShowFormModal] = useState(false);
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [viewingPaperId, setViewingPaperId] = useState<string | null>(null);
  const [initialModalTab, setInitialModalTab] = useState<'questions' | 'scheme' | 'combined'>('questions');
  const [selectedPaperForMs, setSelectedPaperForMs] = useState<any | null>(null);
  const [extractingPaperId, setExtractingPaperId] = useState<string | null>(null);
  const [processingMsPaperId, setProcessingMsPaperId] = useState<string | null>(null);
  const [selectedPaperForMarking, setSelectedPaperForMarking] = useState<any | null>(null);

  const handleExtractPaper = async (paperId: string) => {
    try {
      setExtractingPaperId(paperId);
      const targetPaper = papers.find(p => p.id === paperId);

      // Check for existing job and set to uploaded for full visual asset ingestion
      const { data: existingJob } = await supabase
        .from('ingestion_jobs')
        .select('id')
        .eq('paper_id', paperId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (existingJob) {
        await supabase
          .from('ingestion_jobs')
          .update({ 
            status: 'uploaded', 
            mark_scheme_url: targetPaper?.mark_scheme_url || null,
            error_details: null, 
            updated_at: new Date().toISOString() 
          })
          .eq('id', existingJob.id);
      } else {
        await supabase
          .from('ingestion_jobs')
          .insert({ 
            paper_id: paperId, 
            mark_scheme_url: targetPaper?.mark_scheme_url || null,
            status: 'uploaded' 
          });
      }

      // Trigger extraction: Try local visual agent first, fallback to Supabase Edge Function
      let localTriggered = false;
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 4000);
        const agentUrl = (import.meta.env.VITE_INGESTION_AGENT_URL || 'https://mentora-ingestion-agent.onrender.com').replace(/\/$/, '');
        const res = await fetch(`${agentUrl}/process`, { method: 'POST', signal: controller.signal });
        clearTimeout(timeoutId);
        if (res.ok) localTriggered = true;
      } catch (e) {}

      if (localTriggered) {
        alert('Extraction started with Mentora Visual Ingestion Agent (cropping diagrams & visual assets).');
      } else {
        const { data: extractRes, error: extractErr } = await supabase.functions.invoke('process-paper', {
          body: { 
            paper_id: paperId,
            mark_scheme_url: targetPaper?.mark_scheme_url || undefined
          }
        });

        if (extractErr) console.warn('process-paper invocation notice:', extractErr);

        if (targetPaper?.mark_scheme_url) {
          supabase.functions.invoke('process-marking-scheme', {
            body: { paper_id: paperId, mark_scheme_url: targetPaper.mark_scheme_url }
          }).catch(msErr => console.warn('process-marking-scheme notice:', msErr));
        }

        const msCount = extractRes?.marking_scheme?.solutions_saved;
        if (msCount) {
          alert(`Questions and ${msCount} marking scheme solutions extracted (text only). The ingestion agent will add the diagrams/images next time it runs.`);
        } else {
          alert('Questions extracted via cloud (text only, no images yet) — the ingestion agent will add the diagrams/images when it runs.');
        }
      }
      await fetchPapers();
    } catch (err: any) {
      console.error('Extraction error:', err);
      alert('Extraction error: ' + (err.message || err));
    } finally {
      setExtractingPaperId(null);
    }
  };

  const handleProcessMarkScheme = async (paperId: string, msUrl: string) => {
    try {
      setProcessingMsPaperId(paperId);
      const { data, error } = await supabase.functions.invoke('process-marking-scheme', {
        body: { paper_id: paperId, mark_scheme_url: msUrl }
      });
      if (error) throw error;
      alert(`Marking scheme processed successfully! ${data?.solutions_saved || ''} solutions mapped.`);
      await fetchPapers();
    } catch (err: any) {
      console.error('Mark scheme error:', err);
      alert('Mark scheme error: ' + (err.message || err));
    } finally {
      setProcessingMsPaperId(null);
    }
  };
  const [papers, setPapers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Filters
  const [curriculumFilter, setCurriculumFilter] = useState('All');
  const [subjectFilter, setSubjectFilter] = useState('All');
  const [yearFilter, setYearFilter] = useState('All');

  const fetchPapers = async () => {
    setLoading(true);
    let query = supabase.from('papers').select('*, ingestion_jobs(status)').order('created_at', { ascending: false });
    
    // Teachers, Admins, and Students all have access to explore and manage past papers

    const { data, error } = await query;
    if (error) {
      console.error('Error fetching papers:', error);
      setPapers([]);
    } else if (data) {
      const paperIds = data.map(p => p.id);
      let qData: any[] = [];
      let sData: any[] = [];
      let mData: any[] = [];
      if (paperIds.length > 0) {
        const [qRes, sRes, mRes] = await Promise.all([
          supabase.from('past_paper_questions').select('id, paper_id').in('paper_id', paperIds),
          supabase.from('past_paper_solutions').select('question_id'),
          (() => {
            let mq = supabase.from('marked_student_papers').select('paper_id').in('paper_id', paperIds);
            if (isStudent && user) {
              const name = user.user_metadata?.first_name || user.email?.split('@')[0] || '';
              mq = mq.or(`created_by.eq.${user.id},student_name.ilike.%${name}%`);
            }
            return mq;
          })()
        ]);
        qData = qRes.data || [];
        sData = sRes.data || [];
        mData = mRes.data || [];
      }

      const qByPaper = new Map<string, string[]>();
      qData.forEach(q => {
        if (!qByPaper.has(q.paper_id)) qByPaper.set(q.paper_id, []);
        qByPaper.get(q.paper_id)!.push(q.id);
      });

      const markedByPaper = new Map<string, number>();
      mData.forEach((m: any) => {
        markedByPaper.set(m.paper_id, (markedByPaper.get(m.paper_id) || 0) + 1);
      });

      const solQIds = new Set(sData.map(s => s.question_id));

      const papersWithCounts = data.map(p => {
        const qIds = qByPaper.get(p.id) || [];
        const solCount = qIds.filter(qid => solQIds.has(qid)).length;
        return {
          ...p,
          question_count: qIds.length,
          solution_count: solCount,
          marked_count: markedByPaper.get(p.id) || 0
        };
      });

      setPapers(papersWithCounts);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchPapers();
  }, []);

  const handleDelete = async (id: string) => {
    if (!window.confirm('Are you sure you want to delete this paper? This will also delete all associated questions.')) return;
    
    const { error } = await supabase.from('papers').delete().eq('id', id);
    if (error) {
      console.error('Error deleting paper:', error);
      alert('Failed to delete paper');
    } else {
      fetchPapers();
    }
  };

  const handleDeleteMarkScheme = async (paper: any) => {
    if (!window.confirm(`Are you sure you want to remove the marking scheme for ${paper.subject} Paper ${paper.paper_number}?`)) return;

    try {
      const { error: dbError } = await supabase
        .from('papers')
        .update({ mark_scheme_url: null })
        .eq('id', paper.id);

      if (dbError) throw dbError;

      await supabase
        .from('ingestion_jobs')
        .update({ mark_scheme_url: null })
        .eq('paper_id', paper.id);

      fetchPapers();
    } catch (err: any) {
      console.error('Error deleting marking scheme:', err);
      alert('Failed to remove marking scheme: ' + (err.message || 'Unknown error'));
    }
  };

  const filteredPapers = papers.filter(paper => {
    const searchLower = search.toLowerCase();
    const matchesSearch = (paper.subject && paper.subject.toLowerCase().includes(searchLower)) || 
                          (paper.paper_number && paper.paper_number.toString().includes(searchLower));
    
    const matchesCurriculum = curriculumFilter === 'All' || paper.curriculum === curriculumFilter;
    const matchesSubject = subjectFilter === 'All' || paper.subject === subjectFilter;
    const matchesYear = yearFilter === 'All' || paper.year.toString() === yearFilter;
    
    return matchesSearch && matchesCurriculum && matchesSubject && matchesYear;
  });

  // Extract unique subjects and years for filters
  const uniqueSubjects = Array.from(new Set(papers.map(p => p.subject))).filter(Boolean);
  const uniqueYears = Array.from(new Set(papers.map(p => p.year))).filter(Boolean).sort((a: any, b: any) => b - a);

  return (
    <div className="max-w-7xl mx-auto space-y-5 sm:space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-text tracking-tight">
            {isStudent ? 'Past Papers & Marking Schemes' : 'Past Papers'}
          </h1>
          <p className="text-xs sm:text-sm text-textMuted mt-1">
            {isStudent
              ? 'Explore official question papers and verified teacher marking schemes.'
              : 'Manage and curate the AI Exam Intelligence database.'}
          </p>
        </div>

        {isStudent ? (
          <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-2xl bg-blue-500/10 border border-blue-500/20 text-blue-400 text-xs font-semibold self-start sm:self-auto">
            <GraduationCap className="w-4 h-4" />
            <span>Student Practice Mode</span>
          </div>
        ) : (
          <div className="flex items-center gap-2.5 w-full sm:w-auto">
            <button 
              onClick={() => setShowBulkModal(true)}
              className="flex-1 sm:flex-none flex items-center justify-center space-x-2 bg-surface hover:bg-border/50 text-text border border-border px-3.5 py-2.5 rounded-2xl text-xs sm:text-sm font-medium transition-colors cursor-pointer"
            >
              <UploadCloud className="w-4 h-4" />
              <span>Bulk Upload</span>
            </button>
            <button 
              onClick={() => setShowFormModal(true)}
              className="flex-1 sm:flex-none flex items-center justify-center space-x-2 bg-primary hover:bg-primaryHover text-white px-3.5 py-2.5 rounded-2xl text-xs sm:text-sm font-medium transition-colors cursor-pointer shadow-md shadow-primary/20"
            >
              <Plus className="w-4 h-4" />
              <span>Add Single Paper</span>
            </button>
          </div>
        )}
      </div>

      {/* Student Banner */}
      {isStudent && (
        <div className="p-4 rounded-2xl bg-blue-500/10 border border-blue-500/20 text-text flex items-start gap-3">
          <div className="p-2 rounded-xl bg-blue-500/20 text-blue-400 mt-0.5 shrink-0">
            <GraduationCap className="w-5 h-5" />
          </div>
          <div>
            <h4 className="font-semibold text-xs sm:text-sm text-blue-400">Exam Practice & AI Senior Examiner Marking</h4>
            <p className="text-textMuted text-[11px] sm:text-xs mt-1 leading-relaxed">
              Explore past papers, review questions against official marking schemes, and tap <strong className="text-text font-bold">"Mark My Paper"</strong> on any exam to upload handwritten working for instant AI grading and red-ink marks.
            </p>
          </div>
        </div>
      )}

      {/* Toolbar */}
      <div className="bg-surface border border-border rounded-3xl p-3 sm:p-4 flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
        <div className="relative w-full md:flex-1 md:min-w-[200px]">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-textMuted" />
          <input
            type="text"
            placeholder="Search papers by subject, year..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-background border border-border rounded-2xl text-xs sm:text-sm text-text focus:outline-none focus:border-primary transition-colors"
          />
        </div>
        
        <div className="grid grid-cols-3 gap-2 w-full md:w-auto">
          <select 
            className="bg-background border border-border text-text rounded-2xl px-2.5 sm:px-4 py-2 text-xs sm:text-sm focus:outline-none focus:border-primary cursor-pointer truncate"
            value={curriculumFilter}
            onChange={(e) => setCurriculumFilter(e.target.value)}
          >
            <option value="All">Curriculum: All</option>
            <option value="ZIMSEC">ZIMSEC</option>
            <option value="Cambridge">Cambridge</option>
          </select>
          <select 
            className="bg-background border border-border text-text rounded-2xl px-2.5 sm:px-4 py-2 text-xs sm:text-sm focus:outline-none focus:border-primary cursor-pointer truncate"
            value={subjectFilter}
            onChange={(e) => setSubjectFilter(e.target.value)}
          >
            <option value="All">Subject: All</option>
            {uniqueSubjects.map(sub => (
              <option key={sub as string} value={sub as string}>{sub as string}</option>
            ))}
          </select>
          <select 
            className="bg-background border border-border text-text rounded-2xl px-2.5 sm:px-4 py-2 text-xs sm:text-sm focus:outline-none focus:border-primary cursor-pointer truncate"
            value={yearFilter}
            onChange={(e) => setYearFilter(e.target.value)}
          >
            <option value="All">Year: All</option>
            {uniqueYears.map(yr => (
              <option key={yr as string} value={yr as string}>{yr as string}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Mobile Card List (Visible on mobile/tablet < lg) */}
      <div className="block lg:hidden space-y-3">
        {loading ? (
          <div className="bg-surface border border-border rounded-3xl p-8 text-center text-textMuted text-sm">
            Loading papers...
          </div>
        ) : filteredPapers.length === 0 ? (
          <div className="bg-surface border border-border rounded-3xl p-8 text-center text-textMuted text-sm">
            No papers found matching your criteria.
          </div>
        ) : (
          filteredPapers.map((paper) => (
            <div key={paper.id} className="bg-surface border border-border rounded-3xl p-4 space-y-3 shadow-sm hover:border-primary/40 transition-colors">
              {/* Top row: Subject, curriculum badge, paper year */}
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl flex items-center justify-center bg-primary/10 border border-primary/20 shrink-0">
                    <BookOpen className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <h3 className="font-bold text-text text-base leading-tight">{paper.subject}</h3>
                    <p className="text-xs text-textMuted mt-0.5">
                      {paper.curriculum} • {paper.grade_level} • Paper {paper.paper_number}
                      {paper.variant ? ` (Var ${paper.variant})` : ''}
                    </p>
                  </div>
                </div>

                <div className="text-right shrink-0">
                  <span className="inline-block px-2.5 py-1 rounded-xl text-xs font-semibold bg-background border border-border text-text">
                    {paper.year} {paper.session ? `(${paper.session})` : ''}
                  </span>
                </div>
              </div>

              {/* Status / Feature Tags */}
              <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                {paper.type === 'ms' ? (
                  <span className="inline-flex items-center px-2 py-0.5 rounded-lg text-[11px] font-medium bg-success/10 text-success border border-success/20">
                    Marking Scheme
                  </span>
                ) : (
                  <span className="inline-flex items-center px-2 py-0.5 rounded-lg text-[11px] font-medium bg-primary/10 text-primary border border-primary/20">
                    Question Paper
                  </span>
                )}

                {paper.ingestion_jobs && paper.ingestion_jobs.length > 0 && (
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-lg text-[11px] font-medium ${
                    paper.ingestion_jobs[0].status === 'completed' ? 'bg-success/10 text-success border border-success/20' :
                    paper.ingestion_jobs[0].status === 'failed' ? 'bg-error/10 text-error border border-error/20' :
                    'bg-warning/10 text-warning border border-warning/20'
                  }`}>
                    {paper.ingestion_jobs[0].status.charAt(0).toUpperCase() + paper.ingestion_jobs[0].status.slice(1)}
                    {paper.question_count > 0 ? ` (${paper.question_count} Qs)` : ''}
                  </span>
                )}

                {paper.pdf_url && (
                  <a
                    href={paper.pdf_url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[11px] font-medium text-primary bg-primary/5 border border-primary/20 hover:bg-primary/10 transition-colors"
                  >
                    <span>View PDF</span>
                    <ExternalLink className="w-3 h-3 opacity-70" />
                  </a>
                )}
              </div>

              {/* Action Buttons */}
              <div className="pt-2 border-t border-border/60 flex flex-col gap-2">
                {/* Primary Action Button: Mark Paper */}
                <button
                  type="button"
                  onClick={() => setSelectedPaperForMarking(paper)}
                  className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-2xl text-xs font-bold bg-primary hover:bg-primaryHover text-white transition-all shadow-md shadow-primary/20 cursor-pointer"
                >
                  <Sparkles className="w-4 h-4" />
                  <span>{isStudent ? 'Mark My Paper with AI' : 'Mark Students Papers'}</span>
                  {paper.marked_count > 0 && (
                    <span className="ml-1 px-1.5 py-0.5 rounded-full text-[10px] bg-white/20 text-white font-bold">
                      {paper.marked_count} marked
                    </span>
                  )}
                </button>

                {/* Secondary Action Row: Scheme, View Details, Delete */}
                <div className="flex items-center gap-2">
                  {paper.solution_count > 0 ? (
                    <button
                      type="button"
                      onClick={() => {
                        setViewingPaperId(paper.id);
                        setInitialModalTab('scheme');
                      }}
                      className="flex-1 inline-flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl text-xs font-semibold bg-success/15 text-success border border-success/30 hover:bg-success/25 transition-all cursor-pointer"
                    >
                      <FileCheck className="w-3.5 h-3.5" />
                      <span>Scheme ({paper.solution_count})</span>
                    </button>
                  ) : paper.mark_scheme_url ? (
                    <a
                      href={paper.mark_scheme_url}
                      target="_blank"
                      rel="noreferrer"
                      className="flex-1 inline-flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl text-xs font-medium bg-background border border-border text-text hover:bg-border/40 transition-colors"
                    >
                      <ExternalLink className="w-3.5 h-3.5 text-textMuted" />
                      <span>Scheme PDF</span>
                    </a>
                  ) : null}

                  <button
                    onClick={() => {
                      setViewingPaperId(paper.id);
                      setInitialModalTab('questions');
                    }}
                    className="flex-1 inline-flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl text-xs font-medium bg-background hover:bg-border/50 text-text border border-border transition-colors cursor-pointer"
                  >
                    <Eye className="w-3.5 h-3.5" />
                    <span>Questions</span>
                  </button>

                  {!isStudent && (
                    <button
                      onClick={() => handleDelete(paper.id)}
                      className="p-2 text-textMuted hover:text-error hover:bg-error/10 rounded-xl transition-colors cursor-pointer border border-border"
                      title="Delete Paper"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Desktop Papers Table (Visible on lg+) */}
      <div className="hidden lg:block bg-surface border border-border rounded-3xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-background border-b border-border text-textMuted text-sm">
                <th className="p-4 font-medium">Subject</th>
                <th className="p-4 font-medium">Details</th>
                <th className="p-4 font-medium">Type</th>
                <th className="p-4 font-medium">Year & Session</th>
                <th className="p-4 font-medium">Status</th>
                <th className="p-4 font-medium">PDF File</th>
                <th className="p-4 font-medium">Marking Scheme</th>
                <th className="p-4 font-medium">{isStudent ? 'AI Paper Marking' : 'Student Papers'}</th>
                <th className="p-4 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading ? (
                 <tr>
                 <td colSpan={9} className="p-8 text-center text-textMuted">
                   Loading papers...
                 </td>
               </tr>
              ) : filteredPapers.length === 0 ? (
                <tr>
                  <td colSpan={9} className="p-8 text-center text-textMuted">
                    No papers found matching your criteria.
                  </td>
                </tr>
              ) : (
                filteredPapers.map((paper) => (
                  <tr key={paper.id} className="hover:bg-background transition-colors group">
                    <td className="p-4">
                      <div className="flex items-center space-x-3">
                        <div className={`w-10 h-10 rounded-2xl flex items-center justify-center bg-primary/10 border border-primary/20 shrink-0`}>
                          <BookOpen className="w-5 h-5 text-primary" />
                        </div>
                        <div>
                          <span className="font-medium text-text">{paper.subject}</span>
                          <span className="text-xs text-textMuted block mt-0.5">{paper.curriculum} • {paper.grade_level}</span>
                        </div>
                      </div>
                    </td>
                    <td className="p-4 text-textMuted">
                      <span className="block text-text font-medium">Paper {paper.paper_number}</span>
                      {paper.variant && <span className="text-xs">Variant {paper.variant}</span>}
                    </td>
                    <td className="p-4">
                      {paper.type === 'ms' ? (
                        <span className="inline-flex items-center px-2.5 py-1 rounded-xl text-xs font-medium bg-success/10 text-success border border-success/20">
                          Marking Scheme
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2.5 py-1 rounded-xl text-xs font-medium bg-primary/10 text-primary border border-primary/20">
                          Question Paper
                        </span>
                      )}
                    </td>
                    <td className="p-4 text-textMuted">
                      <span className="block text-text">{paper.year}</span>
                      <span className="text-xs">{paper.session || 'N/A'}</span>
                    </td>
                    <td className="p-4">
                      <div className="flex items-center gap-2">
                        {paper.ingestion_jobs && paper.ingestion_jobs.length > 0 ? (
                          <div className="flex flex-col gap-0.5">
                          <span className={`inline-flex items-center px-2.5 py-1 rounded-xl text-xs font-medium ${
                            paper.ingestion_jobs[0].status === 'completed' ? 'bg-success/10 text-success border border-success/20' :
                            paper.ingestion_jobs[0].status === 'failed' ? 'bg-error/10 text-error border border-error/20' :
                            'bg-warning/10 text-warning border border-warning/20'
                          }`}>
                            {paper.ingestion_jobs[0].status.charAt(0).toUpperCase() + paper.ingestion_jobs[0].status.slice(1)}
                          </span>
                          {paper.question_count > 0 && (
                            <span className="text-[11px] text-textMuted font-medium pl-1">
                              {paper.question_count} Questions
                            </span>
                          )}
                        </div>
                        ) : (
                          <span className="inline-flex items-center px-2.5 py-1 rounded-xl text-xs font-medium bg-surface text-textMuted border border-border">
                            Legacy
                          </span>
                        )}

                        {(!paper.ingestion_jobs || paper.ingestion_jobs[0]?.status !== 'completed') && (
                          <button
                            type="button"
                            onClick={() => handleExtractPaper(paper.id)}
                            disabled={extractingPaperId === paper.id}
                            className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium bg-primary/10 text-primary border border-primary/20 hover:bg-primary/20 transition-colors disabled:opacity-50 cursor-pointer"
                            title="Run Agent Extraction on Supabase Edge Functions"
                          >
                            {extractingPaperId === paper.id ? (
                              <RefreshCw className="w-3 h-3 animate-spin" />
                            ) : (
                              <Sparkles className="w-3 h-3" />
                            )}
                            <span>{extractingPaperId === paper.id ? 'Extracting...' : 'Extract'}</span>
                          </button>
                        )}
                      </div>
                    </td>
                    <td className="p-4">
                      {paper.pdf_url ? (
                        <a href={paper.pdf_url} target="_blank" rel="noreferrer" className="text-primary text-sm hover:underline inline-flex items-center gap-1">
                          <span>View PDF</span>
                          <ExternalLink className="w-3 h-3 opacity-70" />
                        </a>
                      ) : (
                        <span className="text-textMuted text-sm">No PDF</span>
                      )}
                    </td>

                    {/* Dedicated Marking Scheme Column */}
                    <td className="p-4">
                      {paper.mark_scheme_url ? (
                        <div className="flex items-center space-x-2">
                          {paper.solution_count > 0 ? (
                            <button
                              type="button"
                              onClick={() => {
                                setViewingPaperId(paper.id);
                                setInitialModalTab('scheme');
                              }}
                              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-semibold bg-success/15 text-success border border-success/30 hover:bg-success/25 transition-all cursor-pointer shadow-sm"
                              title="View Extracted Marking Scheme Rubrics & Worked Solutions"
                            >
                              <FileCheck className="w-3.5 h-3.5" />
                              <span>View Scheme ({paper.solution_count})</span>
                            </button>
                          ) : !isStudent ? (
                            <button
                              type="button"
                              onClick={() => handleProcessMarkScheme(paper.id, paper.mark_scheme_url)}
                              disabled={processingMsPaperId === paper.id}
                              className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium bg-amber-500/10 text-amber-500 border border-amber-500/20 hover:bg-amber-500/20 transition-colors disabled:opacity-50 cursor-pointer"
                              title="Extract rubrics and solutions with Marking Scheme Agent"
                            >
                              {processingMsPaperId === paper.id ? (
                                <RefreshCw className="w-3 h-3 animate-spin" />
                              ) : (
                                <Sparkles className="w-3 h-3" />
                              )}
                              <span>{processingMsPaperId === paper.id ? 'Extracting...' : 'Extract Scheme'}</span>
                            </button>
                          ) : null}

                          <a 
                            href={paper.mark_scheme_url} 
                            target="_blank" 
                            rel="noreferrer" 
                            className="p-1.5 text-textMuted hover:text-success hover:bg-success/10 rounded-lg transition-colors"
                            title="Open Original Marking Scheme PDF in new tab"
                          >
                            <ExternalLink className="w-3.5 h-3.5 opacity-70" />
                          </a>

                          {!isStudent && (
                            <>
                              <button
                                type="button"
                                onClick={() => setSelectedPaperForMs(paper)}
                                className="p-1.5 text-textMuted hover:text-primary hover:bg-primary/10 rounded-lg transition-colors cursor-pointer"
                                title="Update / Replace Marking Scheme"
                              >
                                <Edit className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteMarkScheme(paper)}
                                className="p-1.5 text-textMuted hover:text-error hover:bg-error/10 rounded-lg transition-colors cursor-pointer"
                                title="Delete Marking Scheme"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </>
                          )}
                        </div>
                      ) : !isStudent ? (
                        <button
                          type="button"
                          onClick={() => setSelectedPaperForMs(paper)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl text-xs font-medium bg-primary/10 text-primary border border-primary/20 hover:bg-primary/20 transition-colors cursor-pointer"
                          title="Attach or upload marking scheme"
                        >
                          <Plus className="w-3 h-3" />
                          <span>Attach Scheme</span>
                        </button>
                      ) : (
                        <span className="text-xs text-textMuted italic">Pending educator</span>
                      )}
                    </td>

                    {/* Student Papers / Bulk Marking Column */}
                    <td className="p-4">
                      {isStudent ? (
                        <button
                          type="button"
                          onClick={() => setSelectedPaperForMarking(paper)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-gradient-to-r from-primary/20 via-primary/10 to-purple-500/15 text-primary border border-primary/30 hover:bg-primary/25 hover:border-primary/50 transition-all cursor-pointer shadow-sm group"
                          title="Upload your handwritten answers to get marked by the AI Senior Examiner"
                        >
                          <Sparkles className="w-3.5 h-3.5 text-primary group-hover:rotate-12 transition-transform" />
                          <span>Mark My Paper</span>
                          {paper.marked_count > 0 && (
                            <span className="ml-1 px-1.5 py-0.5 rounded-full text-[10px] bg-primary text-white font-bold">
                              {paper.marked_count} marked
                            </span>
                          )}
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setSelectedPaperForMarking(paper)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-primary/15 text-primary border border-primary/30 hover:bg-primary/25 transition-all cursor-pointer shadow-sm group"
                          title="Mark student exam scripts with AI"
                        >
                          <Sparkles className="w-3.5 h-3.5 text-primary group-hover:rotate-12 transition-transform" />
                          <span>Mark Students Papers</span>
                          {paper.marked_count > 0 && (
                            <span className="ml-1 px-1.5 py-0.5 rounded-full text-[10px] bg-primary text-white font-bold">
                              {paper.marked_count}
                            </span>
                          )}
                        </button>
                      )}
                    </td>

                    <td className="p-4 text-right">
                      <div className="flex items-center justify-end space-x-3">
                        <button 
                          onClick={() => {
                            setViewingPaperId(paper.id);
                            setInitialModalTab('questions');
                          }}
                          className="flex items-center space-x-1 p-2 text-textMuted hover:text-primary hover:bg-primary/10 rounded-xl transition-colors cursor-pointer" 
                          title="View Paper Details"
                        >
                          <Eye className="w-4 h-4" />
                          <span className="text-sm font-medium">View</span>
                        </button>
                        {!isStudent && (
                          <button 
                            onClick={() => handleDelete(paper.id)}
                            className="flex items-center space-x-1 p-2 text-textMuted hover:text-error hover:bg-error/10 rounded-xl transition-colors cursor-pointer" 
                            title="Delete Paper"
                          >
                            <Trash2 className="w-4 h-4" />
                            <span className="text-sm font-medium">Delete</span>
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modals */}
      {showFormModal && (
        <PaperFormModal 
          onClose={() => setShowFormModal(false)} 
          onSuccess={() => { setShowFormModal(false); fetchPapers(); }}
        />
      )}
      
      {showBulkModal && (
        <BulkUploadModal 
          onClose={() => setShowBulkModal(false)} 
          onSuccess={() => { setShowBulkModal(false); fetchPapers(); }}
        />
      )}

      {viewingPaperId && (
        <PaperViewModal 
          paperId={viewingPaperId}
          onClose={() => setViewingPaperId(null)}
        />
      )}

      {selectedPaperForMarking && (
        <TeacherBulkMarkingModal
          paper={selectedPaperForMarking}
          onClose={() => setSelectedPaperForMarking(null)}
          onPaperUpdated={fetchPapers}
        />
      )}

      {selectedPaperForMs && (
        <MarkingSchemeModal
          paper={selectedPaperForMs}
          onClose={() => setSelectedPaperForMs(null)}
          onSuccess={() => {
            setSelectedPaperForMs(null);
            fetchPapers();
          }}
        />
      )}
    </div>
  );
}
