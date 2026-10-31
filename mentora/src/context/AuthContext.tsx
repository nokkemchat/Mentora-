import React, { createContext, useContext, useEffect, useState } from 'react';
import { Session, User } from '@supabase/supabase-js';
import * as Linking from 'expo-linking';
import { supabase } from '../lib/supabase';
import { handleAuthRedirect } from '../lib/auth';
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
  const segments = useSegments() as unknown as string[];
  const router = useRouter();

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      setIsLoading(false);
    }).catch((error) => {
      console.error('Supabase getSession error:', error);
      setIsLoading(false);
    });

    // Failsafe: If Supabase auth hangs, forcefully stop loading after 3 seconds so the app doesn't get stuck on the splash screen
    const failsafeTimer = setTimeout(() => {
      setIsLoading(false);
    }, 3000);

    // Listen for auth changes
    const { data: authListener } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        setIsLoading(false);
      }
    );

    // Listen for incoming deep links (e.g. OAuth redirects or email recovery)
    Linking.getInitialURL().then(async (url) => {
      if (url && (url.includes('code=') || url.includes('access_token=') || url.includes('error='))) {
        try {
          await handleAuthRedirect(url);
        } catch (err) {
          console.error('Initial deep link auth error:', err);
        }
      }
    }).catch((err) => console.log('Error checking initial URL:', err));

    const linkSubscription = Linking.addEventListener('url', async ({ url }) => {
      if (url && (url.includes('code=') || url.includes('access_token=') || url.includes('error='))) {
        try {
          await handleAuthRedirect(url);
        } catch (err) {
          console.error('Incoming deep link auth error:', err);
        }
      }
    });

    return () => {
      clearTimeout(failsafeTimer);
      authListener.subscription.unsubscribe();
      linkSubscription.remove();
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
      // Check if user has chosen a role
      const role = user.user_metadata?.role;
      const roleSelected = user.user_metadata?.role_selected === true || role === 'teacher';
      const isRoleSelectionScreen = segments[1] === 'role-selection';
      const isBoardSelectionScreen = segments[1] === 'board-selection';

      // 1. If user has NOT chosen a role yet (e.g. first-time Google sign-in)
      if (!role || !roleSelected) {
        if (!isRoleSelectionScreen && !isBoardSelectionScreen) {
          router.replace('/(auth)/role-selection');
        }
        return;
      }

      // 2. User has chosen a role: Check if profile is completed
      const hasCompletedProfile = user.user_metadata?.profile_completed === true;
      const isCompleteProfileScreen = segments[1] === 'complete-profile';
      const isTeacherProfileScreen = segments[1] === 'complete-teacher-profile';

      if (!hasCompletedProfile && !isCompleteProfileScreen && !isTeacherProfileScreen) {
        // Force them to complete profile based on role
        if (role === 'teacher') {
          router.replace('/(auth)/complete-teacher-profile');
        } else {
          router.replace('/(auth)/complete-profile');
        }
      } else if (hasCompletedProfile && inAuthGroup && !isRoleSelectionScreen && !isBoardSelectionScreen) {
        // Redirect authenticated users away from auth screens (unless deliberately changing role or board)
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
