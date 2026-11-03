import React, { useState, useEffect } from 'react';
import { Search, Filter, Plus, Edit, Trash2, Eye, BarChart2, BookOpen, ChevronDown, ChevronUp, UploadCloud, FileText, ExternalLink, FileCheck, Sparkles, RefreshCw, CheckCircle2, GraduationCap, Calendar, ArrowUpDown, SlidersHorizontal, X as CloseIcon } from 'lucide-react';
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

  const filteredPapers = papers.filter(paper => {
    // Multi-token search across subject, year, paper_number, curriculum, session, variant, grade_level
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
    const matchesSubject = subjectFilter === 'All' || paper.subject === subjectFilter;
    const matchesYear = yearFilter === 'All' || paper.year?.toString() === yearFilter;
    
    return matchesCurriculum && matchesSubject && matchesYear;
  }).sort((a, b) => {
    if (sortBy === 'year_desc') {
      const diff = (b.year || 0) - (a.year || 0);
      if (diff !== 0) return diff;
      const sDiff = (a.subject || '').localeCompare(b.subject || '');
      if (sDiff !== 0) return sDiff;
      return (a.paper_number || 0) - (b.paper_number || 0);
    }
    if (sortBy === 'year_asc') {
      const diff = (a.year || 0) - (b.year || 0);
      if (diff !== 0) return diff;
      const sDiff = (a.subject || '').localeCompare(b.subject || '');
      if (sDiff !== 0) return sDiff;
      return (a.paper_number || 0) - (b.paper_number || 0);
    }
    if (sortBy === 'subject_asc') {
      const sDiff = (a.subject || '').localeCompare(b.subject || '');
      if (sDiff !== 0) return sDiff;
      return (b.year || 0) - (a.year || 0);
    }
    if (sortBy === 'questions_desc') {
      return (b.question_count || 0) - (a.question_count || 0);
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
    <div className="max-w-7xl mx-auto space-y-4">
      {/* Clean, Compact Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <h1 className="text-xl sm:text-2xl font-bold text-text tracking-tight">
            Past Papers
          </h1>
          <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-surface border border-border text-textMuted">
            {filteredPapers.length}
          </span>
        </div>

        {!isStudent && (
          <div className="flex items-center gap-2">
            <button 
              onClick={() => setShowBulkModal(true)}
              className="btn-3d-glass flex items-center gap-2 px-4 py-2 rounded-2xl text-xs font-semibold text-text cursor-pointer"
            >
              <UploadCloud className="w-3.5 h-3.5 text-primary" />
              <span className="hidden sm:inline">Bulk Upload</span>
            </button>
            <button 
              onClick={() => setShowFormModal(true)}
              className="btn-3d-primary flex items-center gap-2 px-4 py-2 rounded-2xl text-xs font-bold cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Paper</span>
            </button>
          </div>
        )}
      </div>

      {/* Sleek, Compact Filter Bar */}
      <div className="liquid-glass rounded-3xl p-3 sm:p-4 space-y-2.5 shadow-lg border border-border/80">
        {/* Search Row */}
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-textMuted" />
          <input
            type="text"
            placeholder="Search by subject, year (e.g. '2024 Math', 'Cambridge P2')..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-8 py-2 bg-background border border-border rounded-xl text-xs sm:text-sm text-text placeholder:text-textMuted/70 focus:outline-none focus:border-primary transition-colors"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-textMuted hover:text-text p-1 rounded-full cursor-pointer"
              title="Clear search"
            >
              <CloseIcon className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Single Compact Scrollable Filter Strip */}
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
          {/* Board Pill */}
          <div className="relative shrink-0">
            <select
              value={curriculumFilter}
              onChange={(e) => setCurriculumFilter(e.target.value)}
              className={`appearance-none text-xs font-semibold pl-3 pr-7 py-1.5 rounded-xl cursor-pointer border transition-colors ${
                curriculumFilter !== 'All'
                  ? 'bg-primary/10 border-primary text-primary font-bold'
                  : 'bg-background hover:bg-border/50 text-text border-border'
              }`}
            >
              <option value="All">Board: All</option>
              <option value="ZIMSEC">Board: ZIMSEC</option>
              <option value="Cambridge">Board: Cambridge</option>
            </select>
            <ChevronDown className={`w-3 h-3 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none ${curriculumFilter !== 'All' ? 'text-primary' : 'text-textMuted'}`} />
          </div>

          {/* Year Pill */}
          <div className="relative shrink-0">
            <select
              value={yearFilter}
              onChange={(e) => setYearFilter(e.target.value)}
              className={`appearance-none text-xs font-semibold pl-3 pr-7 py-1.5 rounded-xl cursor-pointer border transition-colors ${
                yearFilter !== 'All'
                  ? 'bg-primary/10 border-primary text-primary font-bold'
                  : 'bg-background hover:bg-border/50 text-text border-border'
              }`}
            >
              <option value="All">Year: All</option>
              {uniqueYears.map((yr) => (
                <option key={yr as string} value={yr.toString()}>{yr as string}</option>
              ))}
            </select>
            <ChevronDown className={`w-3 h-3 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none ${yearFilter !== 'All' ? 'text-primary' : 'text-textMuted'}`} />
          </div>

          {/* Subject Pill */}
          <div className="relative shrink-0">
            <select
              value={subjectFilter}
              onChange={(e) => setSubjectFilter(e.target.value)}
              className={`appearance-none text-xs font-semibold pl-3 pr-7 py-1.5 rounded-xl cursor-pointer border transition-colors max-w-[140px] truncate ${
                subjectFilter !== 'All'
                  ? 'bg-primary/10 border-primary text-primary font-bold'
                  : 'bg-background hover:bg-border/50 text-text border-border'
              }`}
            >
              <option value="All">Subject: All</option>
              {uniqueSubjects.map((sub) => (
                <option key={sub as string} value={sub as string}>{sub as string}</option>
              ))}
            </select>
            <ChevronDown className={`w-3 h-3 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none ${subjectFilter !== 'All' ? 'text-primary' : 'text-textMuted'}`} />
          </div>

          {/* Grouping Pill */}
          <div className="relative shrink-0">
            <select
              value={groupBy}
              onChange={(e) => setGroupBy(e.target.value as any)}
              className="appearance-none bg-background hover:bg-border/50 text-text text-xs font-semibold pl-3 pr-7 py-1.5 rounded-xl cursor-pointer border border-border transition-colors"
            >
              <option value="year">Group: Year</option>
              <option value="subject">Group: Subject</option>
              <option value="none">Group: Flat</option>
            </select>
            <ChevronDown className="w-3 h-3 text-textMuted absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>

          {/* Sort Pill */}
          <div className="relative shrink-0">
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="appearance-none bg-background hover:bg-border/50 text-text text-xs font-semibold pl-3 pr-7 py-1.5 rounded-xl cursor-pointer border border-border transition-colors"
            >
              <option value="year_desc">Sort: Newest Year</option>
              <option value="year_asc">Sort: Oldest Year</option>
              <option value="subject_asc">Sort: Subject A-Z</option>
              <option value="questions_desc">Sort: Questions</option>
            </select>
            <ChevronDown className="w-3 h-3 text-textMuted absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>

          {/* Reset Action Pill */}
          {hasActiveFilters && (
            <button
              type="button"
              onClick={resetFilters}
              className="shrink-0 flex items-center gap-1 text-xs text-primary hover:text-primaryHover font-semibold px-2.5 py-1.5 rounded-xl bg-primary/10 border border-primary/20 cursor-pointer transition-all"
            >
              <CloseIcon className="w-3 h-3" />
              <span>Reset</span>
            </button>
          )}
        </div>
      </div>

        {/* Results Counter & Arrangement Indicator */}
        <div className="flex items-center justify-between text-xs text-textMuted px-2">
          <span>
            Found <strong className="text-text font-bold">{filteredPapers.length}</strong> {filteredPapers.length === 1 ? 'exam paper' : 'exam papers'}
            {search ? ` matching "${search}"` : ''}
          </span>
          <span className="hidden sm:inline">
            Arranged by {groupBy === 'year' ? 'Exam Year' : groupBy === 'subject' ? 'Subject' : 'Default'}
          </span>
        </div>

      {/* Mobile Card List (Visible on mobile/tablet < lg) */}
      <div className="block lg:hidden space-y-5">
        {loading ? (
          <div className="bg-surface border border-border rounded-3xl p-8 text-center text-textMuted text-sm">
            Loading papers...
          </div>
        ) : filteredPapers.length === 0 ? (
          <div className="bg-surface border border-border rounded-3xl p-8 text-center text-textMuted text-sm space-y-2">
            <BookOpen className="w-8 h-8 text-textMuted mx-auto opacity-40" />
            <p className="font-semibold text-text">No papers found</p>
            <p className="text-xs">Try adjusting your search terms, year, or curriculum filter.</p>
          </div>
        ) : (
          groupedPapers.map((group) => (
            <div key={group.title} className="space-y-3">
              {/* Group Section Header */}
              {groupBy !== 'none' && (
                <div className="flex items-center justify-between px-1.5 pt-1">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-sm sm:text-base text-text flex items-center gap-1.5">
                      {groupBy === 'year' ? (
                        <Calendar className="w-4 h-4 text-primary" />
                      ) : (
                        <BookOpen className="w-4 h-4 text-primary" />
                      )}
                      <span>{group.title}</span>
                    </span>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-primary/10 text-primary border border-primary/20">
                      {group.count}
                    </span>
                  </div>
                  {group.subtitle && (
                    <span className="text-[11px] text-textMuted font-medium">{group.subtitle}</span>
                  )}
                </div>
              )}

              {/* Papers inside this group */}
              <div className="space-y-3">
                {group.items.map((paper) => (
                  <div key={paper.id} className="liquid-glass rounded-3xl p-4 sm:p-5 space-y-3.5 shadow-md hover:border-primary/50 hover:shadow-xl hover:shadow-primary/10 transition-all duration-200">
                    {/* Top row: Subject, curriculum badge, paper year */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-2xl flex items-center justify-center bg-primary/10 border border-primary/20 shrink-0">
                          <BookOpen className="w-4 h-4 sm:w-5 sm:h-5 text-primary" />
                        </div>
                        <div className="min-w-0">
                          <h3 className="font-bold text-text text-sm sm:text-base leading-tight truncate">{paper.subject}</h3>
                          <div className="flex items-center gap-1.5 text-[11px] text-textMuted mt-0.5 flex-wrap">
                            <span className={`px-1.5 py-0.2 rounded font-semibold ${
                              paper.curriculum === 'Cambridge' ? 'bg-blue-500/10 text-blue-400' : 'bg-emerald-500/10 text-emerald-400'
                            }`}>
                              {paper.curriculum}
                            </span>
                            <span>•</span>
                            <span>{paper.grade_level || 'O-Level'}</span>
                            <span>•</span>
                            <span className="font-medium text-text">Paper {paper.paper_number}</span>
                            {paper.variant && <span className="text-textMuted">(Var {paper.variant})</span>}
                          </div>
                        </div>
                      </div>

                      <div className="text-right shrink-0">
                        <span className="inline-block px-2.5 py-1 rounded-xl text-xs font-bold bg-background border border-border text-text shadow-2xs">
                          {paper.year} {paper.session ? `(${paper.session})` : ''}
                        </span>
                      </div>
                    </div>

                    {/* Status / Feature Tags */}
                    <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                      {paper.question_count > 0 ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-lg text-[10px] font-semibold bg-primary/10 text-primary border border-primary/20">
                          {paper.question_count} Questions
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-lg text-[10px] font-semibold bg-amber-500/10 text-amber-500 border border-amber-500/20">
                          Pending Ingestion
                        </span>
                      )}

                      {paper.solution_count > 0 ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-lg text-[10px] font-semibold bg-success/15 text-success border border-success/30">
                          Mark Scheme Available ({paper.solution_count})
                        </span>
                      ) : paper.mark_scheme_url ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-lg text-[10px] font-semibold bg-blue-500/10 text-blue-400 border border-blue-500/20">
                          Scheme PDF Attached
                        </span>
                      ) : null}

                      {paper.pdf_url && (
                        <a
                          href={paper.pdf_url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-medium text-primary bg-primary/5 border border-primary/20 hover:bg-primary/10 transition-colors ml-auto"
                        >
                          <span>PDF</span>
                          <ExternalLink className="w-2.5 h-2.5 opacity-70" />
                        </a>
                      )}
                    </div>

                    {/* Action Buttons */}
                    <div className="pt-2 border-t border-border/60 flex flex-col gap-2">
                      {/* Primary Action Button: Mark Paper */}
                      <button
                        type="button"
                        onClick={() => setSelectedPaperForMarking(paper)}
                        className="btn-3d-primary w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-2xl text-xs font-bold cursor-pointer shadow-md whitespace-nowrap"
                      >
                        <Sparkles className="w-3.5 h-3.5 shrink-0" />
                        <span className="whitespace-nowrap">{isStudent ? 'Mark My Paper with AI' : 'Mark Students Papers'}</span>
                        {paper.marked_count > 0 && (
                          <span className="ml-1 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] bg-white/20 text-white font-extrabold whitespace-nowrap shrink-0">
                            <span>{paper.marked_count}</span>
                            <span className="opacity-90 font-medium">marked</span>
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
                            className="flex-1 btn-3d-glass inline-flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl text-xs font-semibold text-success hover:text-success cursor-pointer"
                          >
                            <FileCheck className="w-3.5 h-3.5" />
                            <span>Scheme ({paper.solution_count})</span>
                          </button>
                        ) : paper.mark_scheme_url ? (
                          <a
                            href={paper.mark_scheme_url}
                            target="_blank"
                            rel="noreferrer"
                            className="flex-1 btn-3d-glass inline-flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl text-xs font-medium text-text"
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
                          className="flex-1 btn-3d-glass inline-flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl text-xs font-semibold text-text cursor-pointer"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span>View Questions</span>
                        </button>

                        {!isStudent && (
                          <button
                            onClick={() => handleDelete(paper.id)}
                            className="p-2 text-textMuted hover:text-error hover:bg-error/10 rounded-xl transition-colors cursor-pointer border border-border shrink-0"
                            title="Delete Paper"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Desktop Papers Table (Visible on lg+) */}
      <div className="hidden lg:block liquid-glass rounded-3xl overflow-hidden shadow-xl border border-border/80">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-surface-sunken/60 border-b border-border text-textMuted text-xs font-semibold uppercase tracking-wider">
                <th className="p-4 font-medium">Subject</th>
                <th className="p-4 font-medium">Details</th>
                <th className="p-4 font-medium">Type</th>
                <th className="p-4 font-medium">Year & Session</th>
                <th className="p-4 font-medium">Status</th>
                <th className="p-4 font-medium">PDF File</th>
                <th className="p-4 font-medium">Marking Scheme</th>
                <th className="p-4 font-medium whitespace-nowrap">{isStudent ? 'AI Paper Marking' : 'Student Papers'}</th>
                <th className="p-4 font-medium text-right whitespace-nowrap">Actions</th>
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
                    <td className="p-4 whitespace-nowrap">
                      {isStudent ? (
                        <button
                          type="button"
                          onClick={() => setSelectedPaperForMarking(paper)}
                          className="btn-3d-primary inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold whitespace-nowrap cursor-pointer shadow-md group"
                          title="Upload your handwritten answers to get marked by the AI Senior Examiner"
                        >
                          <Sparkles className="w-3.5 h-3.5 text-white group-hover:rotate-12 transition-transform shrink-0" />
                          <span className="whitespace-nowrap font-bold">Mark My Paper</span>
                          {paper.marked_count > 0 && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] bg-white/20 text-white font-extrabold whitespace-nowrap shrink-0 shadow-xs">
                              <span>{paper.marked_count}</span>
                              <span className="opacity-90 font-medium">marked</span>
                            </span>
                          )}
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setSelectedPaperForMarking(paper)}
                          className="btn-3d-primary inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold whitespace-nowrap cursor-pointer shadow-md group"
                          title="Mark student exam scripts with AI"
                        >
                          <Sparkles className="w-3.5 h-3.5 text-white group-hover:rotate-12 transition-transform shrink-0" />
                          <span className="whitespace-nowrap font-bold">Mark Students Papers</span>
                          {paper.marked_count > 0 && (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] bg-white/20 text-white font-extrabold whitespace-nowrap shrink-0 shadow-xs">
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
