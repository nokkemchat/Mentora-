import React, { createContext, useContext, useEffect, useState } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

export type UserRole = 'admin' | 'teacher' | 'student' | null;

type AuthContextType = {
  session: Session | null;
  user: User | null;
  role: UserRole;
  isAdmin: boolean;
  isTeacher: boolean;
  isStudent: boolean;
  loading: boolean;
  showRoleModal: boolean;
  setShowRoleModal: (show: boolean) => void;
  setRole: (role: 'teacher' | 'student') => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType>({
  session: null,
  user: null,
  role: null,
  isAdmin: false,
  isTeacher: false,
  isStudent: false,
  loading: true,
  showRoleModal: false,
  setShowRoleModal: () => {},
  setRole: async () => {},
  signOut: async () => {},
});

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [role, setRoleState] = useState<UserRole>(null);
  const [showRoleModal, setShowRoleModal] = useState(false);
  const [loading, setLoading] = useState(true);

  const resolveRole = async (u: User | null | undefined): Promise<UserRole> => {
    if (!u) return null;

    // Check for super admin credentials or admin metadata
    const adminEmails = ['admin@mentora.com', 'nokkemanyeza@gmail.com', 'devadmin@mentora.com'];
    if (adminEmails.includes(u.email || '') || u.user_metadata?.role === 'admin') {
      return 'admin';
    }

    // Check profiles table in Supabase
    try {
      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', u.id)
        .maybeSingle();

      if (profile?.role === 'teacher' || profile?.role === 'student' || profile?.role === 'admin') {
        return profile.role;
      }
    } catch (e) {
      console.warn('Error fetching user profile role:', e);
    }

    // Check user_metadata
    if (u.user_metadata?.role === 'teacher' || u.user_metadata?.role === 'student') {
      return u.user_metadata.role;
    }

    return null;
  };

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (session) {
        setSession(session);
        setUser(session.user);

        // Check if user selected a role on Sign Up before OAuth redirect
        const pendingRole = sessionStorage.getItem('mentora_signup_role') as 'teacher' | 'student' | null;
        if (pendingRole) {
          sessionStorage.removeItem('mentora_signup_role');
          try {
            await supabase.auth.updateUser({ data: { role: pendingRole } });
            await supabase.from('profiles').upsert(
              {
                id: session.user.id,
                role: pendingRole,
                first_name:
                  session.user.user_metadata?.first_name ||
                  session.user.user_metadata?.given_name ||
                  session.user.user_metadata?.full_name?.split(' ')[0] ||
                  null,
                last_name:
                  session.user.user_metadata?.last_name ||
                  session.user.user_metadata?.family_name ||
                  session.user.user_metadata?.full_name?.split(' ').slice(1).join(' ') ||
                  null,
                avatar_url: session.user.user_metadata?.avatar_url || session.user.user_metadata?.picture || null,
              },
              { onConflict: 'id' }
            );
          } catch (e) {
            console.warn('Error applying pending signup role:', e);
          }
        }

        const resolvedRole = pendingRole || await resolveRole(session.user);
        setRoleState(resolvedRole);

        // If user is authenticated but hasn't picked a role yet, trigger the role selection modal!
        if (!resolvedRole) {
          setShowRoleModal(true);
        }
      } else {
        setSession(null);
        setUser(null);
        setRoleState(null);
      }
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, newSession) => {
      setSession(newSession);
      setUser(newSession?.user ?? null);
      if (newSession?.user) {
        const pendingRole = sessionStorage.getItem('mentora_signup_role') as 'teacher' | 'student' | null;
        if (pendingRole) {
          sessionStorage.removeItem('mentora_signup_role');
          try {
            await supabase.auth.updateUser({ data: { role: pendingRole } });
            await supabase.from('profiles').upsert(
              {
                id: newSession.user.id,
                role: pendingRole,
                first_name:
                  newSession.user.user_metadata?.first_name ||
                  newSession.user.user_metadata?.given_name ||
                  newSession.user.user_metadata?.full_name?.split(' ')[0] ||
                  null,
                last_name:
                  newSession.user.user_metadata?.last_name ||
                  newSession.user.user_metadata?.family_name ||
                  newSession.user.user_metadata?.full_name?.split(' ').slice(1).join(' ') ||
                  null,
                avatar_url: newSession.user.user_metadata?.avatar_url || newSession.user.user_metadata?.picture || null,
              },
              { onConflict: 'id' }
            );
          } catch (e) {
            console.warn('Error applying pending signup role:', e);
          }
        }

        const resolvedRole = pendingRole || await resolveRole(newSession.user);
        setRoleState(resolvedRole);
        if (!resolvedRole) {
          setShowRoleModal(true);
        }
      } else {
        setRoleState(null);
      }
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const setRole = async (newRole: 'teacher' | 'student') => {
    if (!user) return;

    try {
      // 1. Update Supabase Auth user metadata
      await supabase.auth.updateUser({
        data: { role: newRole },
      });

      // 2. Update public.profiles table
      await supabase.from('profiles').upsert(
        {
          id: user.id,
          role: newRole,
          first_name:
            user.user_metadata?.first_name ||
            user.user_metadata?.given_name ||
            user.user_metadata?.full_name?.split(' ')[0] ||
            null,
          last_name:
            user.user_metadata?.last_name ||
            user.user_metadata?.family_name ||
            user.user_metadata?.full_name?.split(' ').slice(1).join(' ') ||
            null,
          avatar_url: user.user_metadata?.avatar_url || user.user_metadata?.picture || null,
        },
        { onConflict: 'id' }
      );

      setRoleState(newRole);
      setShowRoleModal(false);
    } catch (err) {
      console.error('Error setting role:', err);
      throw err;
    }
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setSession(null);
    setUser(null);
    setRoleState(null);
    setShowRoleModal(false);
  };

  const isAdmin = role === 'admin';
  const isTeacher = role === 'teacher';
  const isStudent = role === 'student';

  return (
    <AuthContext.Provider
      value={{
        session,
        user,
        role,
        isAdmin,
        isTeacher,
        isStudent,
        loading,
        showRoleModal,
        setShowRoleModal,
        setRole,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
