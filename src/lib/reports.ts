import type { Report, ReportReason, ReportTargetType } from '@/lib/database.types';
import { supabase } from '@/lib/supabase';

export const REPORT_REASONS: readonly ReportReason[] = [
  'spam',
  'harassment',
  'hate_speech',
  'sexual_content',
  'violence',
  'misinformation',
  'impersonation',
  'other',
] as const;

/** Same strings and same order as the web's REPORT_REASON_LABELS
 * (src/lib/validations/report.ts). Two clients disagreeing about what
 * "harassment" means would make the moderation queue incoherent. */
export const REPORT_REASON_LABELS: Record<ReportReason, string> = {
  spam: 'Spam or scam',
  harassment: 'Harassment or bullying',
  hate_speech: 'Hate speech',
  sexual_content: 'Sexual content',
  violence: 'Violence or threats',
  misinformation: 'False information',
  impersonation: 'Pretending to be someone else',
  other: 'Something else',
};

export const REPORT_DETAILS_MAX = 1000;

/**
 * The two rejections a reporter can actually act on, separated from
 * everything else so the sheet can say something true and specific
 * rather than "we couldn't save that".
 *
 * Mirrors the web's ReportError (src/lib/services/reports.ts) including
 * its wording, so the same refusal reads identically on both clients.
 */
export class ReportError extends Error {
  constructor(
    public reason: 'already_reported' | 'rate_limited',
    message: string
  ) {
    super(message);
    this.name = 'ReportError';
  }
}

const UNIQUE_VIOLATION = '23505';

/**
 * The rate-limit trigger raises check_violation (23514) — which is also
 * the code for every ordinary CHECK on this table (target_type, reason,
 * details length). Matching the code alone would report a malformed
 * reason as "you've filed too many reports today", so the message is
 * what distinguishes it, exactly as the web does.
 */
function isRateLimit(error: { code?: string; message?: string }): boolean {
  return /rate limit reached/i.test(error.message ?? '');
}

export type CreateReportInput = {
  targetType: ReportTargetType;
  targetId: string;
  reason: ReportReason;
  details?: string | null;
};

/**
 * Files a report as the signed-in user.
 *
 * RLS enforces reporter_id = auth.uid(), so this does not re-check —
 * same convention as the rest of this app's data layer, the database is
 * the boundary. What it does do is turn the two constraint rejections
 * into typed errors: the partial unique index on OPEN reports (you can
 * report the same thing again once a previous report was resolved, since
 * the target may have got worse), and the 20-per-day rate limit.
 *
 * Throws rather than returning a result union, so a caller cannot
 * accidentally treat a failure as a success by ignoring a field. That
 * matters more here than usual: a report that silently fails leaves
 * someone believing they have been heard when nothing was written.
 */
export async function createReport(reporterId: string, input: CreateReportInput): Promise<Report> {
  const { data, error } = await supabase
    .from('reports')
    .insert({
      reporter_id: reporterId,
      target_type: input.targetType,
      target_id: input.targetId,
      reason: input.reason,
      details: input.details?.trim() ? input.details.trim() : null,
    })
    .select('*')
    .single();

  if (error) {
    if (error.code === UNIQUE_VIOLATION) {
      throw new ReportError('already_reported', "You've already reported this, and we're still looking at it.");
    }
    if (isRateLimit(error)) {
      throw new ReportError('rate_limited', "You've filed a lot of reports today. Please try again tomorrow.");
    }
    throw error;
  }

  // PostgREST returns the inserted row; if it somehow didn't, the report
  // is not provably written and must not be reported as filed.
  if (!data) {
    throw new Error('Report insert returned no row');
  }
  return data;
}
