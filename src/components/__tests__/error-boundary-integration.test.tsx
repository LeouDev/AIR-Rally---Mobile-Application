import { fireEvent, render, screen } from '@testing-library/react-native';
import { Try } from 'expo-router/build/views/Try';
import React, { type PropsWithChildren } from 'react';
import { Text } from 'react-native';
import { SafeAreaProvider, type Metrics } from 'react-native-safe-area-context';

import { ErrorBoundary } from '@/app/_layout';
import { clearReports } from '@/lib/error-reporting';

/**
 * Proves the wiring, not just the fallback component: a child that
 * throws during render is caught by the very `ErrorBoundary` the root
 * layout exports, and `retry` puts the app back.
 *
 * Worth its own file because the unit tests above would all still pass
 * if the export were removed from _layout.tsx and no boundary existed at
 * all — the failure mode this guards is a white screen, which is exactly
 * the thing a component test of the fallback cannot see.
 *
 * `Try` is expo-router's own boundary implementation — the component the
 * router wraps a route in when that route exports `ErrorBoundary` — so
 * this exercises the real mechanism rather than a stand-in.
 */

const METRICS: Metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

function Wrapper({ children }: PropsWithChildren) {
  return <SafeAreaProvider initialMetrics={METRICS}>{children}</SafeAreaProvider>;
}

let shouldThrow = true;

function Screen() {
  if (shouldThrow) {
    throw new Error('PostgrestException: something deep in a screen exploded');
  }
  return <Text>Explore</Text>;
}

beforeEach(async () => {
  shouldThrow = true;
  await clearReports();
  // React logs caught render errors; silence the noise, keep the test output readable.
  jest.spyOn(console, 'error').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('root ErrorBoundary', () => {
  it('catches a render throw instead of leaving a blank screen', async () => {
    await render(
      <Try catch={ErrorBoundary}>
        <Screen />
      </Try>,
      { wrapper: Wrapper }
    );

    expect(screen.getByText('Something went wrong')).toBeTruthy();
    // And still no technical detail on screen.
    expect(screen.queryByText(/PostgrestException/)).toBeNull();
  });

  it('restores the app when retry succeeds', async () => {
    await render(
      <Try catch={ErrorBoundary}>
        <Screen />
      </Try>,
      { wrapper: Wrapper }
    );
    expect(screen.getByText('Something went wrong')).toBeTruthy();

    // Whatever was transiently broken is now fixed.
    shouldThrow = false;
    await fireEvent.press(screen.getByLabelText('Try again'));

    expect(screen.getByText('Explore')).toBeTruthy();
    expect(screen.queryByText('Something went wrong')).toBeNull();
  });

  it('stays on the fallback when retry hits the same error again', async () => {
    await render(
      <Try catch={ErrorBoundary}>
        <Screen />
      </Try>,
      { wrapper: Wrapper }
    );

    // Still broken — retry must re-catch rather than crash the process.
    await fireEvent.press(screen.getByLabelText('Try again'));

    expect(screen.getByText('Something went wrong')).toBeTruthy();
  });
});
