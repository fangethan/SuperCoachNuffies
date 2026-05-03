import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import Constants from 'expo-constants';

// URL + anon key are loaded from app.json's `expo.extra` block. The anon key
// is safe to ship in the bundle because Row-Level Security on every table
// gates access to `auth.uid() = user_id`.
const extra = (Constants.expoConfig?.extra ?? {}) as {
  supabaseUrl?: string;
  supabaseAnonKey?: string;
};

function looksLikeRealUrl(s: string | undefined): s is string {
  if (!s) return false;
  if (s.includes('REPLACE_WITH') || s.includes('placeholder')) return false;
  try {
    const u = new URL(s);
    return u.protocol === 'https:' && u.hostname.length > 0;
  } catch {
    return false;
  }
}

// `createClient` throws synchronously on an invalid URL, which would crash the
// app at import time before the user has even had a chance to set the keys.
// Fall back to a syntactically-valid placeholder so the bundle loads; auth
// requests will then fail at the network level with a clear error instead of
// taking the whole app down.
export const isSupabaseConfigured = looksLikeRealUrl(extra.supabaseUrl)
  && (extra.supabaseAnonKey?.length ?? 0) > 20;

if (!isSupabaseConfigured) {
  console.warn(
    '[supabase] supabaseUrl / supabaseAnonKey not set in app.json extra — ' +
    'auth and team sync will be inert until you fill them in.',
  );
}

const SUPABASE_URL = isSupabaseConfigured
  ? extra.supabaseUrl!
  : 'https://placeholder.supabase.co';
const SUPABASE_ANON_KEY = isSupabaseConfigured
  ? extra.supabaseAnonKey!
  : 'placeholder';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: AsyncStorage as any,
    autoRefreshToken: isSupabaseConfigured,
    persistSession: isSupabaseConfigured,
    detectSessionInUrl: false,
  },
});
