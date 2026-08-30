import { disambiguatedFirstName, type RankedMatchParticipant } from '@/lib/ranked';

/**
 * 32 confirmed live: the result screen and the live scoreboard both
 * truncate to first-name-only, and two teammates who happen to share a
 * first name collapse into "QA · QA" — indistinguishable, not an edge
 * case in the Philippines. Founder's own call on the fallback: last
 * initial, not a full surname. Disambiguates against the WHOLE match's
 * players (not just one team), so an opponent sharing a name gets the
 * same treatment as a teammate sharing one.
 */

function player(overrides: Partial<Pick<RankedMatchParticipant, 'user_id' | 'profile'>>): Pick<RankedMatchParticipant, 'user_id' | 'profile'> {
  return {
    user_id: 'p1',
    profile: { id: 'p1', display_name: 'Leou', avatar_url: null },
    ...overrides,
  };
}

it('returns the plain first name when nobody else in the match shares it', () => {
  const players = [player({}), player({ user_id: 'p2', profile: { id: 'p2', display_name: 'Robin', avatar_url: null } })];
  expect(disambiguatedFirstName(players[0], players)).toBe('Leou');
});

it('appends a last initial when two teammates share a first name', () => {
  const players = [
    player({ user_id: 'p1', profile: { id: 'p1', display_name: 'Juan Santos', avatar_url: null } }),
    player({ user_id: 'p2', profile: { id: 'p2', display_name: 'Juan Reyes', avatar_url: null } }),
  ];
  expect(disambiguatedFirstName(players[0], players)).toBe('Juan S.');
  expect(disambiguatedFirstName(players[1], players)).toBe('Juan R.');
});

it('initials the LAST word of a multi-word surname — "Dela Cruz" initials as C., not D.', () => {
  const players = [
    player({ user_id: 'p1', profile: { id: 'p1', display_name: 'Juan Dela Cruz', avatar_url: null } }),
    player({ user_id: 'p2', profile: { id: 'p2', display_name: 'Juan Reyes', avatar_url: null } }),
  ];
  expect(disambiguatedFirstName(players[0], players)).toBe('Juan C.');
});

it('disambiguates across teams, not just within one', () => {
  // Team A's Juan and Team B's Juan — the reported bug was same-team,
  // but the same confusion applies across the net.
  const players = [
    player({ user_id: 'a1', profile: { id: 'a1', display_name: 'Juan Santos', avatar_url: null } }),
    player({ user_id: 'a2', profile: { id: 'a2', display_name: 'Robin Cruz', avatar_url: null } }),
    player({ user_id: 'b1', profile: { id: 'b1', display_name: 'Juan Bautista', avatar_url: null } }),
    player({ user_id: 'b2', profile: { id: 'b2', display_name: 'Alex Tan', avatar_url: null } }),
  ];
  expect(disambiguatedFirstName(players[0], players)).toBe('Juan S.');
  expect(disambiguatedFirstName(players[2], players)).toBe('Juan B.');
  expect(disambiguatedFirstName(players[1], players)).toBe('Robin');
  expect(disambiguatedFirstName(players[3], players)).toBe('Alex');
});

it('falls back to the plain first name when a colliding player has no last name to initial', () => {
  const players = [
    player({ user_id: 'p1', profile: { id: 'p1', display_name: 'Juan', avatar_url: null } }),
    player({ user_id: 'p2', profile: { id: 'p2', display_name: 'Juan Reyes', avatar_url: null } }),
  ];
  expect(disambiguatedFirstName(players[0], players)).toBe('Juan');
});

it('returns an em dash placeholder for a player with no profile name', () => {
  const players = [player({ profile: null })];
  expect(disambiguatedFirstName(players[0], players)).toBe('—');
});

it('does not treat a player as colliding with themself', () => {
  const players = [player({})];
  expect(disambiguatedFirstName(players[0], players)).toBe('Leou');
});
