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
