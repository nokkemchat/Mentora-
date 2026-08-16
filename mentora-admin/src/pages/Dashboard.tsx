import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Users, BookOpen, Clock, TrendingUp } from 'lucide-react';
import PendingApproval from '../components/PendingApproval';
import { useAuth } from '../context/AuthContext';

export default function Dashboard() {
  const { user, isAdmin } = useAuth();
  const [stats, setStats] = useState({
    totalStudents: 0,
    totalTeachers: 0,
    pendingTeachers: 0,
    totalCourses: 0,
    totalPapers: 0,
  });
  const [loading, setLoading] = useState(true);
  const [extractedQuestions, setExtractedQuestions] = useState<any[]>([]);

  useEffect(() => {
    fetchStats();
    if (isAdmin) {
      fetchExtractedQuestions();
    }
  }, [isAdmin, user]);

  const fetchExtractedQuestions = async () => {
    const { data, error } = await supabase
      .from('past_paper_questions')
      .select('*, papers(subject, year, paper_number)')
      .order('created_at', { ascending: false })
      .limit(10);
    
    if (data && !error) {
      setExtractedQuestions(data);
    }
  };

  const fetchStats = async () => {
    setLoading(true);
    try {
      if (isAdmin) {
        // Global admin stats
        const [{ count: studentsCount }, { count: teachersCount }, { count: pendingCount }, { count: coursesCount }] = await Promise.all([
          supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('role', 'student'),
          supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('role', 'teacher'),
          supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('role', 'teacher').eq('is_approved', false),
          supabase.from('courses').select('*', { count: 'exact', head: true }),
        ]);

        setStats({
          totalStudents: studentsCount || 0,
          totalTeachers: teachersCount || 0,
          pendingTeachers: pendingCount || 0,
          totalCourses: coursesCount || 0,
          totalPapers: 0,
        });
      } else {
        // Teacher specific stats
        const teacherName = user ? `${user.user_metadata?.first_name || ''} ${user.user_metadata?.last_name || ''}`.trim() : '';
        let myCoursesCount = 0;
        let myPapersCount = 0;

        if (teacherName) {
          const { data: courses } = await supabase.from('courses').select('title').eq('teacher_name', teacherName);
          myCoursesCount = courses?.length || 0;

          if (courses && courses.length > 0) {
            const subjects = Array.from(new Set(courses.map(c => c.title)));
            const { count } = await supabase.from('papers').select('*', { count: 'exact', head: true }).in('subject', subjects);
            myPapersCount = count || 0;
          }
        }

        setStats({
          totalStudents: 0,
          totalTeachers: 0,
          pendingTeachers: 0,
          totalCourses: myCoursesCount,
          totalPapers: myPapersCount,
        });
      }
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  };

  const statCards = isAdmin ? [
    { label: 'Total Students', value: stats.totalStudents, icon: Users, color: 'text-blue-500', bg: 'bg-blue-500/10' },
    { label: 'Total Teachers', value: stats.totalTeachers, icon: BookOpen, color: 'text-purple-500', bg: 'bg-purple-500/10' },
    { label: 'Pending Approvals', value: stats.pendingTeachers, icon: Clock, color: 'text-amber-500', bg: 'bg-amber-500/10' },
    { label: 'Active Courses', value: stats.totalCourses, icon: TrendingUp, color: 'text-emerald-500', bg: 'bg-emerald-500/10' },
  ] : [
    { label: 'My Courses', value: stats.totalCourses, icon: BookOpen, color: 'text-blue-500', bg: 'bg-blue-500/10' },
    { label: 'My Papers', value: stats.totalPapers, icon: TrendingUp, color: 'text-purple-500', bg: 'bg-purple-500/10' },
  ];

  if (loading) return <div>Loading dashboard...</div>;

  return (
    <div className="max-w-6xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-text">Overview</h1>
        <p className="text-textMuted mt-2">Welcome back to your {isAdmin ? 'Admin' : 'Teacher'} Console.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        {statCards.map((stat, i) => {
          const Icon = stat.icon;
          return (
            <div key={i} className="bg-surface border border-border rounded-3xl p-6  hover:border-border/80 transition-colors">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm font-medium text-textMuted mb-1">{stat.label}</p>
                  <h3 className="text-3xl font-bold text-text">{stat.value}</h3>
                </div>
                <div className={`p-3 rounded-2xl ${stat.bg}`}>
                  <Icon className={`w-6 h-6 ${stat.color}`} />
                </div>
              </div>
            </div>
          );
        })}
      </div>
      
      {/* Additional dashboard widgets can go here */}
      {isAdmin && (
        <div className="grid grid-cols-1 gap-6">
          <div className="h-[500px]">
            <PendingApproval />
          </div>
          
          {/* DEVELOPMENT ONLY: Extracted Content Table */}
          <div className="bg-surface border border-border rounded-3xl p-6 mt-6">
            <h2 className="text-xl font-bold text-text mb-4">Development Only: Extracted Questions</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-background border-b border-border text-textMuted text-sm">
                    <th className="p-4 font-medium">Paper</th>
                    <th className="p-4 font-medium">Q. No</th>
                    <th className="p-4 font-medium">Content Preview</th>
                    <th className="p-4 font-medium">Topic</th>
                    <th className="p-4 font-medium">Difficulty</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {extractedQuestions.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="p-8 text-center text-textMuted">
                        No questions extracted yet.
                      </td>
                    </tr>
                  ) : (
                    extractedQuestions.map((q) => (
                      <tr key={q.id} className="hover:bg-background transition-colors">
                        <td className="p-4 text-sm text-text">
                          {q.papers?.subject} {q.papers?.year} P{q.papers?.paper_number}
                        </td>
                        <td className="p-4 text-sm font-medium text-text">
                          {q.question_number}
                        </td>
                        <td className="p-4 text-sm text-textMuted max-w-xs truncate">
                          {q.content_text}
                        </td>
                        <td className="p-4 text-sm text-text">
                          {q.topic || '-'}
                        </td>
                        <td className="p-4 text-sm text-text">
                          {q.difficulty || '-'}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
