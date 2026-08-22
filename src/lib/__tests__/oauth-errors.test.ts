import { signInWithApple, signInWithProvider } from '@/lib/oauth';
import { supabase } from '@/lib/supabase';

/**
 * oauth.ts used to hand a raw Supabase error message straight back to
 * the caller (`error?.message ?? "..."`) at every one of its three
 * failure points, which oauth-buttons.tsx then rendered verbatim. This
 * pins that every path — the OAuth consent redirect, the PKCE code
 * exchange, and Sign in with Apple — now goes through the shared
 * translator instead.
 */

jest.mock('expo-crypto', () => ({
  randomUUID: () => 'test-nonce',
  digestStringAsync: jest.fn(async () => 'hashed-nonce'),
  CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
}));

jest.mock('expo-web-browser', () => ({ openAuthSessionAsync: jest.fn() }));

jest.mock('expo-apple-authentication', () => ({
  signInAsync: jest.fn(),
  AppleAuthenticationScope: { FULL_NAME: 0, EMAIL: 1 },
}));

jest.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      signInWithOAuth: jest.fn(),
      exchangeCodeForSession: jest.fn(),
      signInWithIdToken: jest.fn(),
    },
    from: jest.fn(() => ({ update: () => ({ eq: jest.fn() }) })),
  },
}));

const WebBrowser = jest.requireMock('expo-web-browser') as {
  openAuthSessionAsync: jest.Mock;
};
const AppleAuth = jest.requireMock('expo-apple-authentication') as {
  signInAsync: jest.Mock;
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe('signInWithProvider error translation', () => {
  it('never leaks the raw exchangeCodeForSession error', async () => {
    (supabase.auth.signInWithOAuth as jest.Mock).mockResolvedValue({
      data: { url: 'https://provider.example/consent' },
      error: null,
    });
    WebBrowser.openAuthSessionAsync.mockResolvedValue({
      type: 'success',
      url: 'airrally://auth-callback?code=abc123',
    });
    (supabase.auth.exchangeCodeForSession as jest.Mock).mockResolvedValue({
      error: { code: 'bad_code_verifier', message: 'invalid request: code challenge does not match' },
    });

    const result = await signInWithProvider('google');

    expect(result.status).toBe('error');
    if (result.status === 'error') {
      expect(result.message).not.toContain('code challenge');
      expect(result.message).toBe('Something went wrong. Please try again.');
    }
  });
});

describe('signInWithApple error translation', () => {
  it('never leaks the raw signInWithIdToken error', async () => {
    AppleAuth.signInAsync.mockResolvedValue({
      identityToken: 'a-real-looking-token',
      fullName: null,
    });
    (supabase.auth.signInWithIdToken as jest.Mock).mockResolvedValue({
      data: { user: null },
      error: { code: 'invalid_credentials', message: 'Signature verification failed' },
    });

    const result = await signInWithApple();

    expect(result.status).toBe('error');
    if (result.status === 'error') {
      expect(result.message).not.toContain('Signature verification');
      expect(result.message).toBe('That email or password is incorrect.');
    }
  });
});
