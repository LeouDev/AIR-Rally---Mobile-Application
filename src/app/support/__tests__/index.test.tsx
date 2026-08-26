import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import React from 'react';

import SupportScreen from '@/app/support/index';
import type { SupportRequest } from '@/lib/database.types';
import { createSupportRequest, listMySupportRequests, SupportError } from '@/lib/support';

/**
 * A support request that appears to send and silently doesn't leaves
 * someone believing they've been heard when nothing was written — the
 * worst possible failure on this particular screen. Every one of these
 * is about that: the success toast only fires on a proven write, the
 * rate limit says what it actually is, and a failed history load never
 * masquerades as "you have no messages".
 */

jest.mock('expo-router', () => ({
  Stack: { Screen: () => null },
  useFocusEffect: (callback: () => void) => {
    const React = jest.requireActual('react');
    React.useEffect(callback, [callback]);
  },
}));

const mockToastShow = jest.fn();
jest.mock('@/components/ui/toast', () => ({ useToast: () => ({ show: mockToastShow }) }));

jest.mock('@/providers/session', () => ({
  useSession: () => ({ session: { user: { id: 'me' } } }),
}));

jest.mock('@/lib/support', () => ({
  ...jest.requireActual('@/lib/support'),
  listMySupportRequests: jest.fn(),
  createSupportRequest: jest.fn(),
}));

const mockList = listMySupportRequests as jest.MockedFunction<typeof listMySupportRequests>;
const mockCreate = createSupportRequest as jest.MockedFunction<typeof createSupportRequest>;

function requestFixture(overrides: Partial<SupportRequest> = {}): SupportRequest {
  return {
    id: 'req-1',
    user_id: 'me',
    category: 'booking',
    subject: 'Charged twice',
    message: 'I was charged twice for the same booking on Tuesday.',
    status: 'open',
    resolved_by: null,
    resolved_at: null,
    resolution_note: null,
    created_at: '2026-08-24T00:00:00.000Z',
    updated_at: '2026-08-24T00:00:00.000Z',
    ...overrides,
  };
}

const VALID_MESSAGE = 'I was charged twice for the same booking on Tuesday.';

// fireEvent is async in this RNTL version — an un-awaited press fires
// before the changeText state has settled, so the form validates against
// empty fields and never submits.
async function fillAndSend() {
  await fireEvent.changeText(screen.getByPlaceholderText('A one-line summary'), 'Charged twice');
  await fireEvent.changeText(screen.getByPlaceholderText(/Include booking references/), VALID_MESSAGE);
  await fireEvent.press(screen.getByLabelText('Send message'));
}

beforeEach(() => {
  jest.clearAllMocks();
  mockList.mockResolvedValue([]);
  mockCreate.mockResolvedValue(requestFixture());
});

describe('SupportScreen — sending', () => {
  it('sends the chosen category, not always the default', async () => {
    await render(<SupportScreen />);
    await fireEvent.press(await screen.findByLabelText('A payment'));
    await fillAndSend();

    await waitFor(() => expect(mockCreate).toHaveBeenCalled());
    expect(mockCreate.mock.calls[0][1]).toEqual({
      category: 'payment',
      subject: 'Charged twice',
      message: VALID_MESSAGE,
    });
  });

  it('confirms only after a proven write', async () => {
    await render(<SupportScreen />);
    await fillAndSend();

    await waitFor(() => expect(mockToastShow).toHaveBeenCalledWith("Sent. We'll reply in your notifications."));
  });

  it('says the request FAILED rather than confirming it, when the write throws', async () => {
    mockCreate.mockRejectedValue(new Error('network'));
    await render(<SupportScreen />);
    await fillAndSend();

    await waitFor(() => expect(mockToastShow).toHaveBeenCalled());
    const [text, tone] = mockToastShow.mock.calls[0];
    expect(tone).toBe('error');
    expect(text).not.toContain('Sent');
  });

  it('surfaces the rate limit in its own words, not as a generic failure', async () => {
    mockCreate.mockRejectedValue(
      new SupportError('rate_limited', "You've sent us several messages today. We'll reply to those first.")
    );
    await render(<SupportScreen />);
    await fillAndSend();

    await waitFor(() =>
      expect(mockToastShow).toHaveBeenCalledWith(
        "You've sent us several messages today. We'll reply to those first.",
        'error'
      )
    );
  });

  it('refuses a too-short message locally rather than letting the server reject it', async () => {
    await render(<SupportScreen />);
    await fireEvent.changeText(screen.getByPlaceholderText('A one-line summary'), 'Hi');
    await fireEvent.changeText(screen.getByPlaceholderText(/Include booking references/), 'too short');
    await fireEvent.press(screen.getByLabelText('Send message'));

    await screen.findByText('Tell us a bit more — at least 20 characters.');
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('refuses an empty subject', async () => {
    await render(<SupportScreen />);
    await fireEvent.changeText(screen.getByPlaceholderText(/Include booking references/), VALID_MESSAGE);
    await fireEvent.press(screen.getByLabelText('Send message'));

    await screen.findByText('Add a short subject.');
    expect(mockCreate).not.toHaveBeenCalled();
  });
});

describe('SupportScreen — history', () => {
  it("shows the admin's reply under the web's own heading", async () => {
    mockList.mockResolvedValue([
      requestFixture({ status: 'resolved', resolution_note: 'Refunded — it should land in 3 days.' }),
    ]);
    await render(<SupportScreen />);

    await screen.findByText('Our reply');
    expect(screen.getByText('Refunded — it should land in 3 days.')).toBeTruthy();
    expect(screen.getByText('Resolved')).toBeTruthy();
  });

  it('uses the web\'s status wording, not a mobile invention', async () => {
    mockList.mockResolvedValue([requestFixture({ status: 'in_progress' })]);
    await render(<SupportScreen />);

    await screen.findByText('Being looked at');
    expect(screen.queryByText('In progress')).toBeNull();
  });

  it('shows a helpful empty state for someone who has never messaged support', async () => {
    mockList.mockResolvedValue([]);
    await render(<SupportScreen />);

    await screen.findByText(/You haven't messaged us yet/);
  });

  it('never passes a failed load off as an empty history', async () => {
    mockList.mockRejectedValue(new Error('network'));
    await render(<SupportScreen />);

    await screen.findByText("Couldn't load your previous messages.");
    expect(screen.queryByText(/You haven't messaged us yet/)).toBeNull();
  });
});
