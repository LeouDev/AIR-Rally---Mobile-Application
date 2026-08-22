import {
  describeEnvironment,
  environmentFor,
  environmentLabel,
  isProductionApi,
  projectRefFrom,
} from '@/lib/environment';

const PRODUCTION_URL = 'https://hrpbjudsrqcgyrkkodop.supabase.co';
const STAGING_URL = 'https://vdxdmtsnptzodabaojlc.supabase.co';

/**
 * This module is the guardrail that decides whether a build is allowed
 * to look like production, so its failure modes matter more than its
 * happy path. The rule throughout is FAIL SAFE: anything it cannot
 * positively identify as production is treated as non-production, which
 * shows the banner. A false banner costs a developer nothing; a missing
 * one means real bookings made from a laptop with no warning on screen.
 */

describe('projectRefFrom', () => {
  it('pulls the ref out of a Supabase URL', () => {
    expect(projectRefFrom(PRODUCTION_URL)).toBe('hrpbjudsrqcgyrkkodop');
    expect(projectRefFrom(STAGING_URL)).toBe('vdxdmtsnptzodabaojlc');
  });

  it('returns null for anything that is not one', () => {
    expect(projectRefFrom(undefined)).toBeNull();
    expect(projectRefFrom('')).toBeNull();
    expect(projectRefFrom('not-a-url')).toBeNull();
    expect(projectRefFrom('https://air-rally.com')).toBeNull();
  });

  it('does not accept a lookalike host', () => {
    // A ref is only a ref when it is the subdomain of supabase.co.
    expect(projectRefFrom('https://hrpbjudsrqcgyrkkodop.supabase.co.evil.test')).toBeNull();
    expect(projectRefFrom('http://hrpbjudsrqcgyrkkodop.supabase.co')).toBeNull(); // not https
  });
});

describe('environmentFor', () => {
  it('names the two known projects', () => {
    expect(environmentFor(PRODUCTION_URL)).toBe('production');
    expect(environmentFor(STAGING_URL)).toBe('staging');
  });

  it('calls an unrecognised project unknown, never production', () => {
    expect(environmentFor('https://someotherproject.supabase.co')).toBe('unknown');
    expect(environmentFor(undefined)).toBe('unknown');
  });
});

describe('isProductionApi', () => {
  it('recognises the production web app', () => {
    expect(isProductionApi('https://air-rally.com')).toBe(true);
    expect(isProductionApi('https://www.air-rally.com')).toBe(true);
    expect(isProductionApi('https://air-rally.com/')).toBe(true);
  });

  it('treats local and unknown hosts as not production', () => {
    expect(isProductionApi('http://localhost:3000')).toBe(false);
    expect(isProductionApi('http://192.168.1.20:3000')).toBe(false);
    expect(isProductionApi('https://staging.air-rally.com')).toBe(false);
    expect(isProductionApi(undefined)).toBe(false);
    expect(isProductionApi('')).toBe(false);
  });

  it('does not match a host that merely ends with the production domain', () => {
    expect(isProductionApi('https://air-rally.com.evil.test')).toBe(false);
    expect(isProductionApi('https://notair-rally.com')).toBe(false);
  });

  it('treats an unparseable value as not production', () => {
    expect(isProductionApi('air-rally.com')).toBe(false);
  });
});

describe('describeEnvironment', () => {
  it('reports a correctly-wired production build', () => {
    const status = describeEnvironment(PRODUCTION_URL, 'https://air-rally.com');
    expect(status.environment).toBe('production');
    expect(status.isProduction).toBe(true);
    expect(status.hasApiMismatch).toBe(false);
  });

  it('reports a correctly-wired local staging build', () => {
    const status = describeEnvironment(STAGING_URL, 'http://localhost:3000');
    expect(status.environment).toBe('staging');
    expect(status.isProduction).toBe(false);
    expect(status.hasApiMismatch).toBe(false);
  });

  it('flags a staging database pointed at the production API', () => {
    // The failure this catches: reads succeed against staging while
    // every /api/mobile/* call 401s, because production cannot validate
    // a token staging issued.
    const status = describeEnvironment(STAGING_URL, 'https://air-rally.com');
    expect(status.hasApiMismatch).toBe(true);
  });

  it('flags a production database pointed at a local API', () => {
    const status = describeEnvironment(PRODUCTION_URL, 'http://localhost:3000');
    expect(status.hasApiMismatch).toBe(true);
  });

  // Empty strings rather than `undefined`: both arguments default to the
  // real process.env values, and only `undefined` triggers a default
  // parameter — so passing undefined here would silently test whatever
  // env the test runner happens to carry, not an unconfigured build.
  it('flags a completely unconfigured build rather than staying silent', () => {
    const status = describeEnvironment('', '');
    expect(status.environment).toBe('unknown');
    expect(status.isProduction).toBe(false);
    // unknown DB + non-production API is internally consistent, so the
    // banner shows on the environment being unknown, not on a mismatch.
    expect(status.hasApiMismatch).toBe(false);
  });
});

describe('environmentLabel', () => {
  it('names a known environment', () => {
    expect(environmentLabel(describeEnvironment(STAGING_URL, 'http://localhost:3000'))).toBe('STAGING');
  });

  it('surfaces the actual ref when the backend is unrecognised', () => {
    const status = describeEnvironment('https://brandnewproject.supabase.co', 'http://localhost:3000');
    expect(environmentLabel(status)).toBe('UNKNOWN BACKEND · brandnewproject');
  });

  it('says so plainly when nothing is configured', () => {
    expect(environmentLabel(describeEnvironment('', ''))).toBe('NO BACKEND CONFIGURED');
  });
});
