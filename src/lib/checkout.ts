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

type ApiResult<T> = { success: true; data: T } | { success: false; error: string };

async function callApi<T>(
  path: string,
  fallbackError: string,
  payload?: unknown
): Promise<ApiResult<T>> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) {
    return { success: false, error: 'Sign in first.' };
  }

  try {
    const response = await fetch(`${API_URL}${path}`, {
      method: payload === undefined ? 'GET' : 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      ...(payload === undefined ? {} : { body: JSON.stringify(payload) }),
    });
    const body = (await response.json().catch(() => null)) as ApiResult<T> | null;
    if (body && typeof body === 'object' && 'success' in body) {
      return body;
    }
    return { success: false, error: fallbackError };
  } catch {
    return {
      success: false,
      error: 'Could not reach AIR/Rally. Check your connection and try again.',
    };
  }
}

export async function createCheckoutSession(input: {
  courtId: string;
  startTime: string;
  endTime: string;
}): Promise<CheckoutResult> {
  return callApi('/api/mobile/checkout', "We couldn't start checkout. Please try again.", input);
}

export type CancelOutcome = {
  booking: { id: string; status: string };
  /** The server's decision about the customer's money — always shown, so
   * cancelling never reads as "they kept it". */
  credit: { amount: number; eligible: boolean; reason: string; issued: boolean };
};

export async function cancelBookingViaApi(bookingId: string): Promise<ApiResult<CancelOutcome>> {
  return callApi('/api/mobile/cancel', "We couldn't cancel that booking.", { bookingId });
}

/** What the venue offers for a reschedule, or the plain reason one
 * isn't allowed. The rules live server-side (24h cutoff, same venue,
 * fixed duration, once per booking) so they can't drift from the web. */
export type RescheduleOptions = {
  venueId: string;
  venueName: string;
  venueTimezone: string;
  originalDurationMinutes: number;
  originalPriceAmount: number;
  currency: string;
  courts: { id: string; name: string; hourly_price: number; surface_type: string | null }[];
};

export type RescheduleAvailability = {
  eligible: boolean;
  message: string | null;
  options: RescheduleOptions | null;
};

export async function getRescheduleAvailability(
  bookingId: string
): Promise<ApiResult<RescheduleAvailability>> {
  return callApi(
    `/api/mobile/reschedule?bookingId=${encodeURIComponent(bookingId)}`,
    "We couldn't load reschedule options."
  );
}

export type RescheduleOutcome = {
  /** completed = nothing more owed; checkout_required = the new slot
   * costs more and `checkoutUrl` collects the difference;
   * provider_unavailable = payment provider is down, nothing changed. */
  kind: 'completed' | 'checkout_required' | 'provider_unavailable';
  newBookingId: string;
  checkoutUrl: string | null;
};

export async function createReschedule(input: {
  bookingId: string;
  newCourtId: string;
  newStartTime: string;
  newEndTime: string;
}): Promise<ApiResult<RescheduleOutcome>> {
  return callApi('/api/mobile/reschedule', "We couldn't reschedule that booking.", input);
}
