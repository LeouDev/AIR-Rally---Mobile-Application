import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { Platform } from 'react-native';

import { describeEnvironment } from '@/lib/environment';

/**
 * The single seam every unrecoverable error passes through.
 *
 * There is deliberately no crash-reporting SDK wired in yet: a provider
 * needs an account and a DSN that only the operator can create, and an
 * unconfigured SDK is strictly worse than none — it adds native weight
 * to every build and reports nothing. See `captureFatalError` below for
 * the exact one-call spot Sentry (or any equivalent) drops into, and the
 * README for the account steps that have to happen first.
 *
 * Until then this still has to earn its place, because "the app went
 * white and I don't know why" is the state it exists to end. So it
 * captures a structured report, keeps the most recent few in storage so
 * they survive the restart that follows a crash, and can format one as
 * plain text the player can send to support from the fallback screen.
 *
 * Every function here is best-effort and swallows its own failures.
 * This code runs while the app is already broken; a throw from the error
 * reporter would replace a handled crash with an unhandled one.
 */

const STORAGE_KEY = 'airrally.errorReports.v1';
const MAX_STORED_REPORTS = 5;
/** Long enough to swallow a re-entrant capture of the same crash (seen
 * at 18ms), short enough that a genuine crash loop still reports each
 * pass rather than going silent. */
const DEDUPE_WINDOW_MS = 1000;

let lastCapture: { identity: string; at: number; report: ErrorReport } | null = null;

export type ErrorReport = {
  /** ISO timestamp, captured at the moment the boundary caught it. */
  at: string;
  message: string;
  stack: string | null;
  /** "production" / "staging" / "unknown" — which backend was in play. */
  environment: string;
  appVersion: string;
  platform: string;
  platformVersion: string;
};

function buildReport(error: unknown): ErrorReport {
  const status = describeEnvironment();
  const asError = error instanceof Error ? error : null;
  return {
    at: new Date().toISOString(),
    message: asError?.message ?? String(error ?? 'Unknown error'),
    stack: asError?.stack ?? null,
    environment: status.environment,
    appVersion: Constants.expoConfig?.version ?? 'unknown',
    platform: Platform.OS,
    platformVersion: String(Platform.Version),
  };
}

/**
 * Call this from an error boundary — nowhere else needs it.
 *
 * TO ADD SENTRY: install and configure it (see README "Crash
 * reporting"), then add one line here:
 *
 *     Sentry.captureException(error, { extra: report });
 *
 * Nothing else in the app has to change; every fatal error already
 * funnels through this function.
 *
 * WHAT THIS DOES NOT SEE — true today, and still true once Sentry is
 * wired, because Sentry would be fed from here:
 *
 *   - A throw inside an event handler (the `Reserve & pay` press, a
 *     retry tap). React error boundaries only catch errors thrown
 *     during render, commit, or lifecycle — never in a callback.
 *   - A rejected promise in an async handler, which is the shape of
 *     every failed network call in this app. Those surface as caught
 *     errors and toasts, and reach nothing here.
 *   - A throw inside a timer or subscription callback.
 *
 * So "crash reporting is wired" will mean render-phase crashes are
 * visible, not that all failures are. Closing that gap needs a global
 * handler (ErrorUtils.setGlobalHandler and an unhandled-rejection
 * tracker) feeding this same function — deliberately not done yet, so
 * the limit is recorded rather than assumed away. There are tests
 * asserting these limits so the boundary's edges can't be claimed
 * wider than they are.
 */
export function captureFatalError(error: unknown): ErrorReport {
  const report = buildReport(error);

  // One crash must produce one report.
  //
  // Observed on a real dev-client build: a single render throw produced
  // TWO captures 18ms apart. The boundary's fallback is mounted via
  // getDerivedStateFromError, and React re-renders around a caught error
  // in ways that are version- and mode-dependent — the jest environment
  // captures once, the dev client twice.
  //
  // Deduped rather than explained. Proving "this cannot happen in a
  // production build" needs a production build to prove it on, and the
  // cost of being wrong is a doubled crash-reporting bill and a halved
  // free-tier quota once Sentry is wired at this seam. Identity is
  // message + stack, so two genuinely different crashes in the same
  // instant are still both recorded, while the same crash re-entering is
  // recorded once and the caller still gets its report back.
  const identity = `${report.message}\n${report.stack ?? ''}`;
  const at = Date.now();
  if (lastCapture && lastCapture.identity === identity && at - lastCapture.at < DEDUPE_WINDOW_MS) {
    return lastCapture.report;
  }
  lastCapture = { identity, at, report };

  // Kept in production builds on purpose. It is the only channel that
  // exists today, and a crash visible in a device log is worth more than
  // a silent one — the report carries no personal data, only the error
  // and the build's own identity.
  console.error('[air-rally] fatal error', JSON.stringify(report));

  void persistReport(report);
  return report;
}

async function persistReport(report: ErrorReport): Promise<void> {
  try {
    const existing = await listRecentReports();
    // Newest first, oldest evicted — a crash loop must not grow storage
    // without bound.
    const next = [report, ...existing].slice(0, MAX_STORED_REPORTS);
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Storage is unavailable or full. The console line above already
    // went out; losing the persisted copy is not worth a second crash.
  }
}

export async function listRecentReports(): Promise<ErrorReport[]> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as ErrorReport[]) : [];
  } catch {
    return [];
  }
}

export async function clearReports(): Promise<void> {
  lastCapture = null;
  try {
    await AsyncStorage.removeItem(STORAGE_KEY);
  } catch {
    // Nothing to do — the cap above keeps this bounded regardless.
  }
}

/**
 * Plain text for the share sheet, so a player who hits this can hand
 * support something actionable. Deliberately NOT what the fallback
 * screen displays: the stack is diagnostic detail, useful to an engineer
 * and alarming to everyone else, so it travels only when the player
 * chooses to send it.
 */
export function formatReportForSupport(report: ErrorReport): string {
  return [
    'AIR/Rally error report',
    `Time: ${report.at}`,
    `App version: ${report.appVersion}`,
    `Platform: ${report.platform} ${report.platformVersion}`,
    `Environment: ${report.environment}`,
    '',
    `Error: ${report.message}`,
    '',
    report.stack ?? '(no stack trace)',
  ].join('\n');
}
