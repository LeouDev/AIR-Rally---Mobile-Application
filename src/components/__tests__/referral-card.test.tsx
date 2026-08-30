import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { Share } from 'react-native';
import React from 'react';

import { ReferralCard } from '@/components/referral-card';

/**
 * Founder's request: "instead of showing the link, is it possible to just
 * show the button refer your court owner? and it'll say link has been
 * copied or something." The URL chip was a manual-copy fallback for the
 * Share button above it — the button already covers copying (the OS
 * share sheet has its own Copy action) plus WhatsApp/Messenger/Mail,
 * which is closer to what referring someone actually means. So: drop the
 * chip, keep the button and its existing "Shared" confirmation.
 */

let mockShare: jest.SpyInstance;

beforeEach(() => {
  mockShare = jest.spyOn(Share, 'share').mockResolvedValue({ action: 'dismissedAction' } as never);
});

afterEach(() => {
  mockShare.mockRestore();
});

it('shows the button but no visible referral URL', async () => {
  mockShare.mockResolvedValue({ action: 'dismissedAction' } as never);
  await render(<ReferralCard referralCode="abc123" />);

  await screen.findByText('Refer a Court Owner');
  expect(screen.queryByText(/air-rally\.com\/owner\/onboarding/)).toBeNull();
});

it('opens the OS share sheet with the referral link on press', async () => {
  mockShare.mockResolvedValue({ action: 'dismissedAction' } as never);
  await render(<ReferralCard referralCode="abc123" />);

  fireEvent.press(screen.getByText('Refer a Court Owner'));

  expect(mockShare).toHaveBeenCalledWith(
    expect.objectContaining({ message: expect.stringContaining('https://air-rally.com/owner/onboarding?ref=abc123') })
  );
});

it('shows "Shared" for a moment after a completed share, then reverts', async () => {
  jest.useFakeTimers();
  mockShare.mockResolvedValue({ action: Share.sharedAction } as never);
  await render(<ReferralCard referralCode="abc123" />);

  await fireEvent.press(screen.getByText('Refer a Court Owner'));
  await screen.findByText('Shared');

  await act(async () => {
    jest.advanceTimersByTime(2000);
  });
  await screen.findByText('Refer a Court Owner');

  jest.useRealTimers();
});

it('does not show "Shared" when the share sheet is dismissed without sharing', async () => {
  mockShare.mockResolvedValue({ action: 'dismissedAction' } as never);
  await render(<ReferralCard referralCode="abc123" />);

  fireEvent.press(screen.getByText('Refer a Court Owner'));

  expect(screen.queryByText('Shared')).toBeNull();
});
