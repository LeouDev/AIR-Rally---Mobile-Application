/**
 * Which AIR/Rally backend this build is actually talking to.
 *
 * Derived from EXPO_PUBLIC_SUPABASE_URL rather than a separate
 * EXPO_PUBLIC_ENV flag on purpose: a flag is a second source of truth
 * that can disagree with the URL, and the one thing this module exists
 * to guarantee is that it can never be wrong about which database is on
 * the other end. The project ref IS the environment.
 *
 * Nothing here is a secret. The project ref and the publishable key ship
 * inside every binary by design — RLS is the security boundary, not the
 * obscurity of the URL.
 */

export type AppEnvironment = 'production' | 'staging' | 'unknown';

/** Supabase project refs, as they appear in `https://<ref>.supabase.co`. */
const ENVIRONMENT_BY_PROJECT_REF: Record<string, AppEnvironment> = {
  hrpbjudsrqcgyrkkodop: 'production',
  vdxdmtsnptzodabaojlc: 'staging',
};

/**
 * Parsed rather than pattern-matched against the raw string: `hostname`
 * ends where the host ends, so `<ref>.supabase.co.somewhere-else.test`
 * cannot be read as `<ref>` the way a non-anchored regex on the whole
 * URL would. This function decides whether a build gets to call itself
 * production, so a lookalike host has to come back null.
 */
export function projectRefFrom(supabaseUrl: string | undefined): string | null {
  if (!supabaseUrl) return null;
  try {
    const { protocol, hostname } = new URL(supabaseUrl);
    if (protocol !== 'https:') return null;
    return hostname.toLowerCase().match(/^([a-z0-9]+)\.supabase\.co$/)?.[1] ?? null;
  } catch {
    return null;
  }
}

export function environmentFor(supabaseUrl: string | undefined): AppEnvironment {
  const ref = projectRefFrom(supabaseUrl);
  return (ref && ENVIRONMENT_BY_PROJECT_REF[ref]) || 'unknown';
}

/** True only for a host we positively recognise as the production web
 * app. Anything else — localhost, a LAN IP, a preview domain — is not
 * production, and an unparseable value is treated as not production so
 * the mismatch check below fails safe rather than staying quiet. */
export function isProductionApi(apiUrl: string | undefined): boolean {
  if (!apiUrl) return false;
  try {
    const host = new URL(apiUrl).hostname.toLowerCase();
    return host === 'air-rally.com' || host === 'www.air-rally.com';
  } catch {
    return false;
  }
}

export type EnvironmentStatus = {
  environment: AppEnvironment;
  projectRef: string | null;
  apiUrl: string | undefined;
  isProduction: boolean;
  /**
   * The API base and the Supabase project disagree about which
   * environment they belong to. A Supabase access token is only valid
   * against the project that issued it, so in this state every
   * /api/mobile/* call — checkout, cancel, reschedule, account deletion
   * — 401s. Reads keep working, which is exactly what makes it easy to
   * miss until someone tries to pay.
   */
  hasApiMismatch: boolean;
};

export function describeEnvironment(
  supabaseUrl: string | undefined = process.env.EXPO_PUBLIC_SUPABASE_URL,
  apiUrl: string | undefined = process.env.EXPO_PUBLIC_API_URL
): EnvironmentStatus {
  const environment = environmentFor(supabaseUrl);
  const apiIsProduction = isProductionApi(apiUrl);
  return {
    environment,
    projectRef: projectRefFrom(supabaseUrl),
    apiUrl,
    isProduction: environment === 'production',
    hasApiMismatch: (environment === 'production') !== apiIsProduction,
  };
}

/** Short label for the in-app badge: "STAGING", "UNKNOWN BACKEND". */
export function environmentLabel(status: EnvironmentStatus): string {
  if (status.environment === 'unknown') {
    return status.projectRef ? `UNKNOWN BACKEND · ${status.projectRef}` : 'NO BACKEND CONFIGURED';
  }
  return status.environment.toUpperCase();
}
