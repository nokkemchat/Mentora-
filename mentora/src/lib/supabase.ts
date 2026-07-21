import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

// Add actual credentials as fallback in case Metro bundler fails to load .env
const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || 'https://jmyunhtqcjkvqwpdwtve.supabase.co';
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpteXVuaHRxY2prdnF3cGR3dHZlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODMwMzU2OTMsImV4cCI6MjA5ODYxMTY5M30.2txxKAQsewgevnDj_6qfHo0-vDPkUxsggYUXiSIJTzM';

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false, // Not needed for React Native
  },
});
