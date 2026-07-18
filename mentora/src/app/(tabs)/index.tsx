import React from 'react';
import { useAuth } from '@/context/AuthContext';
import StudentDashboard from '@/components/dashboard/StudentDashboard';
import TeacherDashboard from '@/components/dashboard/TeacherDashboard';

export default function HomeTab() {
  const { user } = useAuth();
  
  // Conditionally render the appropriate dashboard based on user role
  if (user?.user_metadata?.role === 'teacher') {
    return <TeacherDashboard />;
  }
  
  // Default to student dashboard
  return <StudentDashboard />;
}
