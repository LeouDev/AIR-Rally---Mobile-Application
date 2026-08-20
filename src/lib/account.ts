import { supabase } from '@/lib/supabase';

/**
 * Self-service account deletion (Apple Guideline 5.1.1(v)) — the same
 * pattern as checkout.ts's Next.js call: this needs the Supabase Admin
 * API (banning the auth.users row, scrubbing its email) to actually lock
 * the account out, which only the server's secret key can do.
 */
const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'https://air-rally.com';

export type DeleteAccountResult = { success: true } | { success: false; error: string };

export async function deleteAccount(): Promise<DeleteAccountResult> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) {
    return { success: false, error: 'Sign in first.' };
  }

  try {
    const response = await fetch(`${API_URL}/api/mobile/account/delete`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
    });
    const body = (await response.json().catch(() => null)) as DeleteAccountResult | null;
    if (body && typeof body === 'object' && 'success' in body) {
      return body;
    }
    return { success: false, error: "We couldn't delete your account. Please try again." };
  } catch {
    return {
      success: false,
      error: 'Could not reach AIR/Rally. Check your connection and try again.',
    };
  }
}
