#!/usr/bin/env node
/**
 * Fails a build whose environment is missing something the app needs but
 * would not visibly complain about.
 *
 * The case that prompted this: EXPO_PUBLIC_SENTRY_DSN was set inline for
 * development, development-device and preview, but the production
 * profile resolves everything from EAS server-side variables and the DSN
 * was never added there. lib/sentry.ts does `if (!DSN) return;`, which is
 * the correct design — an unconfigured SDK should no-op rather than
 * crash — and it is also completely invisible. A production build would
 * have shipped with crash reporting silently off and nothing anywhere
 * saying so.
 *
 * That is a class, not an incident. A missing Supabase URL at least
 * surfaces in-app as "NO BACKEND CONFIGURED"; a missing DSN surfaces as
 * nothing, forever. Anything whose absence degrades silently belongs in
 * REQUIRED below, so the build fails instead of the feature.
 *
 * Runs as eas-build-post-install, so it executes on EAS Build after
 * dependencies are installed and before anything is compiled. Run it by
 * hand against any profile with:
 *
 *   EAS_BUILD_PROFILE=production node scripts/check-build-env.js
 */

/** Env vars every build needs, whatever the profile. */
const REQUIRED_ALWAYS = [
  ['EXPO_PUBLIC_SUPABASE_URL', 'the app cannot reach any backend'],
  ['EXPO_PUBLIC_SUPABASE_KEY', 'every Supabase request will be rejected'],
  ['EXPO_PUBLIC_API_URL', 'checkout, cancel, reschedule and account deletion all fail'],
];

/** Additionally required for builds that reach real users. */
const REQUIRED_FOR_RELEASE = [
  ['EXPO_PUBLIC_SENTRY_DSN', 'crash reporting silently does nothing — see lib/sentry.ts'],
];

/** Profiles that reach real users, and so cannot ship half-configured. */
const RELEASE_PROFILES = new Set(['production', 'preview']);

const profile = process.env.EAS_BUILD_PROFILE ?? '(none)';
const isRelease = RELEASE_PROFILES.has(profile);

const required = [...REQUIRED_ALWAYS, ...(isRelease ? REQUIRED_FOR_RELEASE : [])];
const missing = required.filter(([name]) => !process.env[name]);

console.log(`[check-build-env] profile=${profile} release=${isRelease}`);

if (missing.length > 0) {
  console.error(`\n[check-build-env] MISSING ${missing.length} required variable(s) for profile "${profile}":\n`);
  for (const [name, consequence] of missing) {
    console.error(`  ${name}`);
    console.error(`      without it: ${consequence}\n`);
  }
  console.error('Set them in eas.json for this profile, or as EAS server-side');
  console.error('environment variables:  eas env:create --environment production\n');
  console.error('Verify with:  eas env:list --environment production\n');
  process.exit(1);
}

console.log(`[check-build-env] all ${required.length} required variables present`);
