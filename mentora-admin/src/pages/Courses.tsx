import React, { useState, useEffect } from 'react';
import { Search, Filter, Plus, Edit, Trash2, Eye, BarChart2, UserPlus, BookOpen, ChevronDown, ChevronUp } from 'lucide-react';
import CourseAnalytics from '../components/CourseAnalytics';
import CreateCourseWizard from '../components/CreateCourseWizard';
import { supabase } from '../lib/supabase';

export default function Courses() {
  const [search, setSearch] = useState('');
  const [expandedCourseId, setExpandedCourseId] = useState<string | null>(null);
  const [showWizard, setShowWizard] = useState(false);
  const [courses, setCourses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Filters
  const [boardFilter, setBoardFilter] = useState('All');
  const [categoryFilter, setCategoryFilter] = useState('All');
  const [statusFilter, setStatusFilter] = useState('All');

  const fetchCourses = async () => {
    setLoading(true);
    const { data, error } = await supabase.from('courses').select('*').order('created_at', { ascending: false });
    if (error) {
      console.error('Error fetching courses:', error);
    } else {
      setCourses(data || []);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchCourses();
  }, []);

  const handleDelete = async (id: string) => {
    if (!window.confirm('Are you sure you want to delete this course?')) return;
    
    const { error } = await supabase.from('courses').delete().eq('id', id);
    if (error) {
      console.error('Error deleting course:', error);
      alert('Failed to delete course');
    } else {
      fetchCourses();
    }
  };

  const filteredCourses = courses.filter(course => {
    const searchLower = search.toLowerCase();
    const matchesSearch = (course.title && course.title.toLowerCase().includes(searchLower)) || 
                          (course.syllabus_code && course.syllabus_code.toLowerCase().includes(searchLower));
    
    const matchesBoard = boardFilter === 'All' || course.board === boardFilter;
    const matchesCategory = categoryFilter === 'All' || course.subject_category === categoryFilter;
    const matchesStatus = statusFilter === 'All' || (course.status || 'Published') === statusFilter;
    
    return matchesSearch && matchesBoard && matchesCategory && matchesStatus;
  });

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-text">Course Manager</h1>
          <p className="text-textMuted mt-2">Manage all courses and assignments</p>
        </div>
        <button 
          onClick={() => setShowWizard(true)}
          className="flex items-center space-x-2 bg-primary hover:bg-primary-hover text-white px-4 py-2 rounded-2xl font-medium transition-colors"
        >
          <Plus className="w-5 h-5" />
          <span>Create New Course</span>
        </button>
      </div>

      {/* Toolbar */}
      <div className="bg-surface border border-border rounded-3xl p-4 flex flex-wrap gap-4 items-center justify-between">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-textMuted" />
          <input
            type="text"
            placeholder="Search Courses..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-background border border-border rounded-2xl text-text focus:outline-none focus:border-primary transition-colors"
          />
        </div>
        
        <div className="flex gap-4 overflow-x-auto pb-2 sm:pb-0">
          <select 
            className="bg-background border border-border text-text rounded-2xl px-4 py-2 focus:outline-none focus:border-primary cursor-pointer"
            value={boardFilter}
            onChange={(e) => setBoardFilter(e.target.value)}
          >
            <option value="All">Board: All</option>
            <option value="ZIMSEC">ZIMSEC</option>
            <option value="Cambridge">Cambridge</option>
          </select>
          <select 
            className="bg-background border border-border text-text rounded-2xl px-4 py-2 focus:outline-none focus:border-primary cursor-pointer"
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
          >
            <option value="All">Category: All</option>
            <option value="Sciences">Sciences</option>
            <option value="Arts">Arts</option>
            <option value="Commercials">Commercials</option>
          </select>
          <select 
            className="bg-background border border-border text-text rounded-2xl px-4 py-2 focus:outline-none focus:border-primary cursor-pointer"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="All">Status: All</option>
            <option value="Published">Published</option>
            <option value="Pending">Pending</option>
            <option value="Draft">Draft</option>
          </select>
          <select className="bg-background border border-border text-text rounded-2xl px-4 py-2 focus:outline-none focus:border-primary cursor-pointer">
            <option>Sort By: Most Students</option>
            <option>Newest</option>
            <option>Oldest</option>
          </select>
        </div>
      </div>

      {/* Course Table */}
      <div className="bg-surface border border-border rounded-3xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-background border-b border-border text-textMuted text-sm">
                <th className="p-4 font-medium">Course</th>
                <th className="p-4 font-medium">Category</th>
                <th className="p-4 font-medium">Students</th>
                <th className="p-4 font-medium">Status</th>
                <th className="p-4 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filteredCourses.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-textMuted">
                    No courses found matching your filters.
                  </td>
                </tr>
              ) : (
                filteredCourses.map((course) => (
                  <React.Fragment key={course.id}>
                  <tr className="hover:bg-background transition-colors group">
                    <td className="p-4">
                      <div className="flex items-center space-x-3">
                        <div className={`w-10 h-10 rounded-2xl flex items-center justify-center ${course.color || 'bg-blue-500'}/10 border border-${(course.color || 'bg-blue-500').split('-')[1]}-500/20 shrink-0`}>
                          <BookOpen className={`w-5 h-5 text-${(course.color || 'bg-blue-500').split('-')[1]}-500`} />
                        </div>
                        <div>
                          <span className="font-medium text-text">{course.title}</span>
                          {course.syllabus_code && <span className="text-xs text-textMuted block mt-0.5">Code: {course.syllabus_code}</span>}
                        </div>
                      </div>
                    </td>
                    <td className="p-4 text-textMuted">
                      <span className="block text-text">{course.subject_category || 'N/A'}</span>
                      <span className="text-xs">{course.board} • {course.level}</span>
                    </td>
                    <td className="p-4 text-textMuted">0</td>
                    <td className="p-4">
                      <span className={`px-3 py-1 rounded-full text-xs font-medium border ${
                        (course.status || 'Published') === 'Published' ? 'bg-success/10 text-success border-success/20' : 
                        (course.status || 'Published') === 'Pending' ? 'bg-warning/10 text-warning border-warning/20' : 
                        'bg-textMuted/10 text-textMuted border-textMuted/20'
                      }`}>
                        {course.status || 'Published'}
                      </span>
                    </td>
                    <td className="p-4 text-right">
                      <div className="flex items-center justify-end space-x-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button className="p-2 text-textMuted hover:text-primary hover:bg-primary/10 rounded-2xl transition-colors" title="View">
                          <Eye className="w-4 h-4" />
                        </button>
                        <button className="p-2 text-textMuted hover:text-primary hover:bg-primary/10 rounded-2xl transition-colors" title="Edit">
                          <Edit className="w-4 h-4" />
                        </button>
                        <button 
                          onClick={() => setExpandedCourseId(expandedCourseId === course.id ? null : course.id)}
                          className={`p-2 rounded-2xl transition-colors ${expandedCourseId === course.id ? 'text-primary bg-primary/10' : 'text-textMuted hover:text-primary hover:bg-primary/10'}`} 
                          title="Analytics"
                        >
                          <BarChart2 className="w-4 h-4" />
                        </button>
                        <button 
                          onClick={() => handleDelete(course.id)}
                          className="p-2 text-textMuted hover:text-error hover:bg-error/10 rounded-2xl transition-colors" 
                          title="Delete"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                  
                  {/* Expanded Analytics Row */}
                  {expandedCourseId === course.id && (
                    <tr>
                      <td colSpan={6} className="p-0 border-b border-border">
                        <CourseAnalytics courseId={course.id} courseTitle={course.title} />
                      </td>
                    </tr>
                  )}
                </React.Fragment>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modals */}
      {showWizard && (
        <CreateCourseWizard 
          onClose={() => setShowWizard(false)} 
          onSuccess={() => { setShowWizard(false); fetchCourses(); }}
        />
      )}
    </div>
  );
}
