import { supabase } from '@/lib/supabase';

/**
 * The one Next.js call in the whole app (see the web repo's
 * app/api/mobile/checkout/route.ts): PayMongo Checkout Sessions need the
 * server's secret key, so booking+payment starts there — authenticated by
 * the Supabase access token as a bearer header, never cookies. Everything
 * else (availability, booking reads) goes straight to Supabase under RLS.
 */
const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'https://air-rally.com';

export type CheckoutOutcome = {
  url: string;
  bookingId: string;
  /** Centavos settled from the AIR/Rally Credits wallet. */
  creditApplied: number;
  /** Centavos PayMongo will collect; 0 means the booking is already
   * confirmed (credit-only) and no browser step is needed. */
  amountDue: number;
};

export type CheckoutResult =
  | { success: true; data: CheckoutOutcome }
  | { success: false; error: string };

export async function createCheckoutSession(input: {
  courtId: string;
  startTime: string;
  endTime: string;
}): Promise<CheckoutResult> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) {
    return { success: false, error: 'Sign in to book a court.' };
  }

  try {
    const response = await fetch(`${API_URL}/api/mobile/checkout`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify(input),
    });
    const body = (await response.json().catch(() => null)) as CheckoutResult | null;
    if (body && typeof body === 'object' && 'success' in body) {
      return body;
    }
    return { success: false, error: "We couldn't start checkout. Please try again." };
  } catch {
    return {
      success: false,
      error: 'Could not reach AIR/Rally. Check your connection and try again.',
    };
  }
}
