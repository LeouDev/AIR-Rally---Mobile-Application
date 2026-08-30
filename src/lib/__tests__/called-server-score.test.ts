import { calledServerScore } from '@/lib/ranked';

/**
 * The three-number score call for side-out doubles — "0-0-2". d0's
 * exact catch: the first two numbers are SERVING then RECEIVING, not
 * team A then team B. A fixture that only ever has team A serving would
 * pass a naive score_a/score_b implementation too — every case here
 * specifically covers serving_team: 'b', where that bug shows up as a
 * plausible-looking but backwards call (5-3 with B serving would read
 * "3-5-1" under the broken version, not "5-3-1").
 */

function match(overrides: Partial<Parameters<typeof calledServerScore>[0]>) {
  return {
    score_a: 0,
    score_b: 0,
    serving_team: 'a' as const,
    server_number: null,
    first_service_turn_used: false,
    ...overrides,
  };
}

describe('calledServerScore', () => {
  it('calls "0-0-2" on a fresh game — the opening turn, server_number null', () => {
    expect(calledServerScore(match({}))).toBe('0-0-2');
  });

  it('orders serving score first when team A is serving', () => {
    const m = match({ score_a: 5, score_b: 3, serving_team: 'a', first_service_turn_used: true, server_number: 1 });
    expect(calledServerScore(m)).toBe('5-3-1');
  });

  it('orders serving score first when team B is serving — not score_a first', () => {
    const m = match({ score_a: 5, score_b: 3, serving_team: 'b', first_service_turn_used: true, server_number: 1 });
    // B is serving with 3; A is receiving with 5. The call is 3-5-1, not
    // 5-3-1 — this is exactly the bug a serving_team: 'a'-only fixture
    // would never catch.
    expect(calledServerScore(m)).toBe('3-5-1');
  });

  it('calls the opening turn "2" even mid-game if it somehow has not been used yet', () => {
    const m = match({ score_a: 2, score_b: 1, serving_team: 'b', first_service_turn_used: false, server_number: null });
    expect(calledServerScore(m)).toBe('1-2-2');
  });

  it('calls the second server\'s actual number once the opening exception is spent', () => {
    const m = match({ score_a: 4, score_b: 6, serving_team: 'a', first_service_turn_used: true, server_number: 2 });
    expect(calledServerScore(m)).toBe('4-6-2');
  });
});
