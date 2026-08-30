import { matchStatusLabel } from '@/lib/ranked';

/**
 * d0 nearly shipped a migration adding a new ranked_matches.status value
 * ('expired') before catching that both places that switch on status
 * have no default — matchStatusLabel() would return undefined here, and
 * [matchId].tsx's render switch would crash with "Nothing was returned
 * from render" for any client whose TypeScript union doesn't know about
 * the new value. A new COLUMN is invisible to an old client; a new ENUM
 * VALUE a client switches on is not — the database should never need a
 * coordinated client release just to add a status. This pins the
 * degrade-gracefully behavior directly, independent of whether a new
 * status ever actually ships.
 */

it('returns a real string, not undefined, for a status this build does not recognize', () => {
  const label = matchStatusLabel({ status: 'expired' as never });

  expect(typeof label).toBe('string');
  expect(label.length).toBeGreaterThan(0);
});
