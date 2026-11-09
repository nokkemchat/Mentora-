import React from 'react';
import { useAuth } from '@/context/AuthContext';
import StudentDashboard from '@/components/dashboard/StudentDashboard';
import TeacherDashboard from '@/components/dashboard/TeacherDashboard';
import PastPapersScreen from '@/app/papers/index';

// V1 focuses exclusively on the Question Papers screen for both Students and Teachers.
// Flip to `true` in V2 to restore the Overview / Explore Courses dashboards.
const ENABLE_V2_DASHBOARD_SCREENS = false;

export default function HomeTab() {
  const { user } = useAuth();

  if (!ENABLE_V2_DASHBOARD_SCREENS) {
    return <PastPapersScreen />;
  }
  
  if (user?.user_metadata?.role === 'teacher') {
    return <TeacherDashboard />;
  }
  
  return <StudentDashboard />;
}
