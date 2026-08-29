import { render, screen } from '@testing-library/react-native';
import React from 'react';

import { ResultPhase } from '@/components/ranked/match/result-phase';
import type { RankedMatch } from '@/lib/database.types';
import type { RankedMatchDetail, RankedMatchParticipant } from '@/lib/ranked';

/**
 * A casual match renders NOTHING where the rank/tier/ARR card normally
 * goes — `me.tier_after !== null` is false, since apply_ranked_result()
 * never writes it for anyone in a `rated: false` match. A silent gap
 * where a card usually is reads as the app forgetting, not as a
 * deliberate "this one doesn't count," so the fallback says CASUAL
 * rather than showing nothing.
 *
 * A discounted player is different: 20260810000100's old full freeze (a
 * null rating_delta AND null tier_after on an otherwise-rated match) is
 * retired — 20260810000112 supersedes it, and every rated participant
 * gets a real, normal tier/rating snapshot now, just at half size when
 * they were already calibrated and the match had no booking behind it.
 * So a discounted player hits the NORMAL rank/ARR card above, not this
 * fallback — with an extra caption saying it was halved.
 */

jest.mock('react-native-view-shot', () => ({ captureRef: jest.fn().mockResolvedValue('file:///x.png') }));
jest.mock('@/lib/share', () => ({ shareCard: jest.fn() }));

function matchFixture(overrides: Partial<RankedMatch> = {}): RankedMatch {
  return {
    id: 'match-1',
    season_id: 1,
    event_id: null,
    court_id: null,
    venue_id: null,
    match_type: 'singles',
    match_weight_type: 'air_rally_ranked',
    team_a_name: null,
    team_a_club_id: null,
    team_b_name: null,
    team_b_club_id: null,
    rated: true,
    status: 'confirmed',
    officiating_mode: null,
    scorekeeper_id: null,
    target_score: 11,
    win_by: 2,
    score_a: 11,
    score_b: 8,
    serving_team: 'a',
    scoring_mode: 'rally',
    server_number: null,
    first_service_turn_used: false,
    winning_team: 'a',
    rank_applied: true,
    dispute_reason: null,
    created_by: 'me',
    created_at: '2026-08-20T00:00:00.000Z',
    started_at: '2026-08-20T00:00:00.000Z',
    completed_at: '2026-08-20T00:10:00.000Z',
    confirmed_at: '2026-08-20T00:11:00.000Z',
    updated_at: '2026-08-20T00:11:00.000Z',
    ...overrides,
  };
}

function participant(overrides: Partial<RankedMatchParticipant> = {}): RankedMatchParticipant {
  return {
    match_id: 'match-1',
    user_id: 'me',
    team: 'a',
    is_host: true,
    mode: 'singles',
    ready: true,
    ready_at: null,
    officiating_vote: true,
    result_response: 'accepted',
    dispute_reason: null,
    rating_before: null,
    rating_after: null,
    rating_delta: null,
    tier_before: null,
    pips_before: null,
    tier_after: null,
    pips_after: null,
    pip_delta: null,
    star_protected: false,
    expected_score: null,
    actual_score: null,
    performance_gap: null,
    match_weight: null,
    recency_multiplier: null,
    reliability_modifier: null,
    rating_discounted: false,
    created_at: '2026-08-20T00:00:00.000Z',
    profile: { id: 'me', display_name: 'Leou', avatar_url: null },
    rank: null,
    ...overrides,
  };
}

function detail(match: RankedMatch, me: RankedMatchParticipant): RankedMatchDetail {
  const opponent = participant({ user_id: 'opp', team: 'b', is_host: false, profile: { id: 'opp', display_name: 'Robin', avatar_url: null } });
  return { ...match, players: [me, opponent], scorekeeper: null, team_a_club: null, team_b_club: null };
}

describe('ResultPhase — ConfirmedView rating-impact messaging', () => {
  it("labels a whole casual match as CASUAL, not silence", async () => {
    const me = participant();
    await render(<ResultPhase match={detail(matchFixture({ rated: false }), me)} currentUserId="me" />);

    await screen.findByText('CASUAL');
    expect(screen.getByText("Recorded, but this doesn't affect anyone's rating.")).toBeTruthy();
  });

  it('shows the normal rank card, not the no-impact message, when a real delta was applied', async () => {
    const me = participant({
      tier_before: 3,
      pips_before: 5,
      tier_after: 4,
      pips_after: 1,
      rating_before: 1190,
      rating_after: 1210,
      rating_delta: 20,
    });
    await render(<ResultPhase match={detail(matchFixture({ rated: true }), me)} currentUserId="me" />);

    await screen.findByText('RANK UP');
    expect(screen.queryByText('CASUAL')).toBeNull();
    expect(screen.queryByText('NO RATING IMPACT')).toBeNull();
    expect(screen.queryByText(/half rate/i)).toBeNull();
  });

  it('shows the normal rank card WITH a half-rate caption for a discounted player — not the fallback card', async () => {
    const me = participant({
      tier_before: 3,
      pips_before: 5,
      tier_after: 3,
      pips_after: 1,
      rating_before: 1190,
      rating_after: 1194,
      rating_delta: 4,
      rating_discounted: true,
    });
    await render(<ResultPhase match={detail(matchFixture({ rated: true }), me)} currentUserId="me" />);

    await screen.findByText('RANK IMPACT');
    expect(screen.queryByText('CASUAL')).toBeNull();
    expect(screen.queryByText('NO RATING IMPACT')).toBeNull();
    expect(screen.getByText(/half rate/i)).toBeTruthy();
  });
});
