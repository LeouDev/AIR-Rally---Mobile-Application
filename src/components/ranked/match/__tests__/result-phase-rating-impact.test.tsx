import { render, screen } from '@testing-library/react-native';
import React from 'react';

import { ResultPhase } from '@/components/ranked/match/result-phase';
import type { RankedMatch } from '@/lib/database.types';
import type { RankedMatchDetail, RankedMatchParticipant } from '@/lib/ranked';

/**
 * Before this, both cases below rendered NOTHING where the rank/tier/ARR
 * card normally goes — `me.tier_after !== null` is false for both, since
 * apply_ranked_result() never writes it for either. A silent gap where
 * a card usually is reads as the app forgetting, not as a deliberate
 * "this one doesn't count." These pin that the two cases say which of
 * two DIFFERENT reasons it was, since a frozen player played a real
 * ranked match — telling them it was "casual" would be false.
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

  it("labels an individually FROZEN player differently from casual — they played a real ranked match", async () => {
    // rated: true, but this player's row has no delta — the frozen shape.
    const me = participant({ rating_delta: null, tier_after: null });
    await render(<ResultPhase match={detail(matchFixture({ rated: true }), me)} currentUserId="me" />);

    await screen.findByText('NO RATING IMPACT');
    expect(screen.queryByText('CASUAL')).toBeNull();
    expect(screen.getByText(/book a court/i)).toBeTruthy();
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
  });
});
