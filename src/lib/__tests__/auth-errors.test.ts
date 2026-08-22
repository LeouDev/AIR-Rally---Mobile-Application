import { getFriendlyAuthErrorMessage } from '@/lib/auth-errors';

describe('getFriendlyAuthErrorMessage', () => {
  it('maps invalid credentials by code', () => {
    expect(getFriendlyAuthErrorMessage({ code: 'invalid_credentials', message: 'Invalid login credentials' })).toBe(
      'That email or password is incorrect.'
    );
  });

  it('maps invalid credentials by message when no code is present', () => {
    expect(getFriendlyAuthErrorMessage({ message: 'Invalid login credentials' })).toBe(
      'That email or password is incorrect.'
    );
  });

  it('maps a duplicate signup', () => {
    expect(getFriendlyAuthErrorMessage({ code: 'user_already_exists' })).toBe(
      'An account with that email already exists.'
    );
  });

  it('maps an unconfirmed email', () => {
    expect(getFriendlyAuthErrorMessage({ code: 'email_not_confirmed' })).toBe(
      'Please confirm your email before signing in — check your inbox for the confirmation link.'
    );
  });

  it('maps a rate limit', () => {
    expect(getFriendlyAuthErrorMessage({ code: 'over_request_rate_limit' })).toBe(
      'Too many attempts. Please wait a moment and try again.'
    );
  });

  it('maps an expired session', () => {
    expect(getFriendlyAuthErrorMessage({ code: 'refresh_token_not_found' })).toBe(
      'Your session has expired. Please sign in again.'
    );
  });

  it('prefers the code over message text when both are present and would disagree', () => {
    // A message that reads like something else entirely — the code must win.
    expect(
      getFriendlyAuthErrorMessage({ code: 'invalid_credentials', message: 'relation "auth.users" does not exist' })
    ).toBe('That email or password is incorrect.');
  });

  it('never leaks a raw database or SDK error string for an unrecognised error', () => {
    const raw = 'relation "public.sekrit_table" does not exist';
    expect(getFriendlyAuthErrorMessage({ message: raw })).not.toContain('sekrit_table');
    expect(getFriendlyAuthErrorMessage({ message: 'AuthApiError: unexpected_failure' })).not.toContain('AuthApiError');
  });

  it('does not mistake a network failure for a credentials problem', () => {
    // What fetch actually throws on a dropped connection — no `code`,
    // and message text that matches none of the auth patterns. Getting
    // this wrong would send someone to reset a password that was fine.
    const networkError = new TypeError('Network request failed');
    const message = getFriendlyAuthErrorMessage(networkError);
    expect(message).not.toBe('That email or password is incorrect.');
    expect(message).toBe('Something went wrong. Please try again.');
  });

  it('falls back to the default message for a completely unknown error', () => {
    expect(getFriendlyAuthErrorMessage(new Error('boom'))).toBe('Something went wrong. Please try again.');
  });

  it('accepts a custom fallback message', () => {
    expect(getFriendlyAuthErrorMessage(new Error('boom'), 'We could not complete that.')).toBe(
      'We could not complete that.'
    );
  });

  it('handles non-object errors without throwing', () => {
    expect(getFriendlyAuthErrorMessage('just a string')).toBe('Something went wrong. Please try again.');
    expect(getFriendlyAuthErrorMessage(null)).toBe('Something went wrong. Please try again.');
    expect(getFriendlyAuthErrorMessage(undefined)).toBe('Something went wrong. Please try again.');
  });
});
