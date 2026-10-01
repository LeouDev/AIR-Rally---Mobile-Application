import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { AppState, Platform } from 'react-native';

import type { Database } from '@/lib/database.types';
import { reportingFetch } from '@/lib/sentry';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const key = process.env.EXPO_PUBLIC_SUPABASE_KEY;

if (!url || !key) {
  throw new Error(
    'Missing EXPO_PUBLIC_SUPABASE_URL or EXPO_PUBLIC_SUPABASE_KEY. ' +
      'Copy .env.example to .env.local and fill in the values, then restart the dev server.'
  );
}

const isNative = Platform.OS === 'ios' || Platform.OS === 'android';

/** Where supabase-js keeps the session — exactly its own default
 * (`sb-<project-ref>-auth-token`), so passing it below changes nothing and
 * signs nobody out. Named so the session provider can read the stored
 * session when supabase-js won't hand it back: offline, with an expired
 * access token it can't refresh yet. */
export const AUTH_STORAGE_KEY = `sb-${new URL(url).hostname.split('.')[0]}-auth-token`;

/**
 * Same Supabase project as air-rally.com — the mobile app talks to it
 * directly and relies on the exact RLS policies the web app already
 * ships. Sessions persist in AsyncStorage on native (the supabase-js
 * React Native recommendation); on web the supabase-js default
 * (localStorage behind an SSR-safe guard) is used instead — AsyncStorage's
 * web shim touches `window` unguarded and crashes expo-router's Node-side
 * static rendering. detectSessionInUrl is off because no flow here ever
 * puts a session in a URL — Google/Facebook sign-in (see lib/oauth.ts)
 * completes through an in-app browser session and an explicit
 * exchangeCodeForSession() call, not a URL the router ever sees.
 * flowType is explicit PKCE (the library default is 'implicit') — same
 * flow the web app uses via its /auth/callback route, and the only one
 * that gives OAuth a `code` to exchange rather than tokens embedded in a
 * URL fragment, which is far less reliable to retrieve from a custom
 * `airrally://` redirect. Every request goes through reportingFetch, so
 * server errors and schema mismatches reach Sentry although supabase-js
 * never throws them.
 */
export const supabase = createClient<Database>(url, key, {
  auth: {
    ...(isNative ? { storage: AsyncStorage } : {}),
    storageKey: AUTH_STORAGE_KEY,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
    flowType: 'pkce',
  },
  global: { fetch: reportingFetch },
});

/**
 * supabase-js only refreshes tokens while it believes the app is in the
 * foreground — on native that has to be wired to AppState by hand (the
 * documented pattern). Module scope deliberately: exactly once, for the
 * lifetime of the process, matching the singleton client above.
 */
if (isNative) {
  AppState.addEventListener('change', (state) => {
    if (state === 'active') {
      supabase.auth.startAutoRefresh();
    } else {
      supabase.auth.stopAutoRefresh();
    }
  });
}
