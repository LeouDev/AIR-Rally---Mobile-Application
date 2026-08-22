import { captureFatalError, clearReports, listRecentReports } from '@/lib/error-reporting';

/**
 * One crash must produce exactly one report.
 *
 * Found by running the app, not the suite: a single render throw on a
 * real dev-client build produced TWO captures 18ms apart, while the same
 * throw in this jest environment captured once. Since Sentry is wired at
 * this seam and its free tier is 5,000 events/month, a re-entrant
 * capture is a halved quota rather than a cosmetic duplicate.
 *
 * These tests pin the guarantee at the seam, so it holds regardless of
 * which React version or mode is doing the re-rendering — which is the
 * point, because "it can't happen in production" would need a production
 * build to establish and would go stale on the next React upgrade.
 */

beforeEach(async () => {
  await clearReports();
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

/** persistReport is fire-and-forget by design (it must never make a
 * crash worse by throwing), so storage assertions have to let its two
 * awaits land first. */
const flush = () => new Promise<void>((resolve) => {
  setImmediate(() => resolve());
});

/** Two Error objects that are distinct instances but identical content —
 * what a re-render produces, and the case a naive `error === last` check
 * would miss. */
function sameCrash() {
  const e = new Error('PostgrestException: connection terminated unexpectedly');
  e.stack = 'Error: PostgrestException: connection terminated unexpectedly\n    at LeaderboardScreen (leaderboard.tsx:32)';
  return e;
}

describe('captureFatalError dedupe', () => {
  it('records one report when the same crash re-enters immediately', async () => {
    captureFatalError(sameCrash());
    captureFatalError(sameCrash());
    await flush();

    expect(await listRecentReports()).toHaveLength(1);
  });

  it('returns the same report object to both callers', () => {
    // The fallback screen renders the reference from this return value,
    // so a suppressed capture must still hand back something usable
    // rather than a fresh report that was never persisted.
    const first = captureFatalError(sameCrash());
    const second = captureFatalError(sameCrash());

    expect(second).toBe(first);
    expect(second.at).toBe(first.at);
  });

  it('logs to the console only once', () => {
    captureFatalError(sameCrash());
    captureFatalError(sameCrash());

    // This is the line Sentry.captureException sits beside — if it fired
    // twice, so would Sentry.
    expect(console.error).toHaveBeenCalledTimes(1);
  });

  it('still records two genuinely different crashes in the same instant', async () => {
    // Dedupe must not become a filter. Identity is message + stack, so a
    // different failure arriving back to back is its own report.
    captureFatalError(sameCrash());
    await flush();
    captureFatalError(new Error('TypeError: undefined is not an object'));
    await flush();

    const reports = await listRecentReports();
    expect(reports).toHaveLength(2);
    expect(reports[0].message).toContain('TypeError');
  });

  it('records the same crash again once the window has passed', async () => {
    // A real crash loop must stay visible — a user hitting the same
    // failure repeatedly is a signal, not a duplicate.
    // Date.now is spied rather than using fake timers, which would also
    // fake setImmediate and stall the flush above.
    const base = Date.parse('2026-08-23T00:00:00.000Z');
    const clock = jest.spyOn(Date, 'now').mockReturnValue(base);

    captureFatalError(sameCrash());
    await flush();

    clock.mockReturnValue(base + 5_000); // +5s, well past the window
    captureFatalError(sameCrash());
    await flush();

    expect(await listRecentReports()).toHaveLength(2);
  });
});
