import { teamIdentityLabel } from '@/lib/ranked';

/**
 * The founder's own rule, verbatim: "if double should show team name
 * if single just the player name" — keyed on match TYPE, not on
 * whether a name happens to be set. Singles never shows a team name
 * even if one somehow existed on the row; a doubles team with nothing
 * chosen falls back to player names, the same shape as before team
 * identity existed at all.
 */

describe('teamIdentityLabel', () => {
  it('shows the player name(s) for singles, even if a team name is somehow set', () => {
    const result = teamIdentityLabel({
      matchType: 'singles',
      teamName: 'Should never show',
      club: { id: 'club-1', name: 'Should also never show' },
      playerNames: 'Robin',
    });
    expect(result).toEqual({ kind: 'players', label: 'Robin' });
  });

  it('prefers the club over a custom name when both are somehow present', () => {
    // Mutually exclusive at the database CHECK constraint — this pins
    // the classifier's OWN precedence, not a claim about server data.
    const result = teamIdentityLabel({
      matchType: 'doubles',
      teamName: 'The Smashers',
      club: { id: 'club-1', name: 'Rally Point' },
      playerNames: 'Leou & Sam',
    });
    expect(result).toEqual({ kind: 'club', label: 'Rally Point', clubId: 'club-1' });
  });

  it('shows a custom team name for doubles when no club is chosen', () => {
    const result = teamIdentityLabel({
      matchType: 'doubles',
      teamName: 'The Smashers',
      club: null,
      playerNames: 'Leou & Sam',
    });
    expect(result).toEqual({ kind: 'custom', label: 'The Smashers' });
  });

  it('falls back to player names for an UNNAMED doubles team — nobody chose an identity yet', () => {
    const result = teamIdentityLabel({
      matchType: 'doubles',
      teamName: null,
      club: null,
      playerNames: 'Leou & Sam',
    });
    expect(result).toEqual({ kind: 'players', label: 'Leou & Sam' });
  });
});
