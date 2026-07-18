import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { CheckCircle, Search, AlertCircle, Clock } from 'lucide-react';

export default function Teachers() {
  const [teachers, setTeachers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    fetchTeachers();
  }, []);

  const fetchTeachers = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('role', 'teacher')
      .order('created_at', { ascending: false });
    
    if (!error && data) {
      setTeachers(data);
    }
    setLoading(false);
  };

  const handleToggleApproval = async (id: string, currentStatus: boolean) => {
    const { error } = await supabase
      .from('profiles')
      .update({ is_approved: !currentStatus })
      .eq('id', id);
    
    if (!error) {
      // Update local state instantly
      setTeachers(prev => prev.map(t => t.id === id ? { ...t, is_approved: !currentStatus } : t));
    } else {
      alert("Error updating teacher: " + error.message);
    }
  };

  const filteredTeachers = teachers.filter(t => 
    (t.first_name?.toLowerCase() || '').includes(search.toLowerCase()) ||
    (t.last_name?.toLowerCase() || '').includes(search.toLowerCase()) ||
    (t.school?.toLowerCase() || '').includes(search.toLowerCase())
  );

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
        <div>
          <h1 className="text-3xl font-bold text-text">Teacher Directory</h1>
          <p className="text-textMuted mt-2">Manage approvals and verify educator credentials.</p>
        </div>
        <div className="relative w-full md:w-64">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <Search className="h-5 w-5 text-textMuted" />
          </div>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="block w-full pl-10 pr-3 py-2 border border-border rounded-2xl bg-surface text-text focus:ring-2 focus:ring-primary focus:border-transparent transition-all"
            placeholder="Search teachers..."
          />
        </div>
      </div>

      <div className="bg-surface border border-border rounded-3xl overflow-hidden ">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-background border-b border-border">
                <th className="px-6 py-4 text-xs font-semibold text-textMuted uppercase tracking-wider">Teacher</th>
                <th className="px-6 py-4 text-xs font-semibold text-textMuted uppercase tracking-wider">School</th>
                <th className="px-6 py-4 text-xs font-semibold text-textMuted uppercase tracking-wider">Subjects</th>
                <th className="px-6 py-4 text-xs font-semibold text-textMuted uppercase tracking-wider">Status</th>
                <th className="px-6 py-4 text-xs font-semibold text-textMuted uppercase tracking-wider text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-textMuted">Loading teachers...</td>
                </tr>
              ) : filteredTeachers.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-textMuted">No teachers found.</td>
                </tr>
              ) : (
                filteredTeachers.map((teacher) => (
                  <tr key={teacher.id} className="hover:bg-background/30 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center">
                        <div className="flex-shrink-0 h-10 w-10 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold">
                          {teacher.first_name?.charAt(0) || '?'}
                        </div>
                        <div className="ml-4">
                          <div className="text-sm font-medium text-text">{teacher.first_name} {teacher.last_name}</div>
                          <div className="text-xs text-textMuted flex items-center gap-2 mt-0.5">
                            <span>{teacher.years_of_experience || 0} yrs experience</span>
                            <span className="w-1 h-1 rounded-full bg-border"></span>
                            <span className={`font-medium ${teacher.employment_type === 'Full-Time Tutor' ? 'text-primary' : 'text-orange-500'}`}>
                              {teacher.employment_type || 'Part-Time Tutor'}
                            </span>
                          </div>
                          <div className="text-xs text-textMuted flex items-center gap-1 mt-1 bg-background inline-block px-2 py-0.5 rounded border border-border">
                            <Clock className="w-3 h-3" />
                            {teacher.availability_schedule || 'Mon-Fri, 14:00 - 18:00'}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-text">
                      {teacher.school || 'N/A'}
                    </td>
                    <td className="px-6 py-4 text-sm text-text">
                      <div className="flex flex-wrap gap-1">
                        {teacher.subjects_taught?.slice(0,2).map((sub: string, i: number) => (
                          <span key={i} className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-surface border border-border">
                            {sub}
                          </span>
                        ))}
                        {teacher.subjects_taught?.length > 2 && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium text-textMuted">
                            +{teacher.subjects_taught.length - 2} more
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {teacher.is_approved ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
                          <CheckCircle className="w-3.5 h-3.5" /> Approved
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-500/10 text-amber-500 border border-amber-500/20">
                          <AlertCircle className="w-3.5 h-3.5" /> Pending
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <button
                        onClick={() => handleToggleApproval(teacher.id, teacher.is_approved)}
                        className={`inline-flex items-center px-3 py-1.5 border border-transparent text-xs font-medium rounded-2xl  text-white ${
                          teacher.is_approved 
                            ? 'bg-error hover:bg-error/90' 
                            : 'bg-success hover:bg-success/90'
                        } focus:outline-none`}
                      >
                        {teacher.is_approved ? 'Revoke' : 'Approve'}
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
