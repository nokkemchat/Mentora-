import React, { useState, useEffect, useRef } from 'react';
import { Search, Filter, Plus, Edit, Trash2, Eye, BarChart2, BookOpen, ChevronDown, ChevronUp, ChevronRight, ArrowLeft, FolderOpen, UploadCloud, FileText, ExternalLink, FileCheck, Sparkles, RefreshCw, CheckCircle2, GraduationCap, Calendar, ArrowUpDown, SlidersHorizontal, LayoutGrid, List, X as CloseIcon } from 'lucide-react';
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
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('table');

  // Fixed top chrome (title, actions, search & filters): its measured height
  // is exposed as --papers-chrome-h so the table pane and sticky column
  // headers can offset below it.
  const chromeRef = useRef<HTMLDivElement>(null);
  const [chromeHeight, setChromeHeight] = useState(0);

  useEffect(() => {
    const el = chromeRef.current;
    if (!el) return;
    const update = () => setChromeHeight(el.offsetHeight);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

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
        alert('Extraction started with Ziviso Visual Ingestion Agent (cropping diagrams & visual assets).');
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
      if (error) {
        let serverMsg = error.message;
        try {
          if (error.context && typeof error.context.json === 'function') {
            const body = await error.context.json();
            if (body?.error) serverMsg = body.error;
          }
        } catch (_) {}
        throw new Error(serverMsg);
      }
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
  
  // Filters & Arrangement
  const [curriculumFilter, setCurriculumFilter] = useState('All');
  const [subjectFilter, setSubjectFilter] = useState('All');
  const [yearFilter, setYearFilter] = useState('All');
  const [sortBy, setSortBy] = useState<'year_desc' | 'year_asc' | 'subject_asc' | 'questions_desc'>('year_desc');
  const [groupBy, setGroupBy] = useState<'year' | 'subject' | 'none'>('year');

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
            } else if (isTeacher && user) {
              mq = mq.eq('created_by', user.id);
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

  const handleSelectSubject = (subjectName: string) => {
    setSubjectFilter(subjectName);
    setSortBy('year_desc'); // Always show most recent year first when opening a subject
    setGroupBy('year');
  };

  const handleBackToSubjects = () => {
    setSubjectFilter('All');
  };

  // Papers matching search + board + year (used to build the Subject Directory counts)
  const baseFilteredPapers = papers.filter(paper => {
    if (search.trim()) {
      const tokens = search.toLowerCase().trim().split(/\s+/);
      const searchCorpus = [
        paper.subject,
        paper.curriculum,
        paper.grade_level,
        paper.year?.toString(),
        paper.paper_number?.toString(),
        `paper ${paper.paper_number}`,
        `p${paper.paper_number}`,
        paper.session,
        paper.variant?.toString(),
        paper.variant ? `var ${paper.variant}` : '',
        paper.variant ? `v${paper.variant}` : ''
      ].filter(Boolean).join(' ').toLowerCase();

      const allTokensMatch = tokens.every(token => searchCorpus.includes(token));
      if (!allTokensMatch) return false;
    }

    const matchesCurriculum = curriculumFilter === 'All' || paper.curriculum === curriculumFilter;
    const matchesYear = yearFilter === 'All' || paper.year?.toString() === yearFilter;
    return matchesCurriculum && matchesYear;
  });

  // Build Subject Directory summary (each subject + number of question papers + years)
  const subjectDirectory = React.useMemo(() => {
    const map = new Map<
      string,
      {
        subject: string;
        paperCount: number;
        curriculums: Set<string>;
        years: Set<number>;
        totalQuestions: number;
        totalSolutions: number;
        totalMarked: number;
      }
    >();

    baseFilteredPapers.forEach((p) => {
      const subName = (p.subject || 'Other').trim();
      if (!map.has(subName)) {
        map.set(subName, {
          subject: subName,
          paperCount: 0,
          curriculums: new Set<string>(),
          years: new Set<number>(),
          totalQuestions: 0,
          totalSolutions: 0,
          totalMarked: 0,
        });
      }
      const entry = map.get(subName)!;
      entry.paperCount += 1;
      if (p.curriculum) entry.curriculums.add(p.curriculum);
      if (p.year && !Number.isNaN(Number(p.year))) entry.years.add(Number(p.year));
      entry.totalQuestions += Number(p.question_count || 0);
      entry.totalSolutions += Number(p.solution_count || 0);
      entry.totalMarked += Number(p.marked_count || 0);
    });

    return Array.from(map.values())
      .map((item) => {
        const sortedYears = Array.from(item.years).sort((a, b) => b - a);
        return {
          subject: item.subject,
          paperCount: item.paperCount,
          curriculums: Array.from(item.curriculums),
          years: sortedYears,
          latestYear: sortedYears[0] || null,
          oldestYear: sortedYears[sortedYears.length - 1] || null,
          totalQuestions: item.totalQuestions,
          totalSolutions: item.totalSolutions,
          totalMarked: item.totalMarked,
        };
      })
      .sort((a, b) => a.subject.localeCompare(b.subject));
  }, [baseFilteredPapers]);

  const isSubjectSelected = subjectFilter !== 'All';

  const filteredPapers = baseFilteredPapers.filter(paper => {
    const matchesSubject = subjectFilter === 'All' || paper.subject === subjectFilter;
    return matchesSubject;
  }).sort((a, b) => {
    if (sortBy === 'year_desc') {
      const diff = (Number(b.year) || 0) - (Number(a.year) || 0);
      if (diff !== 0) return diff;
      const sDiff = (a.subject || '').localeCompare(b.subject || '');
      if (sDiff !== 0) return sDiff;
      return (Number(a.paper_number) || 0) - (Number(b.paper_number) || 0);
    }
    if (sortBy === 'year_asc') {
      const diff = (Number(a.year) || 0) - (Number(b.year) || 0);
      if (diff !== 0) return diff;
      const sDiff = (a.subject || '').localeCompare(b.subject || '');
      if (sDiff !== 0) return sDiff;
      return (Number(a.paper_number) || 0) - (Number(b.paper_number) || 0);
    }
    if (sortBy === 'subject_asc') {
      const sDiff = (a.subject || '').localeCompare(b.subject || '');
      if (sDiff !== 0) return sDiff;
      return (Number(b.year) || 0) - (Number(a.year) || 0);
    }
    if (sortBy === 'questions_desc') {
      return (Number(b.question_count) || 0) - (Number(a.question_count) || 0);
    }
    return 0;
  });

  // Extract unique subjects and years for filters
  const uniqueSubjects = Array.from(new Set(papers.map(p => p.subject))).filter(Boolean).sort();
  const uniqueYears = Array.from(new Set(papers.map(p => p.year))).filter(Boolean).sort((a: any, b: any) => b - a);

  // Group papers for clean mobile section arrangement
  const groupedPapers: { title: string; subtitle?: string; count: number; items: any[] }[] = [];
  if (groupBy === 'year') {
    const yearMap = new Map<string, any[]>();
    filteredPapers.forEach(p => {
      const y = p.year ? `${p.year}` : 'Unknown Year';
      if (!yearMap.has(y)) yearMap.set(y, []);
      yearMap.get(y)!.push(p);
    });
    const sortedYears = Array.from(yearMap.keys()).sort((a, b) => {
      if (sortBy === 'year_asc') return (parseInt(a) || 0) - (parseInt(b) || 0);
      return (parseInt(b) || 0) - (parseInt(a) || 0);
    });
    sortedYears.forEach(y => {
      groupedPapers.push({
        title: y,
        subtitle: `${yearMap.get(y)!.length} ${yearMap.get(y)!.length === 1 ? 'Exam Paper' : 'Exam Papers'}`,
        count: yearMap.get(y)!.length,
        items: yearMap.get(y)!
      });
    });
  } else if (groupBy === 'subject') {
    const subMap = new Map<string, any[]>();
    filteredPapers.forEach(p => {
      const s = p.subject || 'Other Subjects';
      if (!subMap.has(s)) subMap.set(s, []);
      subMap.get(s)!.push(p);
    });
    const sortedSubs = Array.from(subMap.keys()).sort();
    sortedSubs.forEach(s => {
      groupedPapers.push({
        title: s,
        subtitle: `${subMap.get(s)!.length} ${subMap.get(s)!.length === 1 ? 'Paper' : 'Papers'}`,
        count: subMap.get(s)!.length,
        items: subMap.get(s)!
      });
    });
  } else {
    groupedPapers.push({
      title: 'All Papers',
      subtitle: `${filteredPapers.length} ${filteredPapers.length === 1 ? 'Paper' : 'Papers'}`,
      count: filteredPapers.length,
      items: filteredPapers
    });
  }

  const hasActiveFilters = search.trim() !== '' || curriculumFilter !== 'All' || subjectFilter !== 'All' || yearFilter !== 'All';
  const resetFilters = () => {
    setSearch('');
    setCurriculumFilter('All');
    setSubjectFilter('All');
    setYearFilter('All');
  };

  return (
    <div
      className="max-w-7xl mx-auto space-y-4"
      style={{ ['--papers-chrome-h']: `${chromeHeight}px` } as React.CSSProperties}
    >
      {/* Fixed Frosted Top Chrome — title, actions, search & filters stay pinned
          while the question papers list scrolls beneath them (iOS-style) */}
      <div
        ref={chromeRef}
        className="papers-chrome -mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8 pt-2 pb-3 space-y-3 bg-background/70 backdrop-blur-2xl backdrop-saturate-150"
      >
        {/* Smooth fade-out scrim: papers dissolve into the header instead of hitting a hard edge */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute left-0 right-0 top-full h-14 bg-gradient-to-b from-background/70 via-background/35 to-transparent"
        />
      {/* Clean, Compact Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 flex-wrap">
          {isSubjectSelected ? (
            <>
              <button
                type="button"
                onClick={handleBackToSubjects}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-white/85 hover:bg-white text-slate-800 border border-slate-200/90 hover:border-indigo-300 dark:bg-slate-900/75 dark:hover:bg-slate-800/90 dark:text-slate-100 dark:border-white/15 dark:hover:border-indigo-300/40 shadow-2xs transition-all cursor-pointer active:scale-95"
                title="Back to all subjects"
              >
                <ArrowLeft className="w-3.5 h-3.5 text-indigo-600 dark:text-sky-300" />
                <span>All Subjects</span>
              </button>
              <ChevronRight className="w-4 h-4 text-slate-400 dark:text-slate-500 hidden sm:block" />
              <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white tracking-tight">
                {subjectFilter}
              </h1>
              <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-indigo-500/10 text-indigo-700 border border-indigo-500/20 dark:bg-indigo-400/15 dark:text-indigo-100 dark:border-indigo-300/30">
                {filteredPapers.length} {filteredPapers.length === 1 ? 'Paper' : 'Papers'}
              </span>
            </>
          ) : (
            <>
              <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white tracking-tight">
                Question Paper Subjects
              </h1>
              <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-indigo-500/10 text-indigo-700 border border-indigo-500/20 dark:bg-indigo-400/15 dark:text-indigo-100 dark:border-indigo-300/30">
                {subjectDirectory.length} {subjectDirectory.length === 1 ? 'Subject' : 'Subjects'}
              </span>
            </>
          )}
        </div>

        <div className="flex items-center gap-2 self-end sm:self-auto flex-wrap">
          {/* View Mode Toggle: Grid Cards vs Table (shown when viewing a subject's papers) */}
          {isSubjectSelected && (
            <div className="flex items-center bg-white/80 dark:bg-slate-900/70 backdrop-blur-md border border-slate-200/90 dark:border-white/15 rounded-xl p-1 gap-1 shadow-xs">
              <button
                type="button"
                onClick={() => setViewMode('grid')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                  viewMode === 'grid'
                    ? 'bg-gradient-to-b from-indigo-500 to-indigo-600 text-white shadow-sm shadow-indigo-500/30'
                    : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                }`}
                title="Card Grid View"
              >
                <LayoutGrid className="w-3.5 h-3.5" />
                <span>Cards</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode('table')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                  viewMode === 'table'
                    ? 'bg-gradient-to-b from-indigo-500 to-indigo-600 text-white shadow-sm shadow-indigo-500/30'
                    : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                }`}
                title="Table View"
              >
                <List className="w-3.5 h-3.5" />
                <span>Table</span>
              </button>
            </div>
          )}

          {!isStudent && (
            <>
              <button 
                onClick={() => setShowBulkModal(true)}
                className="flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold bg-white/85 hover:bg-white text-slate-800 border border-slate-200/90 hover:border-indigo-300 dark:bg-slate-900/70 dark:hover:bg-slate-800/90 dark:text-slate-100 dark:border-white/15 dark:hover:border-indigo-300/40 backdrop-blur-md shadow-xs transition-all cursor-pointer active:scale-[0.98]"
              >
                <UploadCloud className="w-3.5 h-3.5 text-indigo-600 dark:text-sky-300" />
                <span className="hidden sm:inline">Bulk Upload</span>
              </button>
              <button 
                onClick={() => setShowFormModal(true)}
                className="flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold text-white bg-gradient-to-b from-indigo-500 to-indigo-600 hover:from-indigo-400 hover:to-indigo-500 border border-indigo-400/40 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.32),0_4px_14px_-2px_rgba(99,102,241,0.5)] hover:-translate-y-0.5 active:translate-y-0 transition-all cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Paper</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* Search & Filters — sit directly on the frosted chrome, no boxed container */}
      <div className="space-y-2.5">
        {/* Search Row */}
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-300/80" />
          <input
            type="text"
            placeholder={
              isSubjectSelected
                ? `Search inside ${subjectFilter} papers (e.g. '2024', 'Paper 2', 'May/June')...`
                : "Search for a subject or exam paper (e.g. 'Mathematics', 'Chemistry', '2024')..."
            }
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-8 py-2.5 bg-white/85 dark:bg-slate-900/75 backdrop-blur-md border border-slate-200/90 dark:border-white/15 rounded-xl text-xs sm:text-sm text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-400 focus:outline-none focus:border-indigo-500 dark:focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/15 transition-all"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 dark:hover:text-white p-1 rounded-full cursor-pointer transition-colors"
              title="Clear search"
            >
              <CloseIcon className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Single Compact Scrollable Filter Strip */}
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
          {/* Quick Subject Switcher Pills when inside a subject */}
          {isSubjectSelected && (
            <button
              type="button"
              onClick={handleBackToSubjects}
              className="shrink-0 inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-xl cursor-pointer border bg-white/80 dark:bg-slate-900/70 hover:bg-white dark:hover:bg-slate-800/85 text-slate-700 dark:text-slate-200 border-slate-200/90 dark:border-white/15 backdrop-blur-md transition-all"
            >
              <FolderOpen className="w-3.5 h-3.5 text-indigo-500 dark:text-sky-300" />
              <span>All Subjects ({subjectDirectory.length})</span>
            </button>
          )}

          {/* Board Pill */}
          <div className="relative shrink-0">
            <select
              value={curriculumFilter}
              onChange={(e) => setCurriculumFilter(e.target.value)}
              className={`appearance-none text-xs font-semibold pl-3 pr-7 py-1.5 rounded-xl cursor-pointer border backdrop-blur-md transition-all ${
                curriculumFilter !== 'All'
                  ? 'bg-indigo-500/12 dark:bg-indigo-400/20 border-indigo-500/40 dark:border-indigo-300/45 text-indigo-700 dark:text-indigo-100 font-bold'
                  : 'bg-white/80 dark:bg-slate-900/70 hover:bg-white dark:hover:bg-slate-800/85 text-slate-700 dark:text-slate-200 border-slate-200/90 dark:border-white/15'
              }`}
            >
              <option value="All">Board: All</option>
              <option value="ZIMSEC">Board: ZIMSEC</option>
              <option value="Cambridge">Board: Cambridge</option>
            </select>
            <ChevronDown className={`w-3 h-3 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none ${curriculumFilter !== 'All' ? 'text-indigo-600 dark:text-indigo-200' : 'text-slate-400 dark:text-slate-300'}`} />
          </div>

          {/* Year Pill */}
          <div className="relative shrink-0">
            <select
              value={yearFilter}
              onChange={(e) => setYearFilter(e.target.value)}
              className={`appearance-none text-xs font-semibold pl-3 pr-7 py-1.5 rounded-xl cursor-pointer border backdrop-blur-md transition-all ${
                yearFilter !== 'All'
                  ? 'bg-indigo-500/12 dark:bg-indigo-400/20 border-indigo-500/40 dark:border-indigo-300/45 text-indigo-700 dark:text-indigo-100 font-bold'
                  : 'bg-white/80 dark:bg-slate-900/70 hover:bg-white dark:hover:bg-slate-800/85 text-slate-700 dark:text-slate-200 border-slate-200/90 dark:border-white/15'
              }`}
            >
              <option value="All">Year: All</option>
              {uniqueYears.map((yr) => (
                <option key={yr as string} value={yr.toString()}>{yr as string}</option>
              ))}
            </select>
            <ChevronDown className={`w-3 h-3 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none ${yearFilter !== 'All' ? 'text-indigo-600 dark:text-indigo-200' : 'text-slate-400 dark:text-slate-300'}`} />
          </div>

          {/* Subject Jump Pill */}
          <div className="relative shrink-0">
            <select
              value={subjectFilter}
              onChange={(e) => {
                const val = e.target.value;
                if (val === 'All') {
                  handleBackToSubjects();
                } else {
                  handleSelectSubject(val);
                }
              }}
              className={`appearance-none text-xs font-semibold pl-3 pr-7 py-1.5 rounded-xl cursor-pointer border backdrop-blur-md transition-all max-w-[180px] truncate ${
                subjectFilter !== 'All'
                  ? 'bg-indigo-500/12 dark:bg-indigo-400/20 border-indigo-500/40 dark:border-indigo-300/45 text-indigo-700 dark:text-indigo-100 font-bold'
                  : 'bg-white/80 dark:bg-slate-900/70 hover:bg-white dark:hover:bg-slate-800/85 text-slate-700 dark:text-slate-200 border-slate-200/90 dark:border-white/15'
              }`}
            >
              <option value="All">Subject: Choose Subject</option>
              {uniqueSubjects.map((sub) => (
                <option key={sub as string} value={sub as string}>{sub as string}</option>
              ))}
            </select>
            <ChevronDown className={`w-3 h-3 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none ${subjectFilter !== 'All' ? 'text-indigo-600 dark:text-indigo-200' : 'text-slate-400 dark:text-slate-300'}`} />
          </div>

          {/* Sort Pill (shown when inside a subject) */}
          {isSubjectSelected && (
            <div className="relative shrink-0">
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as any)}
                className="appearance-none bg-white/80 dark:bg-slate-900/70 hover:bg-white dark:hover:bg-slate-800/85 text-slate-700 dark:text-slate-200 text-xs font-semibold pl-3 pr-7 py-1.5 rounded-xl cursor-pointer border border-slate-200/90 dark:border-white/15 backdrop-blur-md transition-all"
              >
                <option value="year_desc">Sort: Newest Year First</option>
                <option value="year_asc">Sort: Oldest Year First</option>
                <option value="questions_desc">Sort: Most Questions</option>
              </select>
              <ChevronDown className="w-3 h-3 text-slate-400 dark:text-slate-300 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>
          )}

          {/* Reset Action Pill */}
          {hasActiveFilters && (
            <button
              type="button"
              onClick={resetFilters}
              className="shrink-0 flex items-center gap-1 text-xs text-rose-700 dark:text-rose-200 hover:text-rose-800 dark:hover:text-white font-semibold px-2.5 py-1.5 rounded-xl bg-rose-500/10 dark:bg-rose-400/15 border border-rose-500/25 dark:border-rose-300/30 cursor-pointer transition-all"
            >
              <CloseIcon className="w-3 h-3" />
              <span>Reset</span>
            </button>
          )}
        </div>
      </div>
      </div>

      {/* Results Counter & Arrangement Indicator — frosted pills keep text crisp over floating artwork */}
      <div className="flex items-center justify-between text-xs px-1">
        <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/75 dark:bg-slate-900/65 backdrop-blur-md border border-slate-200/80 dark:border-white/12 text-slate-600 dark:text-slate-300 shadow-2xs">
          <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 dark:bg-cyan-300 shadow-[0_0_6px_rgba(103,232,249,0.75)]" />
          {isSubjectSelected ? (
            <span>
              Showing <strong className="text-slate-900 dark:text-white font-bold">{filteredPapers.length}</strong>{' '}
              {filteredPapers.length === 1 ? 'question paper' : 'question papers'} in{' '}
              <strong className="text-indigo-600 dark:text-sky-300 font-bold">{subjectFilter}</strong>
              {search ? ` matching "${search}"` : ''}
            </span>
          ) : (
            <span>
              Select a subject below • <strong className="text-slate-900 dark:text-white font-bold">{subjectDirectory.length}</strong>{' '}
              {subjectDirectory.length === 1 ? 'subject' : 'subjects'} ({baseFilteredPapers.length} total question papers)
            </span>
          )}
        </span>
        <span className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/75 dark:bg-slate-900/65 backdrop-blur-md border border-slate-200/80 dark:border-white/12 text-slate-600 dark:text-slate-300 shadow-2xs">
          <ArrowUpDown className="w-3 h-3 text-indigo-500 dark:text-indigo-300" />
          <span>
            {isSubjectSelected ? (
              <>
                Ordered by <strong className="text-slate-800 dark:text-slate-100 font-semibold">{sortBy === 'year_asc' ? 'Oldest Year First' : 'Most Recent Year First'}</strong>
              </>
            ) : (
              <>
                Click any subject to view its papers
              </>
            )}
          </span>
        </span>
      </div>

      {/* Main Content: Level 1 = Subject Directory, Level 2 = Selected Subject's Question Papers */}
      {loading ? (
        <div className="papers-surface rounded-3xl p-12 text-center text-sm flex flex-col items-center justify-center gap-3">
          <RefreshCw className="w-8 h-8 text-indigo-500 dark:text-sky-300 animate-spin" />
          <p className="font-semibold text-slate-900 dark:text-white">Loading question papers...</p>
        </div>
      ) : !isSubjectSelected ? (
        subjectDirectory.length === 0 ? (
          <div className="papers-surface rounded-3xl p-12 text-center text-sm space-y-3 flex flex-col items-center justify-center">
            <div className="w-14 h-14 rounded-2xl bg-indigo-500/10 dark:bg-indigo-400/15 border border-indigo-500/20 dark:border-indigo-300/30 flex items-center justify-center text-indigo-600 dark:text-indigo-200 shadow-inner">
              <BookOpen className="w-7 h-7" />
            </div>
            <div>
              <p className="font-bold text-slate-900 dark:text-white text-base">No subjects found</p>
              <p className="text-xs text-slate-500 dark:text-slate-300 mt-1">Try adjusting your search keywords or board filters.</p>
            </div>
            {hasActiveFilters && (
              <button
                onClick={resetFilters}
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-indigo-500/12 hover:bg-indigo-500/20 text-indigo-700 dark:bg-indigo-400/20 dark:hover:bg-indigo-400/30 dark:text-indigo-100 border border-indigo-500/25 dark:border-indigo-300/35 cursor-pointer mt-2 transition-all"
              >
                Clear All Filters
              </button>
            )}
          </div>
        ) : (
          /* ========================================================================= */
          /* LEVEL 1: SUBJECT DIRECTORY CARDS (Click a Subject -> View Papers)         */
          /* ========================================================================= */
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {subjectDirectory.map((item) => {
              const yearRangeLabel =
                item.years.length === 0
                  ? 'All Years'
                  : item.years.length === 1
                  ? `${item.years[0]}`
                  : `${item.oldestYear} – ${item.latestYear}`;

              return (
                <button
                  key={item.subject}
                  type="button"
                  onClick={() => handleSelectSubject(item.subject)}
                  className="papers-card-surface rounded-3xl p-5 text-left flex flex-col justify-between gap-4 group cursor-pointer hover:-translate-y-0.5 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
                >
                  {/* Top Row: Subject Icon + Name + Question Paper Count Badge */}
                  <div className="flex items-start justify-between gap-3 w-full">
                    <div className="flex items-start gap-3.5 min-w-0">
                      <div className="w-12 h-12 rounded-2xl flex items-center justify-center bg-gradient-to-br from-indigo-500/15 to-sky-500/10 dark:from-indigo-400/20 dark:to-cyan-400/15 border border-indigo-500/25 dark:border-indigo-300/30 text-indigo-600 dark:text-sky-200 shrink-0 shadow-inner group-hover:scale-105 transition-transform">
                        <BookOpen className="w-6 h-6" />
                      </div>
                      <div className="min-w-0">
                        <h3 className="font-bold text-slate-900 dark:text-white text-lg leading-snug truncate group-hover:text-indigo-600 dark:group-hover:text-sky-300 transition-colors">
                          {item.subject}
                        </h3>
                        <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                          {item.curriculums.map((curr) => (
                            <span
                              key={curr}
                              className={`px-2 py-0.5 rounded-md text-[11px] font-semibold border ${
                                curr === 'Cambridge'
                                  ? 'bg-sky-500/10 text-sky-700 border-sky-500/25 dark:bg-sky-400/15 dark:text-sky-200 dark:border-sky-300/30'
                                  : 'bg-amber-500/10 text-amber-700 border-amber-500/25 dark:bg-amber-400/15 dark:text-amber-200 dark:border-amber-300/30'
                              }`}
                            >
                              {curr}
                            </span>
                          ))}
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium bg-slate-100/90 dark:bg-white/[0.07] border border-slate-200/80 dark:border-white/12 text-slate-600 dark:text-slate-200 tabular-nums">
                            <Calendar className="w-3 h-3 text-indigo-500 dark:text-sky-300" />
                            <span>{yearRangeLabel}</span>
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Number of Question Papers Pill */}
                    <div className="shrink-0 text-right">
                      <span className="inline-flex flex-col items-end px-3 py-1.5 rounded-2xl bg-indigo-500/10 dark:bg-indigo-400/18 border border-indigo-500/25 dark:border-indigo-300/35">
                        <span className="text-base font-extrabold text-indigo-700 dark:text-white leading-none tabular-nums">
                          {item.paperCount}
                        </span>
                        <span className="text-[10px] font-semibold text-indigo-600/90 dark:text-indigo-200 mt-0.5">
                          {item.paperCount === 1 ? 'Paper' : 'Papers'}
                        </span>
                      </span>
                    </div>
                  </div>

                  {/* Stats Strip */}
                  <div className="w-full rounded-2xl p-3 bg-slate-50/85 dark:bg-slate-950/45 border border-slate-200/80 dark:border-white/10 grid grid-cols-2 gap-2 text-xs">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="w-7 h-7 rounded-lg bg-indigo-500/10 dark:bg-sky-400/15 flex items-center justify-center text-indigo-600 dark:text-sky-300 shrink-0">
                        <FileText className="w-3.5 h-3.5" />
                      </div>
                      <div className="min-w-0">
                        <span className="text-[10px] text-slate-500 dark:text-slate-400 block font-medium">Question Papers</span>
                        <span className="font-semibold text-slate-900 dark:text-white truncate block text-xs">
                          {item.paperCount} {item.paperCount === 1 ? 'Question Paper' : 'Question Papers'}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 min-w-0">
                      <div className="w-7 h-7 rounded-lg bg-emerald-500/12 text-emerald-600 dark:bg-emerald-400/18 dark:text-emerald-300 flex items-center justify-center shrink-0">
                        <FileCheck className="w-3.5 h-3.5" />
                      </div>
                      <div className="min-w-0">
                        <span className="text-[10px] text-slate-500 dark:text-slate-400 block font-medium">Extracted Bank</span>
                        <span className="font-semibold text-slate-900 dark:text-white truncate block text-xs">
                          {item.totalQuestions} Questions
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Bottom CTA Bar */}
                  <div className="w-full pt-2 border-t border-slate-200/80 dark:border-white/10 flex items-center justify-between text-xs">
                    <span className="text-slate-500 dark:text-slate-300 font-medium">
                      {item.latestYear ? `Latest paper: ${item.latestYear}` : 'Click to open subject'}
                    </span>
                    <span className="inline-flex items-center gap-1 font-bold text-indigo-600 dark:text-sky-300 group-hover:translate-x-0.5 transition-transform">
                      <span>Open Subject</span>
                      <ChevronRight className="w-4 h-4" />
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        )
      ) : filteredPapers.length === 0 ? (
        <div className="papers-surface rounded-3xl p-12 text-center text-sm space-y-3 flex flex-col items-center justify-center">
          <div className="w-14 h-14 rounded-2xl bg-indigo-500/10 dark:bg-indigo-400/15 border border-indigo-500/20 dark:border-indigo-300/30 flex items-center justify-center text-indigo-600 dark:text-indigo-200 shadow-inner">
            <BookOpen className="w-7 h-7" />
          </div>
          <div>
            <p className="font-bold text-slate-900 dark:text-white text-base">No examination papers found</p>
            <p className="text-xs text-slate-500 dark:text-slate-300 mt-1">Try adjusting your search keywords, exam year, or board filters.</p>
          </div>
          {hasActiveFilters && (
            <button
              onClick={resetFilters}
              className="px-4 py-2 rounded-xl text-xs font-semibold bg-indigo-500/12 hover:bg-indigo-500/20 text-indigo-700 dark:bg-indigo-400/20 dark:hover:bg-indigo-400/30 dark:text-indigo-100 border border-indigo-500/25 dark:border-indigo-300/35 cursor-pointer mt-2 transition-all"
            >
              Clear All Filters
            </button>
          )}
        </div>
      ) : viewMode === 'grid' ? (
        /* ========================================================================= */
        /* RESPONSIVE GRID CARDS VIEW (Orderly, Beautiful, High-Contrast)            */
        /* ========================================================================= */
        <div className="space-y-6">
          {groupedPapers.map((group) => (
            <div key={group.title} className="space-y-3.5">
              {/* Group Header */}
              {groupBy !== 'none' && (
                <div className="flex items-center justify-between px-2 pt-1">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-base sm:text-lg text-slate-900 dark:text-white flex items-center gap-2">
                      {groupBy === 'year' ? (
                        <Calendar className="w-4 h-4 text-indigo-600 dark:text-sky-300" />
                      ) : (
                        <BookOpen className="w-4 h-4 text-indigo-600 dark:text-sky-300" />
                      )}
                      <span>{group.title}</span>
                    </span>
                    <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-indigo-500/12 text-indigo-700 border border-indigo-500/25 dark:bg-indigo-400/20 dark:text-indigo-100 dark:border-indigo-300/35">
                      {group.count}
                    </span>
                  </div>
                  {group.subtitle && (
                    <span className="text-xs text-slate-600 dark:text-slate-300 font-medium px-2.5 py-0.5 rounded-full bg-white/70 dark:bg-slate-900/55 backdrop-blur-md border border-slate-200/80 dark:border-white/10">
                      {group.subtitle}
                    </span>
                  )}
                </div>
              )}

              {/* Orderly Responsive Cards Grid: 1 col on mobile, 2 cols on tablet/laptop, 3 cols on desktop */}
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {group.items.map((paper) => (
                  <div
                    key={paper.id}
                    className="papers-card-surface rounded-3xl p-5 flex flex-col justify-between gap-4 group"
                  >
                    {/* Top Row: Subject Title, Icon & Year/Session Badge */}
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3 min-w-0">
                        <div className="w-11 h-11 rounded-2xl flex items-center justify-center bg-gradient-to-br from-indigo-500/15 to-sky-500/10 dark:from-indigo-400/20 dark:to-cyan-400/10 border border-indigo-500/20 dark:border-indigo-300/25 text-indigo-600 dark:text-indigo-100 shrink-0 shadow-inner group-hover:scale-105 transition-transform">
                          <BookOpen className="w-5 h-5" />
                        </div>
                        <div className="min-w-0">
                          <h3 className="font-bold text-slate-900 dark:text-white text-base leading-snug truncate" title={paper.subject}>
                            {paper.subject}
                          </h3>
                          {/* Board, Grade Level & Paper Number */}
                          <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                            <span className={`px-2 py-0.5 rounded-md text-[11px] font-semibold border ${
                              paper.curriculum === 'Cambridge' 
                                ? 'bg-sky-500/10 text-sky-700 border-sky-500/25 dark:bg-sky-400/15 dark:text-sky-200 dark:border-sky-300/30' 
                                : 'bg-amber-500/10 text-amber-700 border-amber-500/25 dark:bg-amber-400/15 dark:text-amber-200 dark:border-amber-300/30'
                            }`}>
                              {paper.curriculum}
                            </span>
                            <span className="px-2 py-0.5 rounded-md text-[11px] font-medium bg-slate-100/90 dark:bg-white/[0.07] border border-slate-200/80 dark:border-white/12 text-slate-600 dark:text-slate-200">
                              {paper.grade_level || 'O-Level'}
                            </span>
                            <span className="px-2 py-0.5 rounded-md text-[11px] font-semibold bg-indigo-500/10 text-indigo-700 border border-indigo-500/20 dark:bg-indigo-400/15 dark:text-indigo-100 dark:border-indigo-300/25">
                              Paper {paper.paper_number}{paper.variant ? ` (Var ${paper.variant})` : ''}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Year & Session Badge */}
                      <div className="shrink-0 text-right">
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl text-xs font-bold bg-slate-100/90 dark:bg-white/[0.08] border border-slate-200/80 dark:border-white/15 text-slate-900 dark:text-white shadow-2xs tabular-nums">
                          <Calendar className="w-3 h-3 text-indigo-500 dark:text-sky-300" />
                          <span>{paper.year}</span>
                          {paper.session && <span className="text-slate-500 dark:text-slate-300 text-[10px] font-medium">({paper.session})</span>}
                        </span>
                      </div>
                    </div>

                    {/* Information Strip: Orderly 2-Column Mini Box */}
                    <div className="rounded-2xl p-3 bg-slate-50/85 dark:bg-slate-950/45 border border-slate-200/80 dark:border-white/10 grid grid-cols-2 gap-2 text-xs">
                      {/* Questions count */}
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="w-7 h-7 rounded-lg bg-indigo-500/10 dark:bg-sky-400/15 flex items-center justify-center text-indigo-600 dark:text-sky-300 shrink-0">
                          <FileText className="w-3.5 h-3.5" />
                        </div>
                        <div className="min-w-0">
                          <span className="text-[10px] text-slate-500 dark:text-slate-400 block font-medium">Questions</span>
                          <span className="font-semibold text-slate-900 dark:text-white truncate block text-xs">
                            {paper.question_count > 0 ? `${paper.question_count} Extracted` : 'Pending'}
                          </span>
                        </div>
                      </div>

                      {/* Marking scheme status */}
                      <div className="flex items-center gap-2 min-w-0">
                        <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
                          paper.solution_count > 0
                            ? 'bg-emerald-500/12 text-emerald-600 dark:bg-emerald-400/18 dark:text-emerald-300'
                            : paper.mark_scheme_url
                            ? 'bg-sky-500/12 text-sky-600 dark:bg-sky-400/18 dark:text-sky-300'
                            : 'bg-amber-500/12 text-amber-600 dark:bg-amber-400/18 dark:text-amber-300'
                        }`}>
                          <FileCheck className="w-3.5 h-3.5" />
                        </div>
                        <div className="min-w-0">
                          <span className="text-[10px] text-slate-500 dark:text-slate-400 block font-medium">Mark Scheme</span>
                          <span className="font-semibold text-slate-900 dark:text-white truncate block text-xs">
                            {paper.solution_count > 0 ? `${paper.solution_count} Solutions` : paper.mark_scheme_url ? 'PDF Attached' : 'None'}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Document Download Links (if available) */}
                    {(paper.pdf_url || paper.mark_scheme_url) && (
                      <div className="flex items-center gap-2 pt-0.5 flex-wrap">
                        {paper.pdf_url && (
                          <a
                            href={paper.pdf_url}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-slate-100/90 hover:bg-white text-slate-700 hover:text-indigo-600 border border-slate-200/90 hover:border-indigo-300 dark:bg-white/[0.07] dark:hover:bg-white/[0.13] dark:text-slate-100 dark:hover:text-white dark:border-white/12 dark:hover:border-sky-300/40 transition-all"
                            title="Open Question Paper PDF"
                          >
                            <FileText className="w-3 h-3 text-indigo-500 dark:text-sky-300" />
                            <span>Paper PDF</span>
                            <ExternalLink className="w-2.5 h-2.5 opacity-60" />
                          </a>
                        )}
                        {paper.mark_scheme_url && (
                          <a
                            href={paper.mark_scheme_url}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-emerald-50/90 hover:bg-emerald-50 text-emerald-800 border border-emerald-200/90 hover:border-emerald-300 dark:bg-emerald-400/[0.11] dark:hover:bg-emerald-400/[0.18] dark:text-emerald-100 dark:hover:text-white dark:border-emerald-300/25 dark:hover:border-emerald-300/45 transition-all"
                            title="Open Official Mark Scheme PDF"
                          >
                            <FileCheck className="w-3 h-3 text-emerald-600 dark:text-emerald-300" />
                            <span>Scheme PDF</span>
                            <ExternalLink className="w-2.5 h-2.5 opacity-60" />
                          </a>
                        )}
                      </div>
                    )}

                    {/* Action Buttons Area: No overlapping elements! */}
                    <div className="pt-3 border-t border-slate-200/80 dark:border-white/10 flex flex-col gap-2.5">
                      {/* Primary Marking Button */}
                      <button
                        type="button"
                        onClick={() => setSelectedPaperForMarking(paper)}
                        className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-xs font-semibold text-white bg-gradient-to-b from-indigo-500 to-indigo-600 hover:from-indigo-400 hover:to-indigo-500 border border-indigo-400/40 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.32),0_4px_14px_-2px_rgba(99,102,241,0.5)] hover:shadow-[inset_0_1px_0_0_rgba(255,255,255,0.42),0_6px_20px_-2px_rgba(99,102,241,0.65)] hover:-translate-y-0.5 active:translate-y-0 transition-all cursor-pointer"
                      >
                        <Sparkles className="w-4 h-4 text-indigo-100 shrink-0" />
                        <span className="truncate">{isStudent ? 'Mark My Paper with AI' : 'Mark Students Papers'}</span>
                        {paper.marked_count > 0 && (
                          <span className="ml-1 inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] bg-white/20 text-white font-bold shrink-0">
                            <span>{paper.marked_count}</span>
                            <span className="opacity-90 font-medium">marked</span>
                          </span>
                        )}
                      </button>

                      {/* Secondary Action Toolbar */}
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setViewingPaperId(paper.id);
                            setInitialModalTab('questions');
                          }}
                          className="flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl text-xs font-semibold bg-slate-100/90 hover:bg-white text-slate-800 border border-slate-200/90 dark:bg-white/[0.07] dark:hover:bg-white/[0.13] dark:text-slate-100 dark:border-white/14 transition-all cursor-pointer truncate"
                          title="View Questions & Booklets"
                        >
                          <Eye className="w-3.5 h-3.5 shrink-0 text-slate-500 dark:text-slate-300" />
                          <span className="truncate">Questions</span>
                        </button>

                        {paper.solution_count > 0 ? (
                          <button
                            type="button"
                            onClick={() => {
                              setViewingPaperId(paper.id);
                              setInitialModalTab('scheme');
                            }}
                            className="flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl text-xs font-semibold bg-emerald-500/10 hover:bg-emerald-500/18 text-emerald-700 border border-emerald-500/25 dark:bg-emerald-400/14 dark:hover:bg-emerald-400/22 dark:text-emerald-100 dark:border-emerald-300/30 transition-all cursor-pointer truncate"
                            title="View Official Worked Solutions"
                          >
                            <FileCheck className="w-3.5 h-3.5 shrink-0 text-emerald-600 dark:text-emerald-300" />
                            <span className="truncate">Scheme ({paper.solution_count})</span>
                          </button>
                        ) : !isStudent ? (
                          <button
                            type="button"
                            onClick={() => setSelectedPaperForMs(paper)}
                            className="flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl text-xs font-semibold bg-indigo-500/10 hover:bg-indigo-500/18 text-indigo-700 border border-indigo-500/25 dark:bg-white/[0.08] dark:hover:bg-white/[0.14] dark:text-indigo-100 dark:border-white/16 transition-all cursor-pointer truncate"
                            title="Attach Official Marking Scheme"
                          >
                            <Plus className="w-3.5 h-3.5 shrink-0 text-indigo-600 dark:text-indigo-300" />
                            <span className="truncate">Attach Scheme</span>
                          </button>
                        ) : (
                          <div className="flex items-center justify-center text-[11px] text-slate-400 dark:text-slate-400 italic bg-slate-100/50 dark:bg-white/[0.03] rounded-xl border border-slate-200/60 dark:border-white/10 py-2 px-3">
                            No Scheme
                          </div>
                        )}
                      </div>

                      {/* Admin/Teacher Extra Options: Extract & Delete in a clean footer */}
                      {!isStudent && (
                        <div className="flex items-center justify-between pt-1 text-xs">
                          {(!paper.ingestion_jobs || paper.ingestion_jobs[0]?.status !== 'completed') ? (
                            <button
                              type="button"
                              onClick={() => handleExtractPaper(paper.id)}
                              disabled={extractingPaperId === paper.id}
                              className="inline-flex items-center gap-1 text-[11px] font-medium text-indigo-600 dark:text-sky-300 hover:underline cursor-pointer disabled:opacity-50"
                            >
                              <RefreshCw className={`w-3 h-3 ${extractingPaperId === paper.id ? 'animate-spin' : ''}`} />
                              <span>{extractingPaperId === paper.id ? 'Extracting...' : 'Extract Content'}</span>
                            </button>
                          ) : (
                            <span className="text-[11px] text-emerald-600 dark:text-emerald-300 flex items-center gap-1 font-medium">
                              <CheckCircle2 className="w-3 h-3" />
                              <span>Ingested</span>
                            </span>
                          )}

                          <button
                            onClick={() => handleDelete(paper.id)}
                            className="p-1.5 text-slate-400 dark:text-slate-300 hover:text-rose-600 dark:hover:text-rose-300 hover:bg-rose-500/10 dark:hover:bg-rose-500/15 rounded-lg transition-colors cursor-pointer"
                            title="Delete Paper"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        /* ========================================================================= */
        /* STREAMLINED TABLE VIEW (Sleek, High-Contrast, Harmonious Glass)           */
        /* ========================================================================= */
        <div className="papers-surface rounded-3xl overflow-hidden">
          <div className="papers-table-pane overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[860px]">
              <thead>
                <tr className="border-b border-slate-200/80 dark:border-white/10 text-slate-500 dark:text-slate-300/85 text-[11px] font-semibold uppercase tracking-[0.08em]">
                  <th className="sticky top-0 z-10 py-3.5 px-5 font-semibold min-w-[230px]">Paper &amp; Subject</th>
                  <th className="sticky top-0 z-10 py-3.5 px-4 font-semibold min-w-[125px]">Year &amp; Session</th>
                  <th className="sticky top-0 z-10 py-3.5 px-4 font-semibold min-w-[140px]">Content Status</th>
                  <th className="sticky top-0 z-10 py-3.5 px-4 font-semibold min-w-[145px]">Documents</th>
                  <th className="sticky top-0 z-10 py-3.5 px-4 font-semibold min-w-[155px]">Mark Scheme</th>
                  <th className="sticky top-0 z-10 py-3.5 px-4 font-semibold min-w-[175px]">{isStudent ? 'AI Marking' : 'Student Papers'}</th>
                  <th className="sticky top-0 z-10 py-3.5 px-5 font-semibold text-right min-w-[100px]">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200/70 dark:divide-white/[0.07]">
                {filteredPapers.map((paper) => (
                  <tr
                    key={paper.id}
                    className="hover:bg-indigo-500/[0.04] dark:hover:bg-white/[0.045] transition-colors duration-150 group"
                  >
                    {/* Paper & Subject */}
                    <td className="py-3.5 px-5">
                      <div className="flex items-center gap-3.5">
                        <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-gradient-to-br from-indigo-500/15 to-sky-500/10 dark:from-indigo-400/20 dark:to-cyan-400/10 border border-indigo-500/20 dark:border-indigo-300/25 shrink-0 text-indigo-600 dark:text-indigo-100 shadow-inner group-hover:scale-105 group-hover:border-indigo-400/40 dark:group-hover:border-indigo-200/45 dark:group-hover:text-white transition-all">
                          <BookOpen className="w-4 h-4" />
                        </div>
                        <div className="min-w-0">
                          <span className="font-semibold text-slate-900 dark:text-white text-sm block truncate tracking-tight">
                            {paper.subject}
                          </span>
                          <div className="flex items-center gap-1.5 mt-1 text-xs">
                            <span
                              className={`px-1.5 py-0.5 rounded-md text-[10.5px] font-semibold leading-none border ${
                                paper.curriculum === 'Cambridge'
                                  ? 'bg-sky-500/10 text-sky-700 border-sky-500/20 dark:bg-sky-400/15 dark:text-sky-200 dark:border-sky-300/30'
                                  : 'bg-amber-500/10 text-amber-700 border-amber-500/20 dark:bg-amber-400/15 dark:text-amber-200 dark:border-amber-300/30'
                              }`}
                            >
                              {paper.curriculum}
                            </span>
                            <span className="text-slate-300 dark:text-slate-500">•</span>
                            <span className="text-slate-600 dark:text-slate-300 font-medium">
                              Paper {paper.paper_number}
                              {paper.variant ? ` (Var ${paper.variant})` : ''}
                            </span>
                          </div>
                        </div>
                      </div>
                    </td>

                    {/* Year & Session */}
                    <td className="py-3.5 px-4">
                      <span className="block font-bold text-sm text-slate-900 dark:text-white tabular-nums">
                        {paper.year}
                      </span>
                      <span className="text-xs text-slate-500 dark:text-slate-300/85 font-medium">
                        {paper.session || 'Main'}
                      </span>
                    </td>

                    {/* Content Status */}
                    <td className="py-3.5 px-4">
                      <div className="flex flex-col gap-1.5">
                        {paper.question_count > 0 ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200/90 dark:bg-indigo-400/15 dark:text-indigo-100 dark:border-indigo-300/30 shadow-2xs w-fit">
                            <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 dark:bg-cyan-300 shadow-[0_0_6px_rgba(103,232,249,0.85)] shrink-0" />
                            <span>{paper.question_count} Questions</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200/90 dark:bg-amber-400/15 dark:text-amber-100 dark:border-amber-300/30 w-fit">
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-500 dark:bg-amber-300 shrink-0" />
                            <span>Pending</span>
                          </span>
                        )}
                        {!isStudent && (!paper.ingestion_jobs || paper.ingestion_jobs[0]?.status !== 'completed') && (
                          <button
                            type="button"
                            onClick={() => handleExtractPaper(paper.id)}
                            disabled={extractingPaperId === paper.id}
                            className="inline-flex items-center gap-1 text-[11px] font-medium text-indigo-600 dark:text-sky-300 hover:text-indigo-500 dark:hover:text-sky-200 hover:underline cursor-pointer disabled:opacity-50 w-fit pl-1"
                          >
                            <RefreshCw className={`w-3 h-3 ${extractingPaperId === paper.id ? 'animate-spin' : ''}`} />
                            <span>{extractingPaperId === paper.id ? 'Extracting...' : 'Extract'}</span>
                          </button>
                        )}
                      </div>
                    </td>

                    {/* Documents */}
                    <td className="py-3.5 px-4 text-xs">
                      <div className="flex flex-col gap-1.5">
                        {paper.pdf_url ? (
                          <a
                            href={paper.pdf_url}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11.5px] font-medium bg-slate-100/90 hover:bg-white text-slate-700 hover:text-indigo-600 border border-slate-200/90 hover:border-indigo-300 dark:bg-white/[0.07] dark:hover:bg-white/[0.13] dark:text-slate-100 dark:hover:text-white dark:border-white/12 dark:hover:border-sky-300/40 transition-all w-fit"
                          >
                            <FileText className="w-3 h-3 text-indigo-500 dark:text-sky-300 shrink-0" />
                            <span>Exam PDF</span>
                            <ExternalLink className="w-2.5 h-2.5 opacity-60 shrink-0" />
                          </a>
                        ) : (
                          <span className="text-slate-400 dark:text-slate-400 italic text-[11px]">No Paper PDF</span>
                        )}
                        {paper.mark_scheme_url && (
                          <a
                            href={paper.mark_scheme_url}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11.5px] font-medium bg-emerald-50/90 hover:bg-emerald-50 text-emerald-800 hover:text-emerald-900 border border-emerald-200/90 hover:border-emerald-300 dark:bg-emerald-400/[0.11] dark:hover:bg-emerald-400/[0.18] dark:text-emerald-100 dark:hover:text-white dark:border-emerald-300/25 dark:hover:border-emerald-300/45 transition-all w-fit"
                          >
                            <FileCheck className="w-3 h-3 text-emerald-600 dark:text-emerald-300 shrink-0" />
                            <span>Scheme PDF</span>
                            <ExternalLink className="w-2.5 h-2.5 opacity-60 shrink-0" />
                          </a>
                        )}
                      </div>
                    </td>

                    {/* Mark Scheme */}
                    <td className="py-3.5 px-4">
                      {paper.solution_count > 0 ? (
                        <button
                          type="button"
                          onClick={() => {
                            setViewingPaperId(paper.id);
                            setInitialModalTab('scheme');
                          }}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-emerald-500/10 hover:bg-emerald-500/18 text-emerald-700 border border-emerald-500/25 hover:border-emerald-500/40 dark:bg-emerald-400/14 dark:hover:bg-emerald-400/22 dark:text-emerald-100 dark:hover:text-white dark:border-emerald-300/30 dark:hover:border-emerald-300/50 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.12)] transition-all cursor-pointer active:scale-[0.98]"
                        >
                          <FileCheck className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-300 shrink-0" />
                          <span>Scheme</span>
                          <span className="px-1.5 py-0.5 rounded-md text-[10.5px] font-bold bg-emerald-500/15 text-emerald-800 dark:bg-emerald-300/20 dark:text-emerald-50 leading-none tabular-nums">
                            {paper.solution_count}
                          </span>
                        </button>
                      ) : !isStudent ? (
                        <button
                          type="button"
                          onClick={() => setSelectedPaperForMs(paper)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-indigo-500/10 hover:bg-indigo-500/18 text-indigo-700 border border-indigo-500/25 dark:bg-white/[0.08] dark:hover:bg-white/[0.14] dark:text-indigo-100 dark:border-white/16 dark:hover:border-indigo-300/40 transition-all cursor-pointer active:scale-[0.98]"
                        >
                          <Plus className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-300 shrink-0" />
                          <span>Attach Scheme</span>
                        </button>
                      ) : (
                        <span className="text-xs text-slate-400 dark:text-slate-400 italic">No Scheme</span>
                      )}
                    </td>

                    {/* AI Marking */}
                    <td className="py-3.5 px-4">
                      <button
                        type="button"
                        onClick={() => setSelectedPaperForMarking(paper)}
                        className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold text-white bg-gradient-to-b from-indigo-500 to-indigo-600 hover:from-indigo-400 hover:to-indigo-500 border border-indigo-400/40 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.32),0_4px_14px_-2px_rgba(99,102,241,0.5)] hover:shadow-[inset_0_1px_0_0_rgba(255,255,255,0.42),0_6px_20px_-2px_rgba(99,102,241,0.65)] hover:-translate-y-0.5 active:translate-y-0 transition-all cursor-pointer"
                      >
                        <Sparkles className="w-3.5 h-3.5 text-indigo-100 shrink-0" />
                        <span>{isStudent ? 'Mark My Paper' : 'Mark Paper'}</span>
                        {paper.marked_count > 0 && (
                          <span className="ml-0.5 inline-flex items-center px-1.5 py-0.5 rounded-md text-[10px] bg-white/20 text-white font-bold leading-none tabular-nums">
                            {paper.marked_count}
                          </span>
                        )}
                      </button>
                    </td>

                    {/* Actions */}
                    <td className="py-3.5 px-5 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button 
                          onClick={() => {
                            setViewingPaperId(paper.id);
                            setInitialModalTab('questions');
                          }}
                          className="w-8 h-8 inline-flex items-center justify-center text-slate-500 dark:text-slate-300 hover:text-indigo-600 dark:hover:text-white hover:bg-indigo-500/10 dark:hover:bg-white/12 border border-transparent hover:border-indigo-500/20 dark:hover:border-white/15 rounded-lg transition-all cursor-pointer" 
                          title="View Paper Details & Booklets"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        {!isStudent && (
                          <button 
                            onClick={() => handleDelete(paper.id)}
                            className="w-8 h-8 inline-flex items-center justify-center text-slate-500 dark:text-slate-300 hover:text-rose-600 dark:hover:text-rose-300 hover:bg-rose-500/10 dark:hover:bg-rose-500/15 border border-transparent hover:border-rose-500/20 dark:hover:border-rose-400/30 rounded-lg transition-all cursor-pointer" 
                            title="Delete Paper"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

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
