import { rankedStakes, ratingImpact } from '@/lib/ranked';

/**
 * 20260810000100's freeze is decided per PARTICIPANT, not per match — in
 * a mixed doubles lobby one player can be frozen while their partner
 * still calibrates normally on the same result. A single match-level
 * message would be right for one of them and wrong for the other half
 * the time, so these pure helpers take the CURRENT PLAYER's own
 * calibration state, not just the match's rated flag. That distinction
 * is the entire point of this file.
 */

describe('rankedStakes', () => {
  it('labels a casual match plainly, regardless of calibration or booking', () => {
    expect(rankedStakes({ rated: false, booked: true, isCalibrated: true })).toMatchObject({
      headline: 'Casual',
      tone: 'neutral',
    });
    expect(rankedStakes({ rated: false, booked: false, isCalibrated: false })).toMatchObject({
      headline: 'Casual',
      tone: 'neutral',
    });
  });

  it('tells a still-calibrating player this counts, with no booking needed', () => {
    const stakes = rankedStakes({ rated: true, booked: false, isCalibrated: false });
    expect(stakes.headline).toBe('Ranked');
    expect(stakes.detail).toContain('calibration');
    expect(stakes.detail).not.toContain('half rate');
  });

  it("still counts toward calibration for an unbooked match even if booked status hasn't resolved yet", () => {
    // isCalibrated is checked first — an uncalibrated player's answer
    // never depends on knowing bookedness, so a still-loading `booked`
    // (undefined) must not block or change this message.
    const stakes = rankedStakes({ rated: true, booked: undefined, isCalibrated: false });
    expect(stakes.detail).toContain('calibration');
  });

  it('warns a calibrated player their rating moves at half rate on an unbooked ranked match — the discounted case', () => {
    const stakes = rankedStakes({ rated: true, booked: false, isCalibrated: true });
    expect(stakes.tone).toBe('warning');
    expect(stakes.detail).toContain('half rate');
    expect(stakes.detail).toContain('Book a court');
  });

  it('gives a calibrated player on a booked match the plain counts-normally message', () => {
    const stakes = rankedStakes({ rated: true, booked: true, isCalibrated: true });
    expect(stakes.tone).toBe('neutral');
    expect(stakes.detail).not.toContain('half rate');
  });
});

describe('ratingImpact', () => {
  it('reports "casual" for an unrated match, even if this player somehow has a delta', () => {
    // Should never happen server-side (087's early-out never writes one),
    // but the classifier's OWN precedence — rated flag before delta — is
    // what this test pins, not a claim about server behavior.
    expect(ratingImpact({ rated: false }, { rating_delta: 5 })).toEqual({ kind: 'none', reason: 'casual' });
  });

  it('reports "frozen" for a rated match where this player has no delta', () => {
    expect(ratingImpact({ rated: true }, { rating_delta: null })).toEqual({ kind: 'none', reason: 'frozen' });
  });

  it('reports "applied" for a rated match where this player has a real delta', () => {
    expect(ratingImpact({ rated: true }, { rating_delta: -8 })).toEqual({ kind: 'applied' });
  });

  it('does not conflate a frozen player with a casual match — the two must stay distinguishable', () => {
    const frozen = ratingImpact({ rated: true }, { rating_delta: null });
    const casual = ratingImpact({ rated: false }, { rating_delta: null });
    expect(frozen).not.toEqual(casual);
  });
});
