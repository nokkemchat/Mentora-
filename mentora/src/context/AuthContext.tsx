import React, { createContext, useContext, useEffect, useState } from 'react';
import { Session, User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { useRouter, useSegments } from 'expo-router';

type AuthContextType = {
  user: User | null;
  session: Session | null;
  isLoading: boolean;
};

const AuthContext = createContext<AuthContextType>({
  user: null,
  session: null,
  isLoading: true,
});

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      setIsLoading(false);
    });

    // Listen for auth changes
    const { data: authListener } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        setIsLoading(false);
      }
    );

    return () => {
      authListener.subscription.unsubscribe();
    };
  }, []);

  // Route guarding
  useEffect(() => {
    if (isLoading) return;

    const inAuthGroup = segments[0] === '(auth)';

    if (!user && !inAuthGroup) {
      // Redirect unauthenticated users to onboarding/auth
      router.replace('/(auth)/onboarding');
    } else if (user) {
      // Check if user has completed profile
      const hasCompletedProfile = user.user_metadata?.profile_completed === true;
      const isCompleteProfileScreen = segments[1] === 'complete-profile';
      const isTeacherProfileScreen = segments[1] === 'complete-teacher-profile';
      const role = user.user_metadata?.role;

      if (!hasCompletedProfile && !isCompleteProfileScreen && !isTeacherProfileScreen) {
        // Force them to complete profile based on role
        if (role === 'teacher') {
          router.replace('/(auth)/complete-teacher-profile');
        } else {
          router.replace('/(auth)/complete-profile');
        }
      } else if (hasCompletedProfile && inAuthGroup) {
        // Redirect authenticated users away from auth screens
        router.replace('/(tabs)');
      }
    }
  }, [user, isLoading, segments]);

  return (
    <AuthContext.Provider value={{ user, session, isLoading }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
