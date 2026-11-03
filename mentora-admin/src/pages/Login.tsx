import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { Lock, Mail, Loader2, Eye, EyeOff, GraduationCap, BookOpen, CheckCircle2 } from 'lucide-react';
import ZivisoArtisticBackground from '../components/ZivisoArtisticBackground';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [roleChoice, setRoleChoice] = useState<'student' | 'teacher'>('student');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { session } = useAuth();

  const [isSignUp, setIsSignUp] = useState(false);

  useEffect(() => {
    if (session) {
      navigate('/');
    }
  }, [session, navigate]);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    if (isSignUp) {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            role: roleChoice,
            role_selected: true,
          },
        },
      });
      setLoading(false);
      
      if (error) {
        setError(error.message);
        return;
      }
      
      // Sync into profiles table
      if (data.user) {
        try {
          await supabase.from('profiles').upsert(
            {
              id: data.user.id,
              role: roleChoice,
              first_name: email.split('@')[0],
            },
            { onConflict: 'id' }
          );
        } catch (e) {
          console.warn('Error syncing profile role:', e);
        }
      }

      // If sign up works and session is created immediately
      if (data.session) {
        navigate('/');
      } else {
        setError('Account created! Please check your email or log in.');
        setIsSignUp(false);
      }
    } else {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      setLoading(false);

      if (error) {
        setError(error.message);
        return;
      }
      
      navigate('/');
    }
  };

  const handleGoogleSignIn = async () => {
    setError('');
    try {
      // Only set pending role if user explicitly selected a role on the Sign Up tab
      if (isSignUp) {
        sessionStorage.setItem('mentora_signup_role', roleChoice);
      } else {
        sessionStorage.removeItem('mentora_signup_role');
      }

      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: window.location.origin,
        },
      });
      if (error) setError(error.message);
    } catch (err: any) {
      setError(err.message || 'Failed to sign in with Google');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background text-text relative overflow-hidden py-12 px-4">
      {/* Background decoration */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary/20 rounded-full blur-[100px] pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-purple-500/10 rounded-full blur-[100px] pointer-events-none" />

      {/* Artistic Scattered & Falling Z-I-V-I-S-O Letters Background */}
      <ZivisoArtisticBackground offsetSidebar={false} />

      <div className="w-full max-w-md liquid-glass rounded-3xl p-8 sm:p-10 relative z-10 shadow-2xl border border-primary/20">
        <div className="flex flex-col items-center mb-6 text-center">
          <div className="flex justify-center mb-4">
            <div className="w-20 h-20 bg-gradient-to-br from-primary/30 via-white/10 to-transparent rounded-3xl flex items-center justify-center p-1 overflow-hidden shadow-xl shadow-primary/30 border border-white/25 group hover:scale-105 transition-transform">
              <img src="/logo.png" alt="Ziviso Logo" className="w-full h-full object-cover rounded-2xl" />
            </div>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight bg-gradient-to-r from-text via-text to-primaryLight bg-clip-text">
            {isSignUp ? 'Create Your Account' : 'Welcome to Ziviso'}
          </h1>
          <p className="text-textMuted text-sm mt-1.5 font-medium">
            {isSignUp 
              ? 'Select your role to start learning or teaching' 
              : 'Sign in to access your courses, papers, and AI tutor'}
          </p>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-error/10 border border-error/25 rounded-2xl text-error text-sm text-center font-medium shadow-xs">
            {error}
          </div>
        )}

        {/* Role Selector on Sign Up */}
        {isSignUp && (
          <div className="mb-6">
            <label className="block text-xs font-bold text-text uppercase tracking-wider mb-2">
              Select Your Account Type
            </label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setRoleChoice('student')}
                className={`relative flex flex-col items-center justify-center p-4 rounded-2xl border-2 transition-all cursor-pointer ${
                  roleChoice === 'student'
                    ? 'border-primary bg-primary/15 text-primary font-bold shadow-md shadow-primary/20'
                    : 'border-border/80 bg-surface-sunken/40 text-textMuted hover:border-textMuted/50'
                }`}
              >
                {roleChoice === 'student' && (
                  <CheckCircle2 className="w-4 h-4 absolute top-2 right-2 text-primary" />
                )}
                <div className={`p-2.5 rounded-xl mb-1.5 ${roleChoice === 'student' ? 'bg-primary/20 text-primary' : 'bg-border/40 text-textMuted'}`}>
                  <GraduationCap className="w-5 h-5" />
                </div>
                <span className="text-sm font-bold">Student</span>
                <span className="text-[10px] text-textMuted mt-0.5">Practice & Study</span>
              </button>

              <button
                type="button"
                onClick={() => setRoleChoice('teacher')}
                className={`relative flex flex-col items-center justify-center p-4 rounded-2xl border-2 transition-all cursor-pointer ${
                  roleChoice === 'teacher'
                    ? 'border-primary bg-primary/15 text-primary font-bold shadow-md shadow-primary/20'
                    : 'border-border/80 bg-surface-sunken/40 text-textMuted hover:border-textMuted/50'
                }`}
              >
                {roleChoice === 'teacher' && (
                  <CheckCircle2 className="w-4 h-4 absolute top-2 right-2 text-primary" />
                )}
                <div className={`p-2.5 rounded-xl mb-1.5 ${roleChoice === 'teacher' ? 'bg-primary/20 text-primary' : 'bg-border/40 text-textMuted'}`}>
                  <BookOpen className="w-5 h-5" />
                </div>
                <span className="text-sm font-bold">Teacher</span>
                <span className="text-[10px] text-textMuted mt-0.5">Upload Papers & Teach</span>
              </button>
            </div>
            <p className="text-[11px] text-textMuted mt-2 text-center font-medium">
              {roleChoice === 'student'
                ? '📘 Access public past papers, view marking schemes, practice.'
                : '👨‍🏫 Upload exam papers, attach marking schemes, manage courses.'}
            </p>
          </div>
        )}

        <form onSubmit={handleAuth} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-text uppercase tracking-wider mb-1.5">Email Address</label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                <Mail className="h-5 w-5 text-textMuted" />
              </div>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="block w-full pl-10 pr-3.5 py-3 border border-border/80 rounded-2xl bg-surface-sunken/60 text-text placeholder-textMuted/60 focus:ring-2 focus:ring-primary focus:border-transparent transition-all text-sm"
                placeholder="name@example.com"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-text uppercase tracking-wider mb-1.5">Password</label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                <Lock className="h-5 w-5 text-textMuted" />
              </div>
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="block w-full pl-10 pr-10 py-3 border border-border/80 rounded-2xl bg-surface-sunken/60 text-text placeholder-textMuted/60 focus:ring-2 focus:ring-primary focus:border-transparent transition-all text-sm"
                placeholder="••••••••"
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-textMuted hover:text-text transition-colors cursor-pointer"
              >
                {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="btn-3d-primary w-full flex justify-center py-3.5 px-4 rounded-2xl text-sm font-bold cursor-pointer shadow-lg disabled:opacity-50"
          >
            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : (isSignUp ? `Sign Up as ${roleChoice === 'teacher' ? 'Teacher' : 'Student'}` : 'Sign In with Email')}
          </button>
        </form>

        <div className="relative my-5">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-border/80" />
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-surface px-3 text-textMuted font-bold">Or continue with</span>
          </div>
        </div>

        <button
          type="button"
          onClick={handleGoogleSignIn}
          className="btn-3d-glass w-full flex items-center justify-center gap-3 py-3.5 px-4 rounded-2xl text-sm font-bold text-text cursor-pointer shadow-sm"
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24">
            <path
              fill="#4285F4"
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
            />
            <path
              fill="#34A853"
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
            />
            <path
              fill="#FBBC05"
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
            />
            <path
              fill="#EA4335"
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
            />
          </svg>
          <span>{isSignUp ? `Sign Up with Google (${roleChoice === 'teacher' ? 'Teacher' : 'Student'})` : 'Sign In with Google'}</span>
        </button>

        <div className="mt-6 text-center">
          <button
            onClick={() => {
              setIsSignUp(!isSignUp);
              setError('');
            }}
            className="text-sm font-semibold text-primary hover:text-primaryHover transition-colors cursor-pointer"
          >
            {isSignUp ? 'Already have an account? Sign In' : 'Need an account? Sign Up as Student / Teacher'}
          </button>
        </div>
      </div>
    </div>
  );
}
