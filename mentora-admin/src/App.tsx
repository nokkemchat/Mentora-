import React from 'react';
import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import Layout from './components/Layout';

// Pages
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Teachers from './pages/Teachers';
import Courses from './pages/Courses';
import Subscriptions from './pages/Subscriptions';
import Moderation from './pages/Moderation';
import Papers from './pages/Papers';
import CourseDetails from './pages/CourseDetails';

const ProtectedRoute = () => {
  const { session, loading } = useAuth();

  if (loading) {
    return <div className="flex h-screen items-center justify-center bg-background text-text">Loading...</div>;
  }

  if (!session) {
    return <Navigate to="/login" replace />;
  }

  return (
    <Layout>
      <Outlet />
    </Layout>
  );
};

// V1 focuses exclusively on Past Papers for both Students and Teachers.
// Flip to `true` in V2 to re-enable Overview, My Courses, etc.
const ENABLE_V2_ROUTES = false;

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          
          <Route element={<ProtectedRoute />}>
            <Route path="/" element={<Navigate to="/papers" replace />} />
            <Route path="/papers" element={<Papers />} />

            {ENABLE_V2_ROUTES ? (
              <>
                <Route path="/overview" element={<Dashboard />} />
                <Route path="/teachers" element={<Teachers />} />
                <Route path="/courses" element={<Courses />} />
                <Route path="/courses/:id" element={<CourseDetails />} />
                <Route path="/subscriptions" element={<Subscriptions />} />
                <Route path="/moderation" element={<Moderation />} />
              </>
            ) : (
              <>
                <Route path="/overview" element={<Navigate to="/papers" replace />} />
                <Route path="/teachers" element={<Navigate to="/papers" replace />} />
                <Route path="/courses" element={<Navigate to="/papers" replace />} />
                <Route path="/courses/:id" element={<Navigate to="/papers" replace />} />
                <Route path="/subscriptions" element={<Navigate to="/papers" replace />} />
                <Route path="/moderation" element={<Navigate to="/papers" replace />} />
              </>
            )}
          </Route>

          <Route path="*" element={<Navigate to="/papers" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
