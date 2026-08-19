import type { PublicProfile } from '@/lib/database.types';
import { supabase } from '@/lib/supabase';

/** Idempotent — following someone already followed is a no-op. The
 * self-follow CHECK constraint on the follows table is the real guard. */
export async function followUser(followerId: string, followingId: string): Promise<void> {
  const { error } = await supabase.from('follows').insert({ follower_id: followerId, following_id: followingId });
  if (error && error.code !== '23505') throw error;
}

export async function unfollowUser(followerId: string, followingId: string): Promise<void> {
  const { error } = await supabase
    .from('follows')
    .delete()
    .eq('follower_id', followerId)
    .eq('following_id', followingId);
  if (error) throw error;
}

export async function isFollowing(followerId: string, followingId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('follows')
    .select('follower_id')
    .eq('follower_id', followerId)
    .eq('following_id', followingId)
    .maybeSingle();
  if (error) throw error;
  return data !== null;
}

/** Which of the given user ids the caller already follows — one query
 * for a whole feed page, instead of one per author card. */
export async function listFollowingIds(followerId: string, targetIds: string[]): Promise<string[]> {
  if (targetIds.length === 0) return [];
  const { data, error } = await supabase
    .from('follows')
    .select('following_id')
    .eq('follower_id', followerId)
    .in('following_id', targetIds);
  if (error) throw error;
  return (data ?? []).map((row) => row.following_id);
}

export type FollowCounts = { followers: number; following: number };

export async function getFollowCounts(userId: string): Promise<FollowCounts> {
  const [followersResult, followingResult] = await Promise.all([
    supabase.from('follows').select('follower_id', { count: 'exact', head: true }).eq('following_id', userId),
    supabase.from('follows').select('following_id', { count: 'exact', head: true }).eq('follower_id', userId),
  ]);
  if (followersResult.error) throw followersResult.error;
  if (followingResult.error) throw followingResult.error;
  return { followers: followersResult.count ?? 0, following: followingResult.count ?? 0 };
}

export async function getPublicProfile(userId: string): Promise<PublicProfile | null> {
  const { data, error } = await supabase.from('public_profiles').select('*').eq('id', userId).maybeSingle();
  if (error) throw error;
  return data;
}

/** Backs the @mention picker in COURT/Side's composer. */
export async function searchPublicProfiles(query: string, limit = 8): Promise<PublicProfile[]> {
  const term = query.trim();
  if (!term) return [];
  const { data, error } = await supabase
    .from('public_profiles')
    .select('*')
    .not('display_name', 'is', null)
    .ilike('display_name', `%${term}%`)
    .limit(limit);
  if (error) throw error;
  return data ?? [];
}
