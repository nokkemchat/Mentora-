import React, { useState, useEffect } from 'react';
import { Search, Filter, Plus, Edit, Trash2, Eye, BarChart2, BookOpen, ChevronDown, ChevronUp, UploadCloud, FileText, ExternalLink, FileCheck, Sparkles, RefreshCw, CheckCircle2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import PaperFormModal from '../components/PaperFormModal';
import BulkUploadModal from '../components/BulkUploadModal';
import PaperViewModal from '../components/PaperViewModal';
import MarkingSchemeModal from '../components/MarkingSchemeModal';
import TeacherBulkMarkingModal from '../components/TeacherBulkMarkingModal';
import { useAuth } from '../context/AuthContext';

export default function Papers() {
  const { user, isAdmin } = useAuth();
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
        const timeoutId = setTimeout(() => controller.abort(), 1000);
        const res = await fetch('http://localhost:3005/process', { method: 'POST', signal: controller.signal });
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
          alert(`Extraction successful! Extracted questions and ${msCount} marking scheme solutions.`);
        } else {
          alert('Extraction started via Supabase Cloud Edge Function!');
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
    
    if (!isAdmin && user) {
      const teacherName = `${user.user_metadata?.first_name || ''} ${user.user_metadata?.last_name || ''}`.trim();
      if (teacherName) {
        const { data: courses } = await supabase.from('courses').select('title').eq('teacher_name', teacherName);
        if (courses && courses.length > 0) {
          const subjects = Array.from(new Set(courses.map(c => c.title)));
          query = query.in('subject', subjects);
        } else {
          setPapers([]);
          setLoading(false);
          return;
        }
      }
    }

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
          supabase.from('marked_student_papers').select('paper_id').in('paper_id', paperIds)
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
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-text">Past Papers</h1>
          <p className="text-textMuted mt-2">Manage the AI Exam Intelligence database</p>
        </div>
        <div className="flex items-center space-x-3">
          <button 
            onClick={() => setShowBulkModal(true)}
            className="flex items-center space-x-2 bg-surface hover:bg-border/50 text-text border border-border px-4 py-2 rounded-2xl font-medium transition-colors cursor-pointer"
          >
            <UploadCloud className="w-5 h-5" />
            <span>Bulk Upload</span>
          </button>
          <button 
            onClick={() => setShowFormModal(true)}
            className="flex items-center space-x-2 bg-primary hover:bg-primaryHover text-white px-4 py-2 rounded-2xl font-medium transition-colors cursor-pointer"
          >
            <Plus className="w-5 h-5" />
            <span>Add Single Paper</span>
          </button>
        </div>
      </div>

      {/* Toolbar */}
      <div className="bg-surface border border-border rounded-3xl p-4 flex flex-wrap gap-4 items-center justify-between">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-textMuted" />
          <input
            type="text"
            placeholder="Search Papers..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-background border border-border rounded-2xl text-text focus:outline-none focus:border-primary transition-colors"
          />
        </div>
        
        <div className="flex gap-4 overflow-x-auto pb-2 sm:pb-0">
          <select 
            className="bg-background border border-border text-text rounded-2xl px-4 py-2 focus:outline-none focus:border-primary cursor-pointer"
            value={curriculumFilter}
            onChange={(e) => setCurriculumFilter(e.target.value)}
          >
            <option value="All">Curriculum: All</option>
            <option value="ZIMSEC">ZIMSEC</option>
            <option value="Cambridge">Cambridge</option>
          </select>
          <select 
            className="bg-background border border-border text-text rounded-2xl px-4 py-2 focus:outline-none focus:border-primary cursor-pointer"
            value={subjectFilter}
            onChange={(e) => setSubjectFilter(e.target.value)}
          >
            <option value="All">Subject: All</option>
            {uniqueSubjects.map(sub => (
              <option key={sub as string} value={sub as string}>{sub as string}</option>
            ))}
          </select>
          <select 
            className="bg-background border border-border text-text rounded-2xl px-4 py-2 focus:outline-none focus:border-primary cursor-pointer"
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

      {/* Papers Table */}
      <div className="bg-surface border border-border rounded-3xl overflow-hidden">
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
                <th className="p-4 font-medium">Student Papers</th>
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
                        <span className="inline-flex items-center px-2.5 py-1 rounded-xl text-xs font-medium bg-[#10b981]/10 text-[#10b981] border border-[#10b981]/20">
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
                            paper.ingestion_jobs[0].status === 'completed' ? 'bg-[#10b981]/10 text-[#10b981] border border-[#10b981]/20' :
                            paper.ingestion_jobs[0].status === 'failed' ? 'bg-error/10 text-error border border-error/20' :
                            'bg-[#f59e0b]/10 text-[#f59e0b] border border-[#f59e0b]/20'
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
                              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-semibold bg-[#10b981]/15 text-[#10b981] border border-[#10b981]/30 hover:bg-[#10b981]/25 transition-all cursor-pointer shadow-sm"
                              title="View Extracted Marking Scheme Rubrics & Worked Solutions"
                            >
                              <FileCheck className="w-3.5 h-3.5" />
                              <span>View Scheme ({paper.solution_count})</span>
                            </button>
                          ) : (
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
                          )}

                          <a 
                            href={paper.mark_scheme_url} 
                            target="_blank" 
                            rel="noreferrer" 
                            className="p-1.5 text-textMuted hover:text-[#10b981] hover:bg-[#10b981]/10 rounded-lg transition-colors"
                            title="Open Original Marking Scheme PDF in new tab"
                          >
                            <ExternalLink className="w-3.5 h-3.5 opacity-70" />
                          </a>

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
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setSelectedPaperForMs(paper)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl text-xs font-medium bg-primary/10 text-primary border border-primary/20 hover:bg-primary/20 transition-colors cursor-pointer"
                          title="Attach or upload marking scheme"
                        >
                          <Plus className="w-3 h-3" />
                          <span>Attach Scheme</span>
                        </button>
                      )}
                    </td>

                    {/* Student Papers / Bulk Marking Column */}
                    <td className="p-4">
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
                        <button 
                          onClick={() => handleDelete(paper.id)}
                          className="flex items-center space-x-1 p-2 text-textMuted hover:text-error hover:bg-error/10 rounded-xl transition-colors cursor-pointer" 
                          title="Delete Paper"
                        >
                          <Trash2 className="w-4 h-4" />
                          <span className="text-sm font-medium">Delete</span>
                        </button>
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
