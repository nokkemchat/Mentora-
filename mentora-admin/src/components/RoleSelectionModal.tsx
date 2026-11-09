import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { BookOpen, GraduationCap, CheckCircle2, Loader2, Sparkles } from 'lucide-react';

export default function RoleSelectionModal() {
  const { showRoleModal, setRole, role } = useAuth();
  const navigate = useNavigate();
  const [selected, setSelected] = useState<'teacher' | 'student'>(role === 'teacher' ? 'teacher' : 'student');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  if (!showRoleModal) return null;

  const handleConfirm = async () => {
    setLoading(true);
    setError('');
    try {
      await setRole(selected);
      navigate('/papers', { replace: true });
    } catch (err: any) {
      setError(err?.message || 'Failed to update account role');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fade-in">
      <div className="relative w-full max-w-xl liquid-glass rounded-3xl shadow-2xl p-6 sm:p-8 overflow-hidden text-text">
        {/* Subtle background glow */}
        <div className="absolute -top-24 -right-24 w-60 h-60 bg-primary/20 rounded-full blur-[80px] pointer-events-none" />
        <div className="absolute -bottom-24 -left-24 w-60 h-60 bg-purple-500/15 rounded-full blur-[80px] pointer-events-none" />

        <div className="text-center mb-6">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-semibold uppercase tracking-wider mb-3">
            <Sparkles className="w-3.5 h-3.5" />
            Complete Your Setup
          </div>
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">Choose Your Role</h2>
          <p className="text-textMuted text-sm sm:text-base mt-2 max-w-md mx-auto">
            Select how you will be using Ziviso. This is a one-time setup choice that determines your account permissions.
          </p>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-error/10 border border-error/20 rounded-2xl text-error text-sm text-center">
            {error}
          </div>
        )}

        {/* Options */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
          {/* Teacher Option */}
          <div
            onClick={() => setSelected('teacher')}
            className={`relative p-5 rounded-2xl border-2 cursor-pointer transition-all flex flex-col justify-between ${
              selected === 'teacher'
                ? 'border-primary bg-primary/5 shadow-md'
                : 'border-border bg-background hover:border-textMuted/40'
            }`}
          >
            {selected === 'teacher' && (
              <div className="absolute top-3 right-3 text-primary">
                <CheckCircle2 className="w-5 h-5" />
              </div>
            )}
            <div>
              <div className="w-12 h-12 rounded-xl bg-purple-500/10 text-purple-500 flex items-center justify-center mb-4">
                <BookOpen className="w-6 h-6" />
              </div>
              <h3 className="font-bold text-lg mb-1">Educator / Teacher</h3>
              <p className="text-textMuted text-xs leading-relaxed">
                Upload question papers, author marking schemes, and manage student course materials.
              </p>
            </div>
            <div className="mt-4 pt-3 border-t border-border/50 text-[11px] font-medium text-primary">
              Full Upload & Editing Privileges
            </div>
          </div>

          {/* Student Option */}
          <div
            onClick={() => setSelected('student')}
            className={`relative p-5 rounded-2xl border-2 cursor-pointer transition-all flex flex-col justify-between ${
              selected === 'student'
                ? 'border-primary bg-primary/5 shadow-md'
                : 'border-border bg-background hover:border-textMuted/40'
            }`}
          >
            {selected === 'student' && (
              <div className="absolute top-3 right-3 text-primary">
                <CheckCircle2 className="w-5 h-5" />
              </div>
            )}
            <div>
              <div className="w-12 h-12 rounded-xl bg-blue-500/10 text-blue-500 flex items-center justify-center mb-4">
                <GraduationCap className="w-6 h-6" />
              </div>
              <h3 className="font-bold text-lg mb-1">Student</h3>
              <p className="text-textMuted text-xs leading-relaxed">
                Browse all public past exam papers, review teacher marking schemes, and prepare for exams.
              </p>
            </div>
            <div className="mt-4 pt-3 border-t border-border/50 text-[11px] font-medium text-textMuted">
              Read & Practice Only (No Uploads)
            </div>
          </div>
        </div>

        {/* Action Button */}
        <button
          onClick={handleConfirm}
          disabled={loading}
          className="w-full py-3.5 px-6 rounded-2xl bg-primary hover:bg-primaryHover text-white font-semibold text-sm transition-all flex items-center justify-center gap-2 shadow-lg shadow-primary/25 disabled:opacity-50 cursor-pointer"
        >
          {loading ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              <span>Saving Role...</span>
            </>
          ) : (
            <span>Continue as {selected === 'teacher' ? 'Educator / Teacher' : 'Student'}</span>
          )}
        </button>
      </div>
    </div>
  );
}
