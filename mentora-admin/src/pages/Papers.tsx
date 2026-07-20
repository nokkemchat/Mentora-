import React, { useState, useEffect } from 'react';
import { Search, Filter, Plus, Edit, Trash2, Eye, BarChart2, BookOpen, ChevronDown, ChevronUp, UploadCloud } from 'lucide-react';
import { supabase } from '../lib/supabase';
import PaperFormModal from '../components/PaperFormModal';
import BulkUploadModal from '../components/BulkUploadModal';

export default function Papers() {
  const [search, setSearch] = useState('');
  const [showFormModal, setShowFormModal] = useState(false);
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [papers, setPapers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Filters
  const [curriculumFilter, setCurriculumFilter] = useState('All');
  const [subjectFilter, setSubjectFilter] = useState('All');
  const [yearFilter, setYearFilter] = useState('All');

  const fetchPapers = async () => {
    setLoading(true);
    const { data, error } = await supabase.from('papers').select('*').order('created_at', { ascending: false });
    if (error) {
      console.error('Error fetching papers:', error);
    } else {
      setPapers(data || []);
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
            className="flex items-center space-x-2 bg-surface hover:bg-border/50 text-text border border-border px-4 py-2 rounded-2xl font-medium transition-colors"
          >
            <UploadCloud className="w-5 h-5" />
            <span>Bulk Upload</span>
          </button>
          <button 
            onClick={() => setShowFormModal(true)}
            className="flex items-center space-x-2 bg-primary hover:bg-primary-hover text-white px-4 py-2 rounded-2xl font-medium transition-colors"
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
                <th className="p-4 font-medium">PDF File</th>
                <th className="p-4 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading ? (
                 <tr>
                 <td colSpan={6} className="p-8 text-center text-textMuted">
                   Loading papers...
                 </td>
               </tr>
              ) : filteredPapers.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-textMuted">
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
                      <span className="block text-text">Paper {paper.paper_number}</span>
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
                      {paper.pdf_url ? (
                        <a href={paper.pdf_url} target="_blank" rel="noreferrer" className="text-primary text-sm hover:underline">
                          View PDF
                        </a>
                      ) : (
                        <span className="text-textMuted text-sm">No PDF</span>
                      )}
                    </td>
                    <td className="p-4 text-right">
                      <div className="flex items-center justify-end space-x-3">
                        <button 
                          onClick={() => alert('Edit Paper functionality coming soon')}
                          className="flex items-center space-x-1 p-2 text-textMuted hover:text-primary hover:bg-primary/10 rounded-xl transition-colors" 
                          title="Edit"
                        >
                          <Edit className="w-4 h-4" />
                          <span className="text-sm font-medium">Edit</span>
                        </button>
                        <button 
                          onClick={() => handleDelete(paper.id)}
                          className="flex items-center space-x-1 p-2 text-textMuted hover:text-error hover:bg-error/10 rounded-xl transition-colors" 
                          title="Delete"
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
    </div>
  );
}
