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
    // `onunhandledrejection` catches rejected promises, which is the
    // shape of every failed network call in this app. Without them
    // Sentry sees only render-phase crashes — a small fraction of how
    // this app actually fails.
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

export { Sentry };
