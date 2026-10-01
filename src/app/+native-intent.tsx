import { webPathToAppPath } from '@/lib/deep-link-target';
import { rememberIncomingLink } from '@/lib/pending-link';

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
 *
 * Every incoming link is also remembered (lib/pending-link.ts): if nobody
 * is signed in, the session guard swaps it for the sign-in screen, and
 * the root layout replays it once sign-in completes.
 */
export function redirectSystemPath({ path }: { path: string; initial: boolean }): string {
  try {
    const appPath = webPathToAppPath(path);
    rememberIncomingLink(appPath);
    return appPath;
  } catch {
    return path;
  }
}
