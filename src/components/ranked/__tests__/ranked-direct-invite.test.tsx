import { render } from '@testing-library/react-native';
import React from 'react';

import { RankedDirectInvite } from '@/components/ranked/ranked-direct-invite';
import type { PublicProfile } from '@/lib/database.types';
import { getPlayerRank } from '@/lib/ranked';

/**
 * Founder-approved 2026-08-31: one search box, not a slot per player —
 * pick someone, the box clears, they land on a growing list, repeat.
 * Starts only at exactly 2 (singles) or exactly 4 (doubles, teams
 * auto-split by rating). These two tests are the host-only baseline —
 * no search, no real timers. Every other scenario (inviting, removing,
 * submitting) lives in its own dedicated file
 * (ranked-direct-invite-*.test.tsx), ONE render() each: a real debounce
 * timer firing in one test was found to reliably poison the NEXT
 * render() in the same file (verified empirically — the same shape
 * ranked-party-builder-fills-tapped-slot.test.tsx already isolates a
 * single real debounce for), so each scenario gets its own file rather
 * than sharing one render() across many `it()` blocks.
 */

jest.mock('@/lib/follows', () => ({ searchPublicProfiles: jest.fn() }));
jest.mock('@/lib/ranked', () => ({
  ...jest.requireActual('@/lib/ranked'),
  getPlayerRank: jest.fn(),
  createRankedMatch: jest.fn(),
}));
jest.mock('@/components/ui/toast', () => ({ useToast: () => ({ show: jest.fn() }) }));

const mockGetPlayerRank = getPlayerRank as jest.MockedFunction<typeof getPlayerRank>;
const HOST: PublicProfile = { id: 'host', display_name: 'Leou', avatar_url: null };

beforeEach(() => {
  jest.clearAllMocks();
  mockGetPlayerRank.mockResolvedValue(null);
});

it('starts with just the host, 1 of 4', async () => {
  const view = await render(<RankedDirectInvite host={HOST} onCreated={jest.fn()} />);
  expect(view.getByText('1 of 4')).toBeTruthy();
});

it('cannot start with only the host — Start match stays disabled', async () => {
  const view = await render(<RankedDirectInvite host={HOST} onCreated={jest.fn()} />);
  expect(view.getByLabelText('Start match').props.accessibilityState.disabled).toBe(true);
});
