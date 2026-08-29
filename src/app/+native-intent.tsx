import { webPathToAppPath } from '@/lib/deep-link-target';

/**
 * Rewrites incoming Universal Links to routes this app can render.
 *
 * The mapping lives in lib/deep-link-target.ts so it can be unit-tested
 * without expo-router — this file is the thin, hard-to-test half and is
 * kept deliberately trivial. expo-router's own documentation warns that
 * throwing inside redirectSystemPath "may result in app crashes", so the
 * only logic here is a guard: any failure hands back the original path
 * and the user lands on not-found, which is the state they'd have been
 * in anyway. A tapped link must never be able to crash the app.
 */
export function redirectSystemPath({ path }: { path: string; initial: boolean }): string {
  try {
    return webPathToAppPath(path);
  } catch {
    return path;
  }
}
