import { fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';

import { LobbyPhase } from '@/components/ranked/match/lobby-phase';
import type { PlayerRank, RankedMatch } from '@/lib/database.types';
import type { RankedMatchParticipant } from '@/lib/ranked';
import { isMatchBooked } from '@/lib/ranked';

/**
 * The identity-setting affordance is doubles-only, lobby-only (086's own
 * constraints), and only shown to a player actually on that team — an
 * opponent, or a singles player, has no team to name. TeamIdentitySheet
 * itself is mocked at the component boundary: its own internal behavior
 * (save/clear/error handling) is already covered by
 * team-identity-sheet.test.tsx, so this file only pins that LobbyPhase
 * decides correctly WHEN to offer the affordance and WHICH team it opens.
 */

jest.mock('@/lib/ranked', () => ({
  ...jest.requireActual('@/lib/ranked'),
  isMatchBooked: jest.fn(),
  setReady: jest.fn(),
  cancelMatch: jest.fn(),
}));
jest.mock('@/components/ui/toast', () => ({ useToast: () => ({ show: jest.fn() }) }));

const mockSheetProps = jest.fn();
jest.mock('@/components/ranked/team-identity-sheet', () => ({
  TeamIdentitySheet: (props: { visible: boolean; team: string }) => {
    mockSheetProps(props);
    const { Text } = jest.requireActual('react-native');
    return props.visible ? <Text>SHEET OPEN FOR TEAM {props.team.toUpperCase()}</Text> : null;
  },
}));

const mockIsMatchBooked = isMatchBooked as jest.MockedFunction<typeof isMatchBooked>;

function rank(overrides: Partial<PlayerRank> = {}): PlayerRank {
  return {
    season_id: 1,
    user_id: 'me',
    rating: 1200,
    tier: 3,
    pips: 3,
    reliability: 90,
    sandbag_risk_score: 0,
    last_match_at: null,
    in_promotion_series: false,
    star_protection: 0,
    calibration_matches: 10,
    is_calibrated: true,
    wins: 5,
    losses: 3,
    current_streak: 1,
    best_streak: 2,
    best_tier: 3,
    best_pips: 3,
    created_at: '2026-08-01T00:00:00.000Z',
    updated_at: '2026-08-01T00:00:00.000Z',
    ...overrides,
  };
}

function participant(overrides: Partial<RankedMatchParticipant> = {}): RankedMatchParticipant {
  return {
    match_id: 'match-1',
    user_id: 'me',
    team: 'a',
    is_host: true,
    mode: 'doubles',
    ready: false,
    ready_at: null,
    officiating_vote: null,
    result_response: 'pending',
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
    rank: rank(),
    ...overrides,
  };
}

function matchFixture(overrides: Partial<RankedMatch> = {}): RankedMatch {
  return {
    id: 'match-1',
    season_id: 1,
    event_id: null,
    court_id: null,
    venue_id: null,
    match_type: 'doubles',
    match_weight_type: 'air_rally_ranked',
    team_a_name: null,
    team_a_club_id: null,
    team_b_name: null,
    team_b_club_id: null,
    rated: true,
    status: 'lobby',
    officiating_mode: null,
    scorekeeper_id: null,
    target_score: 11,
    win_by: 2,
    score_a: 0,
    score_b: 0,
    serving_team: 'a',
    scoring_mode: 'rally',
    server_number: null,
    first_service_turn_used: false,
    winning_team: null,
    rank_applied: false,
    dispute_reason: null,
    created_by: 'me',
    created_at: '2026-08-20T00:00:00.000Z',
    started_at: null,
    completed_at: null,
    confirmed_at: null,
    updated_at: '2026-08-20T00:00:00.000Z',
    ...overrides,
  };
}

function doublesRoster(overrides: Partial<RankedMatch> = {}) {
  return {
    ...matchFixture(overrides),
    players: [
      participant(),
      participant({ user_id: 'partner', profile: { id: 'partner', display_name: 'Sam', avatar_url: null } }),
      participant({ user_id: 'opp-1', team: 'b', profile: { id: 'opp-1', display_name: 'Robin', avatar_url: null } }),
      participant({ user_id: 'opp-2', team: 'b', profile: { id: 'opp-2', display_name: 'Alex', avatar_url: null } }),
    ],
    scorekeeper: null,
    team_a_club: null,
    team_b_club: null,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockIsMatchBooked.mockResolvedValue(true);
});

it('offers the edit affordance to a player on their own doubles team in the lobby', async () => {
  await render(<LobbyPhase match={doublesRoster()} currentUserId="me" />);

  expect(screen.getByLabelText('Edit Team A identity')).toBeTruthy();
  expect(screen.queryByLabelText('Edit Team B identity')).toBeNull();
});

it('says "Name your team" before an identity is set', async () => {
  await render(<LobbyPhase match={doublesRoster()} currentUserId="me" />);

  await screen.findByText('Name your team');
});

it('says "Edit" once an identity is already set', async () => {
  await render(<LobbyPhase match={doublesRoster({ team_a_name: 'The Smashers' })} currentUserId="me" />);

  await screen.findByText('Edit');
  expect(screen.queryByText('Name your team')).toBeNull();
});

it('opens the sheet for the viewer\'s own team when tapped', async () => {
  await render(<LobbyPhase match={doublesRoster()} currentUserId="me" />);

  await fireEvent.press(screen.getByLabelText('Edit Team A identity'));

  await screen.findByText('SHEET OPEN FOR TEAM A');
});

it('never offers the affordance in singles — there is no team to name', async () => {
  const singles = {
    ...matchFixture({ match_type: 'singles' }),
    players: [participant(), participant({ user_id: 'opp', team: 'b', profile: { id: 'opp', display_name: 'Robin', avatar_url: null } })],
    scorekeeper: null,
    team_a_club: null,
    team_b_club: null,
  };
  await render(<LobbyPhase match={singles} currentUserId="me" />);

  expect(screen.queryByLabelText('Edit Team A identity')).toBeNull();
  expect(screen.queryByLabelText('Edit Team B identity')).toBeNull();
});

it('never offers the affordance once the match has left the lobby', async () => {
  await render(<LobbyPhase match={doublesRoster({ status: 'live' })} currentUserId="me" />);

  expect(screen.queryByLabelText('Edit Team A identity')).toBeNull();
});

it('shows the doubles team name inline in the section header once set', async () => {
  await render(<LobbyPhase match={doublesRoster({ team_b_name: 'Net Ninjas' })} currentUserId="me" />);

  await screen.findByText(/TEAM B · Net Ninjas/);
});
