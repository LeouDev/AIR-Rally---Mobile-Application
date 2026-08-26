/**
 * The pure helpers under test (date/money formatters, slot grouping)
 * live alongside data functions in the same modules, so importing them
 * pulls in the Supabase client — which touches AsyncStorage's native
 * module and reads env at module scope. Neither exists under Jest, so
 * both get stubbed here rather than splitting every module in two.
 */
process.env.EXPO_PUBLIC_SUPABASE_URL ??= 'https://test.supabase.co';
process.env.EXPO_PUBLIC_SUPABASE_KEY ??= 'test-anon-key';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

// react-native-share resolves its native module (RNShare) through
// TurboModuleRegistry.getEnforcing at import time, which throws under Jest
// since no native binary exists — ships no jest mock of its own, so this
// is a hand-written one covering only what src/lib/share.ts calls.
jest.mock('react-native-share', () => ({
  __esModule: true,
  default: { shareSingle: jest.fn(() => Promise.resolve({ success: true, message: '' })) },
  Social: { InstagramStories: 'instagramstories' },
}));
