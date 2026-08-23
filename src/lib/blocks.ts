import type { BlockedUser } from '@/lib/database.types';
import { supabase } from '@/lib/supabase';

/**
 * Blocking someone stops them from following you or seeing your posts,
 * comments, likes or reshares — and severs any existing follow between
 * you, both directions, at the database level (see the migration).
 * Rosters and search are deliberately untouched, on purpose: a block
 * must never hide who a player will physically meet at a court.
 *
 * user_blocks has no server-side RPC for writes — INSERT and DELETE go
 * straight through RLS, scoped to blocker_id = auth.uid(). The one
 * expected non-error case is blocking someone already blocked (the
 * table's own primary key on (blocker_id, blocked_id) raises 23505),
 * treated as success rather than surfaced — same convention as
 * likePost/resharePost elsewhere in this codebase.
 */
export async function blockUser(blockerId: string, blockedId: string): Promise<void> {
  const { error } = await supabase.from('user_blocks').insert({ blocker_id: blockerId, blocked_id: blockedId });
  if (error && error.code !== '23505') throw error;
}

/**
 * RLS scopes the delete to the caller's own outgoing blocks — a
 * mismatched id is a silent no-op, same convention as deletePost. There
 * is no confirmation step for unblocking: it's reversible (block again)
 * and low-stakes, unlike the block itself.
 */
export async function unblockUser(blockerId: string, blockedId: string): Promise<void> {
  const { error } = await supabase.from('user_blocks').delete().eq('blocker_id', blockerId).eq('blocked_id', blockedId);
  if (error) throw error;
}

/** The block-management screen's data source — joins in the display
 * name/avatar that user_blocks' own SELECT policy alone wouldn't. */
export async function listMyBlocks(): Promise<BlockedUser[]> {
  const { data, error } = await supabase.rpc('list_my_blocks');
  if (error) throw error;
  return data ?? [];
}
