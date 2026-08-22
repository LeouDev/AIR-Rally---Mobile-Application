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
 */
export function captureFatalError(error: unknown): ErrorReport {
  const report = buildReport(error);

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
