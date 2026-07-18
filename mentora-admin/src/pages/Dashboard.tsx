import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Users, BookOpen, Clock, TrendingUp } from 'lucide-react';
import PendingApproval from '../components/PendingApproval';

export default function Dashboard() {
  const [stats, setStats] = useState({
    totalStudents: 0,
    totalTeachers: 0,
    pendingTeachers: 0,
    totalCourses: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchStats();
  }, []);

  const fetchStats = async () => {
    setLoading(true);
    try {
      // Very naive counting for MVP. In production, use RPCs.
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
      });
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  };

  const statCards = [
    { label: 'Total Students', value: stats.totalStudents, icon: Users, color: 'text-blue-500', bg: 'bg-blue-500/10' },
    { label: 'Total Teachers', value: stats.totalTeachers, icon: BookOpen, color: 'text-purple-500', bg: 'bg-purple-500/10' },
    { label: 'Pending Approvals', value: stats.pendingTeachers, icon: Clock, color: 'text-amber-500', bg: 'bg-amber-500/10' },
    { label: 'Active Courses', value: stats.totalCourses, icon: TrendingUp, color: 'text-emerald-500', bg: 'bg-emerald-500/10' },
  ];

  if (loading) return <div>Loading dashboard...</div>;

  return (
    <div className="max-w-6xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-text">Overview</h1>
        <p className="text-textMuted mt-2">Welcome back to your Admin Console.</p>
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
      <div className="grid grid-cols-1 gap-6">
        <div className="h-[500px]">
          <PendingApproval />
        </div>
      </div>
    </div>
  );
}
