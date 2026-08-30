import type { Database } from '@/lib/database.types';

/**
 * lib/open-match.ts casts supabase.rpc to bypass TypeScript's
 * production-only RPC-name union, since these functions exist on
 * staging only (see that file's own module comment). "Delete this
 * once types are regenerated" is a comment, and comments don't fire —
 * 33's point, and right: the cast's removal depends on someone
 * remembering, in the one module where the compiler could otherwise
 * catch a typo'd RPC name for free.
 *
 * This is the mechanism instead of the memory, at the type level
 * rather than a text search (immune to a false match inside a comment,
 * and it checks the actual generated shape rather than raw file text).
 * `@ts-expect-error` below is GREEN — expected to fail — while
 * 'create_open_match' is genuinely absent from the generated Functions
 * map. The moment database.types.ts is regenerated after the
 * production migration and that key becomes real, this assignment
 * stops erroring, `@ts-expect-error` itself becomes a compile error
 * ("Unused '@ts-expect-error' directive"), and `npx tsc --noEmit`
 * turns red app-wide. That failure IS the instruction: delete the
 * `rpc` cast in lib/open-match.ts and call supabase.rpc directly.
 */
type GeneratedFunctionNames = keyof Database['public']['Functions'];

// @ts-expect-error — see the module comment above; this line existing
// (and expecting an error) is the whole test.
const _openMatchRpcCastStillNeeded: GeneratedFunctionNames = 'create_open_match';

it('is a type-only canary — see the file header; nothing to run at runtime', () => {
  expect(typeof _openMatchRpcCastStillNeeded).toBe('string');
});
