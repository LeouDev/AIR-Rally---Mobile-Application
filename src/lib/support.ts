import type { SupportCategory, SupportRequest, SupportStatus } from '@/lib/database.types';
import { supabase } from '@/lib/supabase';

/**
 * Support requests — the mobile half of the web's /support page. Kept in
 * lockstep with the web repo's lib/services/reports.ts and
 * components/trust/SupportForm.tsx: same categories, same validation
 * bounds, same labels, same refusal wording, so the same request reads
 * identically wherever it was raised.
 */

/** Web parity: SUPPORT_CATEGORIES + SUPPORT_CATEGORY_LABELS in the web
 * repo's lib/validations/report.ts. Order matters — it's the order the
 * web presents them in. */
export const SUPPORT_CATEGORIES: { value: SupportCategory; label: string }[] = [
  { value: 'booking', label: 'A booking' },
  { value: 'payment', label: 'A payment' },
  { value: 'account', label: 'My account' },
  { value: 'venue', label: 'My venue' },
  { value: 'safety', label: 'Safety concern' },
  { value: 'bug', label: 'Something is broken' },
  { value: 'other', label: 'Something else' },
];

/** Web parity: STATUS_LABELS in the web's support page. "Being looked
 * at" rather than "In progress" is the web's own wording. */
export const SUPPORT_STATUS_LABELS: Record<SupportStatus, string> = {
  open: 'Open',
  in_progress: 'Being looked at',
  resolved: 'Resolved',
  closed: 'Closed',
};

/** Matches the web's createSupportRequestSchema exactly. The database
 * CHECK allows a 1-character message; the web asks for 20 before it will
 * send, because a one-word support request cannot be acted on. Diverging
 * here would let the app send something the web would have refused. */
export const SUBJECT_MAX = 200;
export const MESSAGE_MIN = 20;
export const MESSAGE_MAX = 4000;

/**
 * The one refusal a user can act on. Mirrors the web's ReportError
 * including its wording, so hitting the limit reads the same on both
 * clients.
 */
export class SupportError extends Error {
  constructor(
    public reason: 'rate_limited',
    message: string
  ) {
    super(message);
    this.name = 'SupportError';
  }
}

/**
 * The rate-limit trigger raises check_violation (23514) — the same code
 * as every ordinary CHECK on this table (category, subject length,
 * message length). Matching on the code alone would report an
 * over-length subject as "you've messaged us a lot today", so the
 * message text is what distinguishes it, exactly as the web does.
 */
function isRateLimit(error: { code?: string; message?: string }): boolean {
  return /rate limit reached/i.test(error.message ?? '');
}

/** Web parity: listMySupportRequests. RLS already scopes rows to the
 * requester (or an admin); the explicit user_id filter matches the web
 * and keeps an admin's own view to their own requests here. */
export async function listMySupportRequests(userId: string): Promise<SupportRequest[]> {
  const { data, error } = await supabase
    .from('support_requests')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(20);
  if (error) throw error;
  return data ?? [];
}

export type CreateSupportRequestInput = {
  category: SupportCategory;
  subject: string;
  message: string;
};

/**
 * Raises a support request as the signed-in user.
 *
 * Throws rather than returning a result union, for the same reason
 * createReport does: someone contacting support is already having a bad
 * time, and a submission that silently fails leaves them believing
 * they've been heard when nothing was written. A caller cannot ignore a
 * throw the way it can ignore a falsy field.
 *
 * The rate limit is 5 per day (rate_limit_threshold('support') in
 * 20260810000049) — checked against the migration, not assumed.
 */
export async function createSupportRequest(
  userId: string,
  input: CreateSupportRequestInput
): Promise<SupportRequest> {
  const { data, error } = await supabase
    .from('support_requests')
    .insert({
      user_id: userId,
      category: input.category,
      subject: input.subject.trim(),
      message: input.message.trim(),
    })
    .select('*')
    .single();

  if (error) {
    if (isRateLimit(error)) {
      throw new SupportError(
        'rate_limited',
        "You've sent us several messages today. We'll reply to those first."
      );
    }
    throw error;
  }

  // PostgREST returns the inserted row; if it somehow didn't, the
  // request is not provably written and must not be reported as sent.
  if (!data) throw new Error('Support request insert returned no row');
  return data;
}
