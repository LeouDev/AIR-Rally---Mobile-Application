import { act, fireEvent, render } from '@testing-library/react-native';
import * as Updates from 'expo-updates';
import { AppState } from 'react-native';
import React, { type PropsWithChildren } from 'react';
import { SafeAreaProvider, type Metrics } from 'react-native-safe-area-context';

import { UpdatePrompt } from '@/components/update-prompt';
import { getActiveMatch } from '@/lib/ranked';

/** expo-router's root wraps the app in a SafeAreaProvider; rendering
 * this component on its own has to supply one (same pattern as
 * environment-banner.test.tsx). Fixed metrics keep output deterministic. */
const METRICS: Metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

function Wrapper({ children }: PropsWithChildren) {
  return <SafeAreaProvider initialMetrics={METRICS}>{children}</SafeAreaProvider>;
}

/**
 * expo-updates' defaults (app.json's `updates` block has only `url`)
 * mean a downloaded OTA applies on the NEXT cold launch, not the
 * current session — a player who never fully relaunches can sit on a
 * stale bundle indefinitely. This checks on a real app-foreground
 * transition (not a timer) and offers to apply an already-fetched
 * update now.
 *
 * The non-negotiable requirement: never prompt — never even CHECK —
 * while the viewer has a ranked match in progress. Reloading mid-match
 * would yank them out of whatever phase they're in. That test asserts
 * the negative explicitly, the same shape as the play.tsx foreground
 * tests: an assertion that only checks the happy path can't catch a
 * version that prompts during a live match by accident.
 */

let appStateListener: ((state: string) => void) | undefined;

jest.mock('expo-updates', () => ({
  checkForUpdateAsync: jest.fn(),
  fetchUpdateAsync: jest.fn(),
  reloadAsync: jest.fn(),
}));
jest.mock('@/lib/ranked', () => ({
  ...jest.requireActual('@/lib/ranked'),
  getActiveMatch: jest.fn(),
}));
jest.mock('@/providers/session', () => ({
  useSession: () => ({ session: { user: { id: 'me' } } }),
}));

const mockCheck = Updates.checkForUpdateAsync as jest.MockedFunction<typeof Updates.checkForUpdateAsync>;
const mockFetch = Updates.fetchUpdateAsync as jest.MockedFunction<typeof Updates.fetchUpdateAsync>;
const mockReload = Updates.reloadAsync as jest.MockedFunction<typeof Updates.reloadAsync>;
const mockGetActiveMatch = getActiveMatch as jest.MockedFunction<typeof getActiveMatch>;

function foreground() {
  return act(async () => {
    appStateListener?.('background');
    appStateListener?.('inactive');
    appStateListener?.('active');
    await Promise.resolve();
    await Promise.resolve();
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  appStateListener = undefined;
  // The real test environment runs with __DEV__ true (Jest's default),
  // which the component treats as "not a published bundle, no-op" —
  // exactly the guard under test in its own dedicated case below. Every
  // other test needs it overridden to exercise the real check/prompt path.
  (globalThis as unknown as { __DEV__: boolean }).__DEV__ = false;
  mockGetActiveMatch.mockResolvedValue(null);
  mockFetch.mockResolvedValue({ isNew: true } as never);
  mockReload.mockResolvedValue(undefined as never);
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_event, cb) => {
    appStateListener = cb as (state: string) => void;
    return { remove: jest.fn() } as unknown as ReturnType<typeof AppState.addEventListener>;
  });
});

afterEach(() => {
  jest.restoreAllMocks();
  (globalThis as unknown as { __DEV__: boolean }).__DEV__ = true;
});

it('renders nothing before any foreground transition — checks on foreground, not a timer', async () => {
  mockCheck.mockResolvedValue({ isAvailable: true } as never);
  const view = await render(<Wrapper><UpdatePrompt /></Wrapper>);

  expect(mockCheck).not.toHaveBeenCalled();
  expect(view.queryByText('Update ready')).toBeNull();
});

it('shows the prompt after a real background → active transition finds and fetches an update', async () => {
  mockCheck.mockResolvedValue({ isAvailable: true } as never);
  const view = await render(<Wrapper><UpdatePrompt /></Wrapper>);

  await foreground();

  expect(mockCheck).toHaveBeenCalledTimes(1);
  expect(mockFetch).toHaveBeenCalledTimes(1);
  expect(view.getByText('Update ready')).toBeTruthy();
});

