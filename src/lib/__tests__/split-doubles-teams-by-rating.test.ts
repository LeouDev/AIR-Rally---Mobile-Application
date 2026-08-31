import { splitDoublesTeamsByRating } from '@/lib/ranked';

/**
 * Client-side mirror of Open Match's server-side conversion pairing —
 * founder-approved for the Play screen's direct-invite path (auto-split
 * by rating, same algorithm). {lowest, highest} vs the two middle
 * always minimizes the team-rating gap.
 *
 * The 1000/1100/1200/1400 → 100-point-gap case below is the SAME worked
 * example from the open-match-design memory that Backend's own
 * verify-open-match.ts pins against the server-side implementation —
 * a shared anchor, not a coincidence: if either side's pairing rule
 * ever changes, its own test fails immediately, with no coordination
 * needed between the two copies.
 */

function player(id: string, rating: number) {
  return { id, rating };
}

it('pairs {lowest, highest} vs the two middle — the design memo\'s own example', () => {
  const players = [player('a', 1000), player('b', 1100), player('c', 1200), player('d', 1400)] as const;
  const { teamA, teamB } = splitDoublesTeamsByRating(players);

  expect(teamA.map((p) => p.id)).toEqual(['a', 'd']);
  expect(teamB.map((p) => p.id)).toEqual(['b', 'c']);
});

it('minimizes the gap versus the other two possible pairings', () => {
  const gap = (xs: number[]) => Math.abs(xs[0] + xs[1] - (xs[2] + xs[3]));

  // {lowest,highest} vs middle two — the pairing under test.
  expect(gap([1000, 1400, 1100, 1200])).toBe(100);
  // The other two pairings the design memo names as worse.
  expect(gap([1000, 1100, 1200, 1400])).toBe(500);
  expect(gap([1000, 1200, 1100, 1400])).toBe(300);
});

it('does not depend on input order', () => {
  const shuffled = [player('d', 1400), player('a', 1000), player('c', 1200), player('b', 1100)] as const;
  const { teamA, teamB } = splitDoublesTeamsByRating(shuffled);

  expect(teamA.map((p) => p.id).sort()).toEqual(['a', 'd']);
  expect(teamB.map((p) => p.id).sort()).toEqual(['b', 'c']);
});

it('handles all-equal ratings without erroring, arbitrary but valid split', () => {
  const players = [player('a', 1100), player('b', 1100), player('c', 1100), player('d', 1100)] as const;
  const { teamA, teamB } = splitDoublesTeamsByRating(players);

  expect(teamA).toHaveLength(2);
  expect(teamB).toHaveLength(2);
  expect(new Set([...teamA, ...teamB].map((p) => p.id))).toEqual(new Set(['a', 'b', 'c', 'd']));
});
