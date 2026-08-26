import { render, screen } from '@testing-library/react-native';
import React from 'react';

import { RankedPartyBuilder } from '@/components/ranked/ranked-party-builder';
import type { PublicProfile } from '@/lib/database.types';

/**
 * Founder's call: the Casual/Ranked toggle already says which one this
 * is — the submit button repeating it was redundant, and it had just
 * gone stale in Casual mode (still read "Find ranked match"), caught
 * only on a running screen, not by types or tests. A button whose text
 * has to stay in sync with a toggle above it is a button that CAN fall
 * out of sync. Making it read identically either way removes that class
 * of bug rather than just fixing today's instance of it — this pins
 * the claim as its own thing, distinct from "the right text shows".
 */

jest.mock('@/lib/follows', () => ({ searchPublicProfiles: jest.fn() }));
jest.mock('@/lib/ranked', () => ({
  ...jest.requireActual('@/lib/ranked'),
  getPlayerRank: jest.fn().mockResolvedValue(null),
  createRankedMatch: jest.fn(),
}));
jest.mock('@/components/ui/toast', () => ({ useToast: () => ({ show: jest.fn() }) }));

const HOST: PublicProfile = { id: 'host-1', display_name: 'Leou', avatar_url: null };

it('the submit button reads identically in Casual and Ranked — no mode-specific wording to fall out of sync', async () => {
  const { unmount } = await render(<RankedPartyBuilder host={HOST} matchType="singles" rated onCreated={jest.fn()} />);
  await screen.findByText('Find match');
  expect(screen.queryByText('Find ranked match')).toBeNull();
  unmount();

  await render(<RankedPartyBuilder host={HOST} matchType="singles" rated={false} onCreated={jest.fn()} />);
  await screen.findByText('Find match');
  expect(screen.queryByText('Find casual match')).toBeNull();
});
