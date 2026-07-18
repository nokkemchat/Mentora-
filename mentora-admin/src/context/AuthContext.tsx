import React, { createContext, useContext, useEffect, useState } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

type AuthContextType = {
  session: Session | null;
  user: User | null;
  isAdmin: boolean;
  loading: boolean;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType>({
  session: null,
  user: null,
  isAdmin: false,
  loading: true,
  signOut: async () => {},
});

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (session) {
        setSession(session);
        setUser(session.user);
        checkAdmin(session.user);
        setLoading(false);
      } else {
        // Auto-login for development
        const email = 'devadmin@mentora.com';
        const password = 'DevAdminPassword123!';
        
        let res: any = await supabase.auth.signInWithPassword({ email, password });
        if (res.error) {
          // If login fails, try to sign up
          res = await supabase.auth.signUp({
            email,
            password,
            options: { data: { role: 'admin' } }
          });
        }
        
        if (res.data.session) {
          setSession(res.data.session);
          setUser(res.data.session.user);
          checkAdmin(res.data.session.user);
        }
        setLoading(false);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      checkAdmin(session?.user);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const checkAdmin = (u: User | null | undefined) => {
    if (!u) {
      setIsAdmin(false);
      return;
    }
    // For now, hardcode admin email or check user_metadata.role === 'admin'
    if (u.email === 'admin@mentora.com' || u.email === 'nokkemanyeza@gmail.com' || u.email === 'devadmin@mentora.com' || u.user_metadata?.role === 'admin') {
      setIsAdmin(true);
    } else {
      setIsAdmin(false);
    }
  };

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider value={{ session, user, isAdmin, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
