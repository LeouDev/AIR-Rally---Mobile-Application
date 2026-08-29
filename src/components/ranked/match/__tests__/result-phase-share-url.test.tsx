import { fireEvent, render, screen } from '@testing-library/react-native';
import { Share } from 'react-native';
import React from 'react';

import { ResultPhase } from '@/components/ranked/match/result-phase';
import { shareCard } from '@/lib/share';
import type { RankedMatch } from '@/lib/database.types';
import type { RankedMatchDetail, RankedMatchParticipant } from '@/lib/ranked';

/**
 * The public result page (migration 20260810000107) is what makes a
 * shared link openable by someone without an account — before it existed,
 * `shareResult()` deliberately sent no `url` at all, since the only other
 * candidate route (`/ranked/match/{id}`) is participant-gated and would
 * hand a stranger a login wall. These pin the correct route now that a
 * public one exists, and that the participant-gated one is never it.
 */

jest.mock('react-native-view-shot', () => ({ captureRef: jest.fn() }));
jest.mock('@/lib/share', () => ({ shareCard: jest.fn().mockResolvedValue(undefined) }));

const mockCaptureRef = jest.requireMock('react-native-view-shot').captureRef as jest.Mock;
const mockShareCard = shareCard as jest.MockedFunction<typeof shareCard>;

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

beforeEach(() => {
  jest.clearAllMocks();
});

describe('ResultPhase — ConfirmedView share URL', () => {
  it('shares the public results page, not the participant-gated match route', async () => {
    mockCaptureRef.mockResolvedValue('file:///card.png');
    await render(<ResultPhase match={detail(matchFixture(), participant())} currentUserId="me" />);

    await fireEvent.press(screen.getByLabelText('Share result'));

    expect(mockShareCard).toHaveBeenCalledWith(
      expect.objectContaining({ url: 'https://air-rally.com/ranked/results/match-1' })
    );
    const call = mockShareCard.mock.calls[0][0];
    expect(call.url).not.toContain('/ranked/match/');
  });

  it('falls back to core Share.share with the same url when the card capture fails', async () => {
    mockCaptureRef.mockRejectedValue(new Error('capture failed'));
    const shareSpy = jest.spyOn(Share, 'share').mockResolvedValue({ action: 'sharedAction' } as never);
    await render(<ResultPhase match={detail(matchFixture(), participant())} currentUserId="me" />);

    await fireEvent.press(screen.getByLabelText('Share result'));

    expect(shareSpy).toHaveBeenCalledWith(
      expect.objectContaining({ url: 'https://air-rally.com/ranked/results/match-1' })
    );
    shareSpy.mockRestore();
  });
});
