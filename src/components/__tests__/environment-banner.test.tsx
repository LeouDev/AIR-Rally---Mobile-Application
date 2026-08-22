import { render, screen } from '@testing-library/react-native';
import React, { type PropsWithChildren } from 'react';
import { SafeAreaProvider, type Metrics } from 'react-native-safe-area-context';

import { EnvironmentBanner } from '@/components/environment-banner';

/** expo-router's root wraps the app in a SafeAreaProvider; rendering the
 * banner on its own has to supply one. Fixed metrics keep the output
 * deterministic instead of depending on a measured layout pass. */
const METRICS: Metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

function Wrapper({ children }: PropsWithChildren) {
  return <SafeAreaProvider initialMetrics={METRICS}>{children}</SafeAreaProvider>;
}

/**
 * The banner's most important behaviour is the one that is easy to
 * regress silently: rendering NOTHING on a real production build. A
 * label leaking into the App Store build would be a visible defect for
 * every user, so it is asserted directly rather than assumed.
 *
 * Environment is read from process.env at render time (via
 * describeEnvironment's defaults), so each case sets the same two
 * variables a build would have baked in.
 */

const PRODUCTION_URL = 'https://hrpbjudsrqcgyrkkodop.supabase.co';
const STAGING_URL = 'https://vdxdmtsnptzodabaojlc.supabase.co';

const originalEnv = { ...process.env };

function setEnv(supabaseUrl: string, apiUrl: string) {
  process.env.EXPO_PUBLIC_SUPABASE_URL = supabaseUrl;
  process.env.EXPO_PUBLIC_API_URL = apiUrl;
}

afterEach(() => {
  process.env.EXPO_PUBLIC_SUPABASE_URL = originalEnv.EXPO_PUBLIC_SUPABASE_URL;
  process.env.EXPO_PUBLIC_API_URL = originalEnv.EXPO_PUBLIC_API_URL;
});

describe('EnvironmentBanner', () => {
  it('renders nothing on a correctly-configured production build', async () => {
    setEnv(PRODUCTION_URL, 'https://air-rally.com');
    await render(<EnvironmentBanner />, { wrapper: Wrapper });
    expect(screen.queryByTestId('environment-banner')).toBeNull();
  });

  it('names the environment on a staging build', async () => {
    setEnv(STAGING_URL, 'http://localhost:3000');
    await render(<EnvironmentBanner />, { wrapper: Wrapper });
    expect(screen.getByText('STAGING')).toBeTruthy();
  });

  it('warns that payments will fail when the API and database disagree', async () => {
    setEnv(STAGING_URL, 'https://air-rally.com');
    await render(<EnvironmentBanner />, { wrapper: Wrapper });
    expect(screen.getByText(/payments will fail/)).toBeTruthy();
  });

  it('still warns when the production database is paired with a local API', async () => {
    // Production data reachable from a laptop is the case that most
    // needs to be visible on screen.
    setEnv(PRODUCTION_URL, 'http://localhost:3000');
    await render(<EnvironmentBanner />, { wrapper: Wrapper });
    expect(screen.getByText(/PRODUCTION DB/)).toBeTruthy();
  });

  it('flags an unrecognised backend rather than staying silent', async () => {
    setEnv('https://someotherproject.supabase.co', 'http://localhost:3000');
    await render(<EnvironmentBanner />, { wrapper: Wrapper });
    expect(screen.getByText(/UNKNOWN BACKEND/)).toBeTruthy();
  });

  it('never intercepts touches', async () => {
    setEnv(STAGING_URL, 'http://localhost:3000');
    await render(<EnvironmentBanner />, { wrapper: Wrapper });
    // An overlay pinned over the top of every screen must not swallow a
    // tap meant for the header beneath it.
    expect(screen.getByTestId('environment-banner').props.pointerEvents).toBe('none');
  });
});
