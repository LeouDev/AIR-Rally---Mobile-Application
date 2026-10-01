import * as Sentry from '@sentry/react-native';

import { describeEnvironment } from '@/lib/environment';

/**
 * Crash reporting.
 *
 * The DSN is a public value by design — it ships inside every binary,
 * the same posture as the Supabase publishable key, and it only permits
 * writing events to one project. It lives in EXPO_PUBLIC_SENTRY_DSN so
 * it follows the same per-environment path as everything else here, and
 * so a build without one degrades to a clean no-op rather than a crash.
 *
 * `environment` is taken from lib/environment, which derives it from the
 * Supabase URL rather than a separate flag — so a staging build cannot
 * file its crashes as production, whatever anyone configured.
 */
const DSN = process.env.EXPO_PUBLIC_SENTRY_DSN;

export function initSentry(): void {
  if (!DSN) return;

  const status = describeEnvironment();

  Sentry.init({
    dsn: DSN,
    environment: status.environment,
    // Dev only. Sentry's transport is otherwise completely silent, so
    // there is no way to tell "captured and sent" from "never fired"
    // without dashboard access — which is exactly the gap that made the
    // coverage claim unverifiable in the first place.
    debug: __DEV__,
    // Errors only. Performance tracing is a separate and much larger
    // volume of events, and the free tier is 5,000/month — turning it on
    // by reflex is how a quota disappears before the first real crash.
    tracesSampleRate: 0,
    // Release-health sessions are their own event stream against the
    // same quota, and nothing at launch reads them. Revisit when someone
    // actually wants crash-free-rate.
    enableAutoSessionTracking: false,
    // The two switches that make this worth having. Both are ALREADY the
    // defaults — verified in the installed SDK, not the docs:
    // integrations/default.js pushes reactNativeErrorHandlersIntegration
    // for every non-web platform, and its own defaults are
    // { onerror: true, onunhandledrejection: true }.
    //
    // Named explicitly anyway, for two reasons: it pins the values
    // against a future SDK version quietly changing a default, and it
    // states in code that they are load-bearing. `onerror` installs
    // ErrorUtils.setGlobalHandler (event-handler throws, timer throws);
    // `onunhandledrejection` catches rejected promises. Without them
    // Sentry sees only render-phase crashes. A failed request is neither:
    // it resolves (with { error }, or as a message) — see reportingFetch
    // below.
    //
    // Passing an array MERGES with the defaults rather than replacing
    // them (@sentry/core integration.js: [...defaultIntegrations,
    // ...userIntegrations], then deduped by name with the user instance
    // winning), so this pins these two without disabling anything else.
    integrations: [
      Sentry.reactNativeErrorHandlersIntegration({
        onerror: true,
        onunhandledrejection: true,
      }),
    ],
  });
}

/** PostgREST/Postgres codes for a request the live schema doesn't know: a
 * column, table, function or relationship this build expects and the
 * database lacks. That's client and schema out of step (AGENTS.md: schema
 * and client ship together), never something the player did. */
const SCHEMA_MISMATCH = new Set(['42703', '42P01', '42883', 'PGRST200', 'PGRST202', 'PGRST204']);
const reportedRequests = new Set<string>();

/**
 * fetch, plus a Sentry event for the failures nothing else reports.
 * supabase-js resolves with { error } instead of rejecting, and the API
 * helpers turn failures into messages, so a failed query or checkout never
 * reaches the global handlers above: the player sees "Couldn't load" and
 * nobody else ever knows. Reported: server errors and schema mismatches.
 * Left to the screen: offline, RLS refusals, business-rule errors. Once
 * per endpoint and failure per launch, so an outage can't spend the
 * month's quota.
 */
export const reportingFetch: typeof fetch = async (input, init) => {
  const response = await fetch(input, init);
  if (response.status >= 400) await reportFailedRequest(response.clone(), input, init?.method);
  return response;
};

async function reportFailedRequest(response: Response, input: RequestInfo | URL, method = 'GET') {
  try {
    const body = (await response.json().catch(() => null)) as { code?: unknown; message?: unknown } | null;
    const code = typeof body?.code === 'string' ? body.code : null;
    if (response.status < 500 && !(code && SCHEMA_MISMATCH.has(code))) return;

    const url = typeof input === 'string' ? input : 'url' in input ? input.url : input.href;
    const path = url
      .split('?')[0]
      .replace(/^https?:\/\/[^/]+/, '')
      .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, ':id');
    const failure = `${method} ${path} → ${response.status}${code ? ` ${code}` : ''}`;
    if (reportedRequests.has(failure)) return;
    reportedRequests.add(failure);

    Sentry.captureMessage(`Request failed: ${failure}`, {
      level: 'error',
      extra: { message: typeof body?.message === 'string' ? body.message : null },
    });
  } catch {
    // Reporting must never be what breaks a request.
  }
}

export { Sentry };
