import * as AppleAuthentication from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';
import * as WebBrowser from 'expo-web-browser';

import { getFriendlyAuthErrorMessage } from '@/lib/auth-errors';
import { supabase } from '@/lib/supabase';

export type OAuthProvider = 'google' | 'facebook';

/**
 * Facebook sign-in is HIDDEN, not removed.
 *
 * The Meta app is in Development mode with Business Verification still
 * pending (as of 2026-08-27). In Development mode, Facebook Login only
 * succeeds for accounts listed on the Meta app as an admin, developer or
 * tester — everyone else gets an error. It tested clean because the
 * person testing was an admin, which is exactly the shape of bug that
 * survives testing and fails every real user.
 *
 * TO UN-HIDE: once Meta clears Business Verification and the app is
 * switched to Live mode, flip this to true. Nothing else needs changing
 * — the button, the provider plumbing and the callback handling are all
 * still here and still wired up. Verify with a Facebook account that is
 * NOT on the Meta app's roster, since an admin account cannot tell you
 * whether this is fixed.
 */
export const FACEBOOK_SIGN_IN_ENABLED = false;

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
    return { status: 'error', message: error ? getFriendlyAuthErrorMessage(error) : "Couldn't start sign-in." };
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
    return { status: 'error', message: getFriendlyAuthErrorMessage(exchangeError) };
  }
  return { status: 'signed_in' };
}

function isCancelledAppleError(err: unknown): boolean {
  return typeof err === 'object' && err !== null && 'code' in err && err.code === 'ERR_REQUEST_CANCELED';
}

/**
 * "Continue with Apple" — required alongside Google/Facebook by App Store
 * Guideline 4.8, and mechanically nothing like signInWithProvider() above:
 * no in-app browser, no PKCE code exchange. The native OS sheet hands back
 * a signed identity token directly; Supabase verifies it itself via
 * signInWithIdToken(). The nonce round-trip (raw here, SHA-256'd for the
 * Apple request, raw again for Supabase) stops a captured identity token
 * from being replayed into a session it was never issued for.
 *
 * Apple hands back the user's name ONLY on the very first authorization
 * ever, and never inside the identity token itself — unlike Google, whose
 * token carries given_name/family_name/picture, which is what
 * handle_new_user() reads to fill in a profile (see
 * 20260810000061_oauth_profile_metadata.sql in the web repo). That trigger
 * fires on the auth.users INSERT, before this function ever sees fullName,
 * so by the time signInWithIdToken() resolves the profile row already
 * exists — nameless. A first-time name has to be written with a direct
 * profiles update here, not left for a trigger that already ran.
 */
export async function signInWithApple(): Promise<OAuthResult> {
  const rawNonce = Crypto.randomUUID();
  const hashedNonce = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, rawNonce);

  let credential: AppleAuthentication.AppleAuthenticationCredential;
  try {
    credential = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
      nonce: hashedNonce,
    });
  } catch (err) {
    if (isCancelledAppleError(err)) {
      return { status: 'cancelled' };
    }
    return { status: 'error', message: "That didn't complete — try again." };
  }

  if (!credential.identityToken) {
    return { status: 'error', message: "Apple didn't return a usable credential." };
  }

  const { data, error } = await supabase.auth.signInWithIdToken({
    provider: 'apple',
    token: credential.identityToken,
    nonce: rawNonce,
  });
  if (error || !data.user) {
    return { status: 'error', message: error ? getFriendlyAuthErrorMessage(error) : "Couldn't complete sign-in." };
  }

  const givenName = credential.fullName?.givenName ?? null;
  const familyName = credential.fullName?.familyName ?? null;
  if (givenName || familyName) {
    // Best-effort: on failure the user is still signed in, just with a
    // nameless profile they can fill in under Profile — the same
    // degradation as a Google/Facebook account whose provider withheld a
    // name, not a reason to fail the sign-in itself.
    await supabase
      .from('profiles')
      .update({
        first_name: givenName,
        last_name: familyName,
        display_name: [givenName, familyName].filter(Boolean).join(' ') || null,
      })
      .eq('id', data.user.id);
  }

  return { status: 'signed_in' };
}
