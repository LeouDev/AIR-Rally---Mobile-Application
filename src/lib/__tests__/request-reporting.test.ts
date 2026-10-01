import { createCheckoutSession } from '@/lib/checkout';
import { reportingFetch } from '@/lib/sentry';
import { supabase } from '@/lib/supabase';

/**
 * supabase-js resolves failed requests with { error } and the API helpers
 * turn them into messages, so before reportingFetch a failed query or
 * checkout reached Sentry by no route at all. Each test uses its own
 * endpoint: a failure is reported once per launch, and the module's memory
 * of what it reported lasts for the whole file.
 */

const mockCaptureMessage = jest.fn();
jest.mock('@sentry/react-native', () => ({
  init: jest.fn(),
  reactNativeErrorHandlersIntegration: jest.fn(),
  captureMessage: (...args: unknown[]) => mockCaptureMessage(...args),
}));

const realFetch = globalThis.fetch;
function serverReplies(status: number, body: unknown) {
  globalThis.fetch = jest.fn(
    async () => new Response(typeof body === 'string' ? body : JSON.stringify(body), { status })
  );
}
const reported = () => mockCaptureMessage.mock.calls.map(([message]) => message);

afterEach(() => {
  globalThis.fetch = realFetch;
  mockCaptureMessage.mockClear();
});

it('reports a server error by endpoint, without the query string or ids', async () => {
  serverReplies(500, { message: 'canceling statement due to statement timeout' });
  await reportingFetch(
    'https://x.supabase.co/storage/v1/object/avatars/0b5d2c4e-1f3a-4b6c-8d9e-0a1b2c3d4e5f/me.jpg?t=1',
    { method: 'POST' }
  );
  expect(mockCaptureMessage).toHaveBeenCalledWith(
    'Request failed: POST /storage/v1/object/avatars/:id/me.jpg → 500',
    { level: 'error', extra: { message: 'canceling statement due to statement timeout' } }
  );
});

it.each([
  ['a column', 400, '42703'],
  ['a function', 404, 'PGRST202'],
])('reports %s the live schema lacks', async (_what, status, code) => {
  serverReplies(status, { code, message: 'not in the schema' });
  await reportingFetch(`https://x.supabase.co/rest/v1/schema-${code}`);
  expect(reported()).toEqual([`Request failed: GET /rest/v1/schema-${code} → ${status} ${code}`]);
});

it.each([
  ['a business-rule refusal', 400, 'P0001'],
  ['an RLS refusal', 403, '42501'],
  ['a duplicate', 409, '23505'],
  ['a wrong password', 400, 'invalid_credentials'],
])("leaves %s to the screen that shows it", async (_what, status, code) => {
  serverReplies(status, { code, message: 'expected' });
  await reportingFetch(`https://x.supabase.co/rest/v1/expected-${code}`);
  expect(mockCaptureMessage).not.toHaveBeenCalled();
});

it('reports each failure once per launch, so an outage cannot drain the quota', async () => {
  serverReplies(503, 'unavailable');
  await reportingFetch('https://x.supabase.co/rest/v1/once');
  await reportingFetch('https://x.supabase.co/rest/v1/once');
  serverReplies(500, 'boom');
  await reportingFetch('https://x.supabase.co/rest/v1/once');
  expect(reported()).toEqual([
    'Request failed: GET /rest/v1/once → 503',
    'Request failed: GET /rest/v1/once → 500',
  ]);
});

it('hands the caller a response it can still read', async () => {
  serverReplies(500, { message: 'boom' });
  const response = await reportingFetch('https://x.supabase.co/rest/v1/readable');
  await expect(response.json()).resolves.toEqual({ message: 'boom' });
});

it('rethrows offline failures untouched and reports nothing', async () => {
  const offline = new TypeError('Network request failed');
  globalThis.fetch = jest.fn(async () => {
    throw offline;
  });
  await expect(reportingFetch('https://x.supabase.co/rest/v1/offline')).rejects.toBe(offline);
  expect(mockCaptureMessage).not.toHaveBeenCalled();
});

it('covers every Supabase query', async () => {
  serverReplies(500, { message: 'boom' });
  const { error } = await supabase.from('bookings').select('id');
  expect(error).not.toBeNull();
  expect(reported()).toEqual(['Request failed: GET /rest/v1/bookings → 500']);
});

it('covers checkout', async () => {
  jest
    .spyOn(supabase.auth, 'getSession')
    .mockResolvedValue({ data: { session: { access_token: 'token' } }, error: null } as never);
  serverReplies(502, '<html>Bad gateway</html>');
  const result = await createCheckoutSession({ courtId: 'c', startTime: 's', endTime: 'e' });
  expect(result.success).toBe(false);
  expect(reported()).toEqual(['Request failed: POST /api/mobile/checkout → 502']);
});
