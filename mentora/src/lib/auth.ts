import { Platform } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import * as AuthSession from 'expo-auth-session';
import { supabase } from './supabase';

WebBrowser.maybeCompleteAuthSession();

/**
 * Extracts query parameters and hash fragment parameters from an authentication callback URL.
 */
export function parseSupabaseAuthUrl(url: string): Record<string, string> {
  const result: Record<string, string> = {};
  if (!url) return result;

  try {
    // 1. Parse hash fragment (#access_token=...&refresh_token=...)
    const hashIdx = url.indexOf('#');
    if (hashIdx !== -1) {
      const hash = url.substring(hashIdx + 1);
      const sp = new URLSearchParams(hash);
      for (const [k, v] of sp.entries()) {
        result[k] = v;
      }
    }

    // 2. Parse query parameters (?code=... or ?error=...)
    const queryIdx = url.indexOf('?');
    if (queryIdx !== -1) {
      const end = hashIdx !== -1 && hashIdx > queryIdx ? hashIdx : url.length;
      const query = url.substring(queryIdx + 1, end);
      const sp = new URLSearchParams(query);
      for (const [k, v] of sp.entries()) {
        if (!result[k]) {
          result[k] = v;
        }
      }
    }
  } catch (err) {
    console.error('Failed to parse auth redirect URL:', err);
  }

  return result;
}

/**
 * Handles incoming auth redirect URL from OAuth or Email links (PKCE code or tokens).
 */
export async function handleAuthRedirect(url: string) {
  if (!url) return { data: null, error: new Error('Empty URL') };

  const params = parseSupabaseAuthUrl(url);

  // Check for error in callback
  if (params.error || params.error_description) {
    const errorMsg = params.error_description || params.error || 'Authentication failed';
    return { data: null, error: new Error(decodeURIComponent(errorMsg.replace(/\+/g, ' '))) };
  }

  // Handle PKCE code exchange
  if (params.code) {
    const { data, error } = await supabase.auth.exchangeCodeForSession(params.code);
    return { data, error };
  }

  // Handle Implicit token response
  if (params.access_token && params.refresh_token) {
    const { data, error } = await supabase.auth.setSession({
      access_token: params.access_token,
      refresh_token: params.refresh_token,
    });
    return { data, error };
  }

  return { data: null, error: null };
}

/**
 * Initiates Google OAuth Sign-in on Mobile (via in-app browser with deep link) or Web (browser redirect).
 */
export async function signInWithGoogle(options?: { role?: string; board?: string }) {
  try {
    if (Platform.OS === 'web') {
      const origin = typeof window !== 'undefined' ? window.location.origin : undefined;
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: origin,
          queryParams: {
            access_type: 'offline',
            prompt: 'select_account',
          },
        },
      });
      if (error) throw error;
      return { success: true, data };
    }

    // Native platforms: iOS and Android
    const redirectUrl = AuthSession.makeRedirectUri({
      scheme: 'ziviso',
      path: '(tabs)',
    });

    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: redirectUrl,
        skipBrowserRedirect: true,
        queryParams: {
          access_type: 'offline',
          prompt: 'select_account',
        },
      },
    });

    if (error) throw error;
    if (!data?.url) throw new Error('Could not initiate Google Sign-in: missing authorization URL.');

    const res = await WebBrowser.openAuthSessionAsync(data.url, redirectUrl);

    if (res.type === 'success' && res.url) {
      const result = await handleAuthRedirect(res.url);
      if (result.error) throw result.error;

      // Tag the user role & board if passed and not yet present
      if (options?.role && result.data?.session?.user) {
        const user = result.data.session.user;
        if (!user.user_metadata?.role) {
          await supabase.auth.updateUser({
            data: {
              role: options.role,
              board: options.board || null,
            },
          });
        }
      }

      return { success: true, session: result.data?.session };
    } else if (res.type === 'cancel' || res.type === 'dismiss') {
      return { cancelled: true };
    }

    return { cancelled: true };
  } catch (err: any) {
    return { error: err };
  }
}

/**
 * Formats user-facing friendly error messages.
 */
export function getFriendlyAuthErrorMessage(error: any): string {
  if (!error) return 'An unexpected error occurred. Please try again.';

  const message = (typeof error === 'string' ? error : error.message || '').toLowerCase();

  if (message.includes('invalid login credentials') || message.includes('invalid grant')) {
    return 'Incorrect email or password. Please verify and try again.';
  }
  if (message.includes('user already registered') || message.includes('already exists')) {
    return 'An account with this email already exists. Please sign in instead.';
  }
  if (message.includes('password should be at least 6 characters')) {
    return 'Your password must be at least 6 characters long.';
  }
  if (message.includes('email not confirmed')) {
    return 'Please confirm your email address. Check your inbox for the confirmation link.';
  }
  if (message.includes('invalid format') || message.includes('valid email')) {
    return 'Please enter a valid email address.';
  }
  if (message.includes('network request failed') || message.includes('failed to fetch')) {
    return 'Network connection problem. Please check your internet connection.';
  }
  if (message.includes('rate limit')) {
    return 'Too many attempts. Please wait a moment before trying again.';
  }

  return error.message || 'Authentication error. Please try again.';
}
