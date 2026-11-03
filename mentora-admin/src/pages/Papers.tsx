import React, { useState, useEffect } from 'react';
import { Search, Filter, Plus, Edit, Trash2, Eye, BarChart2, BookOpen, ChevronDown, ChevronUp, UploadCloud, FileText, ExternalLink, FileCheck, Sparkles, RefreshCw, CheckCircle2, GraduationCap, Calendar, ArrowUpDown, SlidersHorizontal, LayoutGrid, List, X as CloseIcon } from 'lucide-react';
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
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <h1 className="text-xl sm:text-2xl font-bold text-text tracking-tight">
            Past Papers
          </h1>
          <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-surface border border-border text-textMuted">
            {filteredPapers.length}
          </span>
        </div>

        <div className="flex items-center gap-2 self-end sm:self-auto flex-wrap">
          {/* View Mode Toggle: Grid Cards vs Table */}
          <div className="flex items-center bg-surface/80 border border-border rounded-2xl p-1 gap-1 shadow-xs">
            <button
              type="button"
              onClick={() => setViewMode('grid')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                viewMode === 'grid'
                  ? 'btn-3d-primary'
                  : 'text-textMuted hover:text-text'
              }`}
              title="Card Grid View"
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              <span>Cards</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('table')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                viewMode === 'table'
                  ? 'btn-3d-primary'
                  : 'text-textMuted hover:text-text'
              }`}
              title="Table View"
            >
              <List className="w-3.5 h-3.5" />
              <span>Table</span>
            </button>
          </div>

          {!isStudent && (
            <>
              <button 
                onClick={() => setShowBulkModal(true)}
                className="btn-3d-glass flex items-center gap-2 px-3.5 py-2 rounded-2xl text-xs font-semibold text-text cursor-pointer"
              >
                <UploadCloud className="w-3.5 h-3.5 text-primary" />
                <span className="hidden sm:inline">Bulk Upload</span>
              </button>
              <button 
                onClick={() => setShowFormModal(true)}
                className="btn-3d-primary flex items-center gap-2 px-3.5 py-2 rounded-2xl text-xs font-bold cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Paper</span>
              </button>
            </>
          )}
        </div>
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

      {/* Main Papers Content: Grid Cards (default) or Streamlined Table */}
      {loading ? (
        <div className="liquid-glass rounded-3xl p-12 text-center text-textMuted text-sm border border-border/80 flex flex-col items-center justify-center gap-3">
          <RefreshCw className="w-8 h-8 text-primary animate-spin" />
          <p className="font-semibold text-text">Loading question papers...</p>
        </div>
      ) : filteredPapers.length === 0 ? (
        <div className="liquid-glass rounded-3xl p-12 text-center text-textMuted text-sm space-y-3 border border-border/80 flex flex-col items-center justify-center">
          <div className="w-14 h-14 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shadow-inner">
            <BookOpen className="w-7 h-7" />
          </div>
          <div>
            <p className="font-bold text-text text-base">No examination papers found</p>
            <p className="text-xs text-textMuted mt-1">Try adjusting your search keywords, exam year, or board filters.</p>
          </div>
          {hasActiveFilters && (
            <button
              onClick={resetFilters}
              className="btn-3d-glass px-4 py-2 rounded-xl text-xs font-semibold text-primary cursor-pointer mt-2"
            >
              Clear All Filters
            </button>
          )}
        </div>
      ) : viewMode === 'grid' ? (
        /* ========================================================================= */
        /* RESPONSIVE GRID CARDS VIEW (Orderly, Beautiful, Zero Overlap)             */
        /* ========================================================================= */
        <div className="space-y-6">
          {groupedPapers.map((group) => (
            <div key={group.title} className="space-y-3.5">
              {/* Group Header */}
              {groupBy !== 'none' && (
                <div className="flex items-center justify-between px-2 pt-1">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-base sm:text-lg text-text flex items-center gap-2">
                      {groupBy === 'year' ? (
                        <Calendar className="w-4 h-4 text-primary" />
                      ) : (
                        <BookOpen className="w-4 h-4 text-primary" />
                      )}
                      <span>{group.title}</span>
                    </span>
                    <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-primary/15 text-primary border border-primary/30">
                      {group.count}
                    </span>
                  </div>
                  {group.subtitle && (
                    <span className="text-xs text-textMuted font-medium">{group.subtitle}</span>
                  )}
                </div>
              )}

              {/* Orderly Responsive Cards Grid: 1 col on mobile, 2 cols on tablet/laptop, 3 cols on desktop */}
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {group.items.map((paper) => (
                  <div
                    key={paper.id}
                    className="liquid-glass rounded-3xl p-5 flex flex-col justify-between gap-4 shadow-md transition-all duration-200 group"
                  >
                    {/* Top Row: Subject Title, Icon & Year/Session Badge */}
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3 min-w-0">
                        <div className="w-11 h-11 rounded-2xl flex items-center justify-center liquid-glass-well border border-white/50 dark:border-white/20 text-primary shrink-0 shadow-inner group-hover:scale-105 transition-transform">
                          <BookOpen className="w-5 h-5" />
                        </div>
                        <div className="min-w-0">
                          <h3 className="font-bold text-text text-base leading-snug truncate" title={paper.subject}>
                            {paper.subject}
                          </h3>
                          {/* Board, Grade Level & Paper Number */}
                          <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                            <span className={`px-2 py-0.5 rounded-md text-[11px] font-bold ${
                              paper.curriculum === 'Cambridge' 
                                ? 'bg-blue-500/10 text-blue-500 border border-blue-500/25' 
                                : 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/25'
                            }`}>
                              {paper.curriculum}
                            </span>
                            <span className="px-2 py-0.5 rounded-md text-[11px] font-medium bg-surface/80 border border-border text-textMuted">
                              {paper.grade_level || 'O-Level'}
                            </span>
                            <span className="px-2 py-0.5 rounded-md text-[11px] font-semibold bg-primary/10 text-primary border border-primary/20">
                              Paper {paper.paper_number}{paper.variant ? ` (Var ${paper.variant})` : ''}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Year & Session Badge */}
                      <div className="shrink-0 text-right">
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl text-xs font-bold liquid-glass-well border border-white/40 dark:border-white/15 text-text shadow-xs">
                          <Calendar className="w-3 h-3 text-textMuted" />
                          <span>{paper.year}</span>
                          {paper.session && <span className="text-textMuted text-[10px]">({paper.session})</span>}
                        </span>
                      </div>
                    </div>

                    {/* Information Strip: Orderly 2-Column Mini Box */}
                    <div className="liquid-glass-well rounded-2xl p-3 border border-white/40 dark:border-white/15 grid grid-cols-2 gap-2 text-xs">
                      {/* Questions count */}
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center text-primary shrink-0">
                          <FileText className="w-3.5 h-3.5" />
                        </div>
                        <div className="min-w-0">
                          <span className="text-[10px] text-textMuted block font-medium">Questions</span>
                          <span className="font-semibold text-text truncate block text-xs">
                            {paper.question_count > 0 ? `${paper.question_count} Extracted` : 'Pending'}
                          </span>
                        </div>
                      </div>

                      {/* Marking scheme status */}
                      <div className="flex items-center gap-2 min-w-0">
                        <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
                          paper.solution_count > 0 ? 'bg-success/15 text-success' : paper.mark_scheme_url ? 'bg-blue-500/10 text-blue-400' : 'bg-amber-500/10 text-amber-500'
                        }`}>
                          <FileCheck className="w-3.5 h-3.5" />
                        </div>
                        <div className="min-w-0">
                          <span className="text-[10px] text-textMuted block font-medium">Mark Scheme</span>
                          <span className="font-semibold text-text truncate block text-xs">
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
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-[11px] font-semibold text-primary bg-primary/5 hover:bg-primary/10 border border-primary/20 transition-colors"
                            title="Open Question Paper PDF"
                          >
                            <FileText className="w-3 h-3" />
                            <span>Paper PDF</span>
                            <ExternalLink className="w-2.5 h-2.5 opacity-60" />
                          </a>
                        )}
                        {paper.mark_scheme_url && (
                          <a
                            href={paper.mark_scheme_url}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-500/5 hover:bg-emerald-500/10 border border-emerald-500/20 transition-colors"
                            title="Open Official Mark Scheme PDF"
                          >
                            <FileCheck className="w-3 h-3" />
                            <span>Scheme PDF</span>
                            <ExternalLink className="w-2.5 h-2.5 opacity-60" />
                          </a>
                        )}
                      </div>
                    )}

                    {/* Action Buttons Area: No overlapping elements! */}
                    <div className="pt-3 border-t border-border/60 flex flex-col gap-2.5">
                      {/* Primary 3D Marking Button */}
                      <button
                        type="button"
                        onClick={() => setSelectedPaperForMarking(paper)}
                        className="btn-3d-primary w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-2xl text-xs font-bold cursor-pointer"
                      >
                        <Sparkles className="w-4 h-4 shrink-0" />
                        <span className="truncate">{isStudent ? 'Mark My Paper with AI' : 'Mark Students Papers'}</span>
                        {paper.marked_count > 0 && (
                          <span className="ml-1 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] bg-white/25 text-white font-extrabold shrink-0 shadow-inner">
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
                          className="btn-3d-glass flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl text-xs font-semibold text-text cursor-pointer truncate"
                          title="View Questions & Booklets"
                        >
                          <Eye className="w-3.5 h-3.5 shrink-0 text-textMuted" />
                          <span className="truncate">Questions</span>
                        </button>

                        {paper.solution_count > 0 ? (
                          <button
                            type="button"
                            onClick={() => {
                              setViewingPaperId(paper.id);
                              setInitialModalTab('scheme');
                            }}
                            className="btn-3d-glass flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl text-xs font-semibold text-success cursor-pointer truncate"
                            title="View Official Worked Solutions"
                          >
                            <FileCheck className="w-3.5 h-3.5 shrink-0 text-success" />
                            <span className="truncate">Scheme ({paper.solution_count})</span>
                          </button>
                        ) : !isStudent ? (
                          <button
                            type="button"
                            onClick={() => setSelectedPaperForMs(paper)}
                            className="btn-3d-glass flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl text-xs font-semibold text-primary cursor-pointer truncate"
                            title="Attach Official Marking Scheme"
                          >
                            <Plus className="w-3.5 h-3.5 shrink-0 text-primary" />
                            <span className="truncate">Attach Scheme</span>
                          </button>
                        ) : (
                          <div className="flex items-center justify-center text-[11px] text-textMuted italic bg-background/30 rounded-xl border border-border/40 py-2 px-3">
                            No Scheme
                          </div>
                        )}
                      </div>

                      {/* Admin/Teacher Extra Options: Extract & Delete in a clean footer */}
                      {!isStudent && (
                        <div className="flex items-center justify-between pt-1 text-xs text-textMuted">
                          {(!paper.ingestion_jobs || paper.ingestion_jobs[0]?.status !== 'completed') ? (
                            <button
                              type="button"
                              onClick={() => handleExtractPaper(paper.id)}
                              disabled={extractingPaperId === paper.id}
                              className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline cursor-pointer disabled:opacity-50"
                            >
                              <RefreshCw className={`w-3 h-3 ${extractingPaperId === paper.id ? 'animate-spin' : ''}`} />
                              <span>{extractingPaperId === paper.id ? 'Extracting...' : 'Extract Content'}</span>
                            </button>
                          ) : (
                            <span className="text-[11px] text-success flex items-center gap-1 font-medium">
                              <CheckCircle2 className="w-3 h-3" />
                              <span>Ingested</span>
                            </span>
                          )}

                          <button
                            onClick={() => handleDelete(paper.id)}
                            className="p-1 text-textMuted hover:text-error hover:bg-error/10 rounded-lg transition-colors cursor-pointer"
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
        /* STREAMLINED TABLE VIEW (Spacious, No Column Crowding)                     */
        /* ========================================================================= */
        <div className="liquid-glass rounded-3xl overflow-hidden shadow-xl border border-border/80">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[850px]">
              <thead>
                <tr className="bg-surface-sunken/60 border-b border-border text-textMuted text-xs font-semibold uppercase tracking-wider">
                  <th className="p-4 font-medium min-w-[220px]">Paper & Subject</th>
                  <th className="p-4 font-medium min-w-[120px]">Year & Session</th>
                  <th className="p-4 font-medium min-w-[130px]">Content Status</th>
                  <th className="p-4 font-medium min-w-[130px]">Documents</th>
                  <th className="p-4 font-medium min-w-[150px]">Mark Scheme</th>
                  <th className="p-4 font-medium min-w-[190px]">{isStudent ? 'AI Marking' : 'Student Papers'}</th>
                  <th className="p-4 font-medium text-right min-w-[100px]">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {filteredPapers.map((paper) => (
                  <tr key={paper.id} className="hover:bg-background/40 transition-colors group">
                    {/* Paper & Subject */}
                    <td className="p-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-2xl flex items-center justify-center bg-primary/10 border border-primary/20 shrink-0 text-primary">
                          <BookOpen className="w-5 h-5" />
                        </div>
                        <div className="min-w-0">
                          <span className="font-bold text-text text-sm block truncate">{paper.subject}</span>
                          <div className="flex items-center gap-1.5 mt-0.5 text-xs text-textMuted">
                            <span className="font-semibold text-primary">{paper.curriculum}</span>
                            <span>•</span>
                            <span>Paper {paper.paper_number}</span>
                            {paper.variant && <span>(Var {paper.variant})</span>}
                          </div>
                        </div>
                      </div>
                    </td>

                    {/* Year & Session */}
                    <td className="p-4 text-xs">
                      <span className="block font-bold text-text">{paper.year}</span>
                      <span className="text-textMuted">{paper.session || 'Main'}</span>
                    </td>

                    {/* Content Status */}
                    <td className="p-4">
                      <div className="flex flex-col gap-1">
                        {paper.question_count > 0 ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-lg text-xs font-semibold bg-primary/10 text-primary border border-primary/20 w-fit">
                            {paper.question_count} Questions
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-lg text-xs font-semibold bg-amber-500/10 text-amber-500 border border-amber-500/20 w-fit">
                            Pending
                          </span>
                        )}
                        {!isStudent && (!paper.ingestion_jobs || paper.ingestion_jobs[0]?.status !== 'completed') && (
                          <button
                            type="button"
                            onClick={() => handleExtractPaper(paper.id)}
                            disabled={extractingPaperId === paper.id}
                            className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline cursor-pointer disabled:opacity-50"
                          >
                            <RefreshCw className={`w-3 h-3 ${extractingPaperId === paper.id ? 'animate-spin' : ''}`} />
                            <span>Extract</span>
                          </button>
                        )}
                      </div>
                    </td>

                    {/* Documents */}
                    <td className="p-4 text-xs">
                      <div className="flex flex-col gap-1">
                        {paper.pdf_url ? (
                          <a href={paper.pdf_url} target="_blank" rel="noreferrer" className="text-primary hover:underline inline-flex items-center gap-1 font-medium">
                            <FileText className="w-3 h-3" />
                            <span>Exam PDF</span>
                            <ExternalLink className="w-2.5 h-2.5 opacity-60" />
                          </a>
                        ) : (
                          <span className="text-textMuted italic">No Paper PDF</span>
                        )}
                        {paper.mark_scheme_url && (
                          <a href={paper.mark_scheme_url} target="_blank" rel="noreferrer" className="text-emerald-500 hover:underline inline-flex items-center gap-1 font-medium">
                            <FileCheck className="w-3 h-3" />
                            <span>Scheme PDF</span>
                            <ExternalLink className="w-2.5 h-2.5 opacity-60" />
                          </a>
                        )}
                      </div>
                    </td>

                    {/* Mark Scheme */}
                    <td className="p-4">
                      {paper.solution_count > 0 ? (
                        <button
                          type="button"
                          onClick={() => {
                            setViewingPaperId(paper.id);
                            setInitialModalTab('scheme');
                          }}
                          className="btn-3d-glass inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-success cursor-pointer"
                        >
                          <FileCheck className="w-3.5 h-3.5" />
                          <span>Scheme ({paper.solution_count})</span>
                        </button>
                      ) : !isStudent ? (
                        <button
                          type="button"
                          onClick={() => setSelectedPaperForMs(paper)}
                          className="btn-3d-glass inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-primary cursor-pointer"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span>Attach Scheme</span>
                        </button>
                      ) : (
                        <span className="text-xs text-textMuted italic">No Scheme</span>
                      )}
                    </td>

                    {/* AI Marking */}
                    <td className="p-4">
                      <button
                        type="button"
                        onClick={() => setSelectedPaperForMarking(paper)}
                        className="btn-3d-primary inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold cursor-pointer"
                      >
                        <Sparkles className="w-3.5 h-3.5" />
                        <span>{isStudent ? 'Mark My Paper' : 'Mark Paper'}</span>
                        {paper.marked_count > 0 && (
                          <span className="ml-1 inline-flex items-center px-2 py-0.5 rounded-full text-[10px] bg-white/20 text-white font-extrabold">
                            {paper.marked_count}
                          </span>
                        )}
                      </button>
                    </td>

                    {/* Actions */}
                    <td className="p-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button 
                          onClick={() => {
                            setViewingPaperId(paper.id);
                            setInitialModalTab('questions');
                          }}
                          className="p-2 text-textMuted hover:text-primary hover:bg-primary/10 rounded-xl transition-colors cursor-pointer" 
                          title="View Paper Details & Booklets"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        {!isStudent && (
                          <button 
                            onClick={() => handleDelete(paper.id)}
                            className="p-2 text-textMuted hover:text-error hover:bg-error/10 rounded-xl transition-colors cursor-pointer" 
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
