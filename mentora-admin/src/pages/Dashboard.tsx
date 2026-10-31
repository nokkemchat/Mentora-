import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Users, BookOpen, Clock, TrendingUp, GraduationCap, FileText, CheckCircle2, ArrowRight, Sparkles } from 'lucide-react';
import { Link } from 'react-router-dom';
import PendingApproval from '../components/PendingApproval';
import { useAuth } from '../context/AuthContext';

export default function Dashboard() {
  const { user, isAdmin, isTeacher, isStudent } = useAuth();
  const [stats, setStats] = useState({
    totalStudents: 0,
    totalTeachers: 0,
    pendingTeachers: 0,
    totalCourses: 0,
    totalPapers: 0,
    papersWithScheme: 0,
  });
  const [loading, setLoading] = useState(true);
  const [extractedQuestions, setExtractedQuestions] = useState<any[]>([]);

  useEffect(() => {
    fetchStats();
    if (isAdmin) {
      fetchExtractedQuestions();
    }
  }, [isAdmin, isStudent, isTeacher, user]);

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
        const [{ count: studentsCount }, { count: teachersCount }, { count: pendingCount }, { count: coursesCount }, { count: papersCount }] = await Promise.all([
          supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('role', 'student'),
          supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('role', 'teacher'),
          supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('role', 'teacher').eq('is_approved', false),
          supabase.from('courses').select('*', { count: 'exact', head: true }),
          supabase.from('papers').select('*', { count: 'exact', head: true }),
        ]);

        setStats({
          totalStudents: studentsCount || 0,
          totalTeachers: teachersCount || 0,
          pendingTeachers: pendingCount || 0,
          totalCourses: coursesCount || 0,
          totalPapers: papersCount || 0,
          papersWithScheme: 0,
        });
      } else if (isStudent) {
        // Student stats: Public papers and marking schemes
        const [{ count: papersCount }, { count: schemesCount }, { count: coursesCount }] = await Promise.all([
          supabase.from('papers').select('*', { count: 'exact', head: true }),
          supabase.from('papers').select('*', { count: 'exact', head: true }).not('mark_scheme_url', 'is', null),
          supabase.from('courses').select('*', { count: 'exact', head: true }),
        ]);

        setStats({
          totalStudents: 0,
          totalTeachers: 0,
          pendingTeachers: 0,
          totalCourses: coursesCount || 0,
          totalPapers: papersCount || 0,
          papersWithScheme: schemesCount || 0,
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
          papersWithScheme: 0,
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
  ] : isStudent ? [
    { label: 'Past Exam Papers', value: stats.totalPapers, icon: FileText, color: 'text-blue-500', bg: 'bg-blue-500/10' },
    { label: 'Marking Schemes', value: stats.papersWithScheme, icon: CheckCircle2, color: 'text-emerald-500', bg: 'bg-emerald-500/10' },
    { label: 'Available Courses', value: stats.totalCourses, icon: BookOpen, color: 'text-purple-500', bg: 'bg-purple-500/10' },
  ] : [
    { label: 'My Courses', value: stats.totalCourses, icon: BookOpen, color: 'text-blue-500', bg: 'bg-blue-500/10' },
    { label: 'My Papers', value: stats.totalPapers, icon: TrendingUp, color: 'text-purple-500', bg: 'bg-purple-500/10' },
  ];

  if (loading) return <div>Loading dashboard...</div>;

  return (
    <div className="max-w-6xl mx-auto space-y-6 sm:space-y-8">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold text-text tracking-tight">Overview</h1>
        <p className="text-sm sm:text-base text-textMuted mt-1">
          {isAdmin 
            ? 'Welcome to the Mentora Admin Console.' 
            : isStudent 
            ? 'Welcome to your Mentora Learning & Exam Practice Hub.' 
            : 'Welcome to your Educator Dashboard.'}
        </p>
      </div>

      {/* Student Highlight Banner */}
      {isStudent && (
        <div className="p-4 sm:p-6 rounded-3xl bg-gradient-to-r from-primary/15 via-primary/5 to-transparent border border-primary/20 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5 sm:gap-4">
            <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-2xl bg-primary text-white flex items-center justify-center shadow-lg shadow-primary/30 shrink-0">
              <GraduationCap className="w-5 h-5 sm:w-6 sm:h-6" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-text">Practice Past Papers & Mark with AI</h2>
              <p className="text-xs sm:text-sm text-textMuted mt-0.5">
                Review questions, upload your handwritten working, and get graded instantly by the AI Senior Examiner with red-ink marks.
              </p>
            </div>
          </div>
          <Link
            to="/papers"
            className="w-full sm:w-auto flex items-center justify-center gap-2 px-5 py-2.5 rounded-2xl bg-primary hover:bg-primaryHover text-white text-sm font-semibold transition-colors shadow-md shadow-primary/20 shrink-0"
          >
            <Sparkles className="w-4 h-4" />
            <span>Mark My Past Papers</span>
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      )}

      {/* Desktop Stat Cards (Hidden on mobile to keep the interface focused on core features) */}
      <div className="hidden md:grid md:grid-cols-2 lg:grid-cols-4 gap-6">
        {statCards.map((stat, i) => {
          const Icon = stat.icon;
          return (
            <div key={i} className="bg-surface border border-border rounded-3xl p-6 hover:border-border/80 transition-colors shadow-sm">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs sm:text-sm font-medium text-textMuted mb-1">{stat.label}</p>
                  <h3 className="text-2xl sm:text-3xl font-bold text-text">{stat.value}</h3>
                </div>
                <div className={`p-3 rounded-2xl ${stat.bg}`}>
                  <Icon className={`w-6 h-6 ${stat.color}`} />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Mobile Streamlined Feature Actions (Focuses students and teachers directly on core tasks) */}
      <div className="md:hidden space-y-3">
        <div className="text-xs font-bold text-textMuted uppercase tracking-wider px-1">
          {isStudent ? 'Start Learning & Practicing' : 'Core Features'}
        </div>

        {isStudent ? (
          <>
            <Link
              to="/papers"
              className="flex items-center gap-3.5 p-4 rounded-3xl bg-surface border border-border hover:border-primary/40 transition-all shadow-sm active:scale-[0.98]"
            >
              <div className="w-12 h-12 rounded-2xl bg-primary text-white flex items-center justify-center shrink-0 shadow-md shadow-primary/20">
                <Sparkles className="w-6 h-6" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-bold text-base text-text leading-tight">Mark My Past Paper</h3>
                <p className="text-xs text-textMuted mt-0.5 truncate">
                  Upload handwritten answers for instant AI grading
                </p>
              </div>
              <ArrowRight className="w-5 h-5 text-textMuted shrink-0" />
            </Link>

            <Link
              to="/papers"
              className="flex items-center gap-3.5 p-4 rounded-3xl bg-surface border border-border hover:border-primary/40 transition-all shadow-sm active:scale-[0.98]"
            >
              <div className="w-12 h-12 rounded-2xl bg-blue-500/10 text-blue-500 flex items-center justify-center shrink-0">
                <FileText className="w-6 h-6" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-bold text-base text-text leading-tight">Past Exam Papers</h3>
                <p className="text-xs text-textMuted mt-0.5 truncate">
                  Explore official ZIMSEC & Cambridge question papers
                </p>
              </div>
              <ArrowRight className="w-5 h-5 text-textMuted shrink-0" />
            </Link>

            <Link
              to="/papers"
              className="flex items-center gap-3.5 p-4 rounded-3xl bg-surface border border-border hover:border-primary/40 transition-all shadow-sm active:scale-[0.98]"
            >
              <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 text-emerald-500 flex items-center justify-center shrink-0">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-bold text-base text-text leading-tight">Marking Schemes</h3>
                <p className="text-xs text-textMuted mt-0.5 truncate">
                  Step-by-step teacher worked solutions & rubrics
                </p>
              </div>
              <ArrowRight className="w-5 h-5 text-textMuted shrink-0" />
            </Link>
          </>
        ) : (
          <>
            <Link
              to="/papers"
              className="flex items-center gap-3.5 p-4 rounded-3xl bg-surface border border-border hover:border-primary/40 transition-all shadow-sm active:scale-[0.98]"
            >
              <div className="w-12 h-12 rounded-2xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
                <Sparkles className="w-6 h-6" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-bold text-base text-text leading-tight">Grade Student Scripts</h3>
                <p className="text-xs text-textMuted mt-0.5 truncate">
                  AI Senior Examiner marking with red-ink annotations
                </p>
              </div>
              <ArrowRight className="w-5 h-5 text-textMuted shrink-0" />
            </Link>

            <Link
              to="/papers"
              className="flex items-center gap-3.5 p-4 rounded-3xl bg-surface border border-border hover:border-primary/40 transition-all shadow-sm active:scale-[0.98]"
            >
              <div className="w-12 h-12 rounded-2xl bg-purple-500/10 text-purple-500 flex items-center justify-center shrink-0">
                <FileText className="w-6 h-6" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-bold text-base text-text leading-tight">Upload Exam Papers</h3>
                <p className="text-xs text-textMuted mt-0.5 truncate">
                  Ingest PDFs with automatic diagram & question extraction
                </p>
              </div>
              <ArrowRight className="w-5 h-5 text-textMuted shrink-0" />
            </Link>

            <Link
              to="/courses"
              className="flex items-center gap-3.5 p-4 rounded-3xl bg-surface border border-border hover:border-primary/40 transition-all shadow-sm active:scale-[0.98]"
            >
              <div className="w-12 h-12 rounded-2xl bg-blue-500/10 text-blue-500 flex items-center justify-center shrink-0">
                <BookOpen className="w-6 h-6" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-bold text-base text-text leading-tight">My Courses</h3>
                <p className="text-xs text-textMuted mt-0.5 truncate">
                  Manage course syllabus and assignments
                </p>
              </div>
              <ArrowRight className="w-5 h-5 text-textMuted shrink-0" />
            </Link>
          </>
        )}
      </div>
      
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