it('does not show the prompt when no update is available', async () => {
  mockCheck.mockResolvedValue({ isAvailable: false, reason: 'noUpdateAvailable' } as never);
  const view = await render(<Wrapper><UpdatePrompt /></Wrapper>);

  await foreground();

  expect(mockFetch).not.toHaveBeenCalled();
  expect(view.queryByText('Update ready')).toBeNull();
});

it.each(['live', 'officiating', 'lobby'] as const)(
  'never fetches or prompts while the viewer has a %s match — a modal would intrude on it',
  async (status) => {
    mockCheck.mockResolvedValue({ isAvailable: true } as never);
    mockGetActiveMatch.mockResolvedValue({ id: 'match-1', status } as never);
    const view = await render(<Wrapper><UpdatePrompt /></Wrapper>);

    await foreground();

    // The check itself is allowed to run (it's how the app would know an
    // update exists at all) — what must never happen is fetching it or
    // showing the prompt while one of these phases is active.
    expect(mockFetch).not.toHaveBeenCalled();
    expect(view.queryByText('Update ready')).toBeNull();
  }
);

// The discriminating case: getActiveMatch() also matches
// 'awaiting_confirmation', a status migration 114 deliberately never
// sweeps — a naive "block on any active match" guard would deny this
// player the prompt forever, not just during the match. A test that
// only checks the live/officiating/lobby blocking cases above would
// pass against that naive version too; this is the one that catches it.
it('DOES prompt when the viewer\'s only active match is awaiting_confirmation — nothing is happening on court', async () => {
  mockCheck.mockResolvedValue({ isAvailable: true } as never);
  mockGetActiveMatch.mockResolvedValue({ id: 'match-1', status: 'awaiting_confirmation' } as never);
  const view = await render(<Wrapper><UpdatePrompt /></Wrapper>);

  await foreground();

  expect(mockFetch).toHaveBeenCalledTimes(1);
  expect(view.getByText('Update ready')).toBeTruthy();
});

it('does NOT check on an inactive-only blip that never reached background (control-centre, notification shade)', async () => {
  mockCheck.mockResolvedValue({ isAvailable: true } as never);
  await render(<Wrapper><UpdatePrompt /></Wrapper>);

  await act(async () => {
    appStateListener?.('inactive');
    appStateListener?.('active');
    await Promise.resolve();
  });

  expect(mockCheck).not.toHaveBeenCalled();
});

it('does nothing at all in dev — the Updates APIs are not safe to call outside a published bundle', async () => {
  (globalThis as unknown as { __DEV__: boolean }).__DEV__ = true;
  mockCheck.mockResolvedValue({ isAvailable: true } as never);
  const view = await render(<Wrapper><UpdatePrompt /></Wrapper>);

  await foreground();

  expect(mockCheck).not.toHaveBeenCalled();
  expect(view.queryByText('Update ready')).toBeNull();
});

it('reloads the app when Restart is pressed', async () => {
  mockCheck.mockResolvedValue({ isAvailable: true } as never);
  const view = await render(<Wrapper><UpdatePrompt /></Wrapper>);
  await foreground();

  await act(async () => {
    fireEvent.press(view.getByText('Restart'));
  });

  expect(mockReload).toHaveBeenCalledTimes(1);
});

it('dismisses without reloading when Not now is pressed', async () => {
  mockCheck.mockResolvedValue({ isAvailable: true } as never);
  const view = await render(<Wrapper><UpdatePrompt /></Wrapper>);
  await foreground();

  await act(async () => {
    fireEvent.press(view.getByText('Not now'));
  });

  expect(mockReload).not.toHaveBeenCalled();
  expect(view.queryByText('Update ready')).toBeNull();
});

it('a failed check never throws or leaves a stale prompt', async () => {
  mockCheck.mockRejectedValue(new Error('network'));
  const view = await render(<Wrapper><UpdatePrompt /></Wrapper>);

  await foreground();

  expect(view.queryByText('Update ready')).toBeNull();
});
