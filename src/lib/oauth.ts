import * as WebBrowser from 'expo-web-browser';

import { supabase } from '@/lib/supabase';

export type OAuthProvider = 'google' | 'facebook';

export type OAuthResult =
  | { status: 'signed_in' }
  | { status: 'cancelled' }
  | { status: 'error'; message: string };

const REDIRECT_URL = 'airrally://auth-callback';

/**
 * "Continue with Google/Facebook" — the native counterpart to the web's
 * OAuthButtons.tsx. signInWithOAuth() with skipBrowserRedirect just hands
 * back the provider's consent URL rather than trying to navigate (there's
 * no browser to navigate on native); an in-app browser session opens that
 * URL and is handed back the app via the airrally:// custom scheme once
 * the provider redirects. PKCE means that redirect carries a `code`, not
 * tokens — exchangeCodeForSession() does the real sign-in.
 *
 * Profile creation (name, avatar) is handled entirely server-side by
 * handle_new_user() reading the provider's own metadata — nothing to
 * collect here. The one thing OAuth skips that manual sign-up doesn't is
 * User Agreement acceptance; the session provider checks for that
 * separately once a session exists (see providers/session.tsx), the same
 * way the web's /auth/callback route redirects a first-time OAuth arrival
 * to a completion step rather than assuming agreement.
 */
export async function signInWithProvider(provider: OAuthProvider): Promise<OAuthResult> {
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: { redirectTo: REDIRECT_URL, skipBrowserRedirect: true },
  });
  if (error || !data.url) {
    return { status: 'error', message: error?.message ?? "Couldn't start sign-in." };
  }

  const result = await WebBrowser.openAuthSessionAsync(data.url, REDIRECT_URL);
  if (result.type !== 'success' || !result.url) {
    return { status: 'cancelled' };
  }

  const code = new URL(result.url).searchParams.get('code');
  if (!code) {
    const errorDescription = new URL(result.url).searchParams.get('error_description');
    return { status: 'error', message: errorDescription ?? "That didn't complete — try again." };
  }

  const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
  if (exchangeError) {
    return { status: 'error', message: exchangeError.message };
  }
  return { status: 'signed_in' };
}
