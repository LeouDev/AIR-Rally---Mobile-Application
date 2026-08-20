import type { Post, PostComment, PublicProfile } from '@/lib/database.types';
import { listEmbeddedEvents, type EmbeddedEvent } from '@/lib/events';
import { supabase } from '@/lib/supabase';

/** `event` is populated whenever post.event_id is set — a post that
 * shared a match embeds a joinable card, everywhere a post renders. */
export type PostWithAuthor = Post & { author: PublicProfile | null; event?: EmbeddedEvent | null };
export type FeedPost = PostWithAuthor & { effective_at: string; resharer_id: string | null; resharer: PublicProfile | null };
export type PostCommentWithAuthor = PostComment & { author: PublicProfile | null };

const FEED_PAGE_SIZE = 20;

async function profilesByIds(ids: string[]): Promise<Map<string, PublicProfile>> {
  if (ids.length === 0) return new Map();
  const { data, error } = await supabase.from('public_profiles').select('*').in('id', Array.from(new Set(ids)));
  if (error) throw error;
  return new Map((data ?? []).map((p) => [p.id, p]));
}

async function attachAuthors<T extends { user_id: string }>(rows: T[]): Promise<(T & { author: PublicProfile | null })[]> {
  if (rows.length === 0) return [];
  const authors = await profilesByIds(rows.map((r) => r.user_id));
  return rows.map((row) => ({ ...row, author: authors.get(row.user_id) ?? null }));
}

/** Attaches embedded event summaries to whichever rows carry an
 * event_id. Not just `!== null`: a row from an unmigrated database
 * omits the key rather than nulling it, and `undefined` slipping
 * through here becomes the literal string "undefined" in the next
 * .in() call (hit this for real testing the web equivalent). */
async function attachEvents<T extends { event_id: string | null }>(
  rows: T[]
): Promise<(T & { event: EmbeddedEvent | null })[]> {
  const eventIds = Array.from(new Set(rows.map((r) => r.event_id).filter((id): id is string => id !== null && id !== undefined)));
  const eventsById = await listEmbeddedEvents(eventIds);
  return rows.map((row) => ({ ...row, event: row.event_id ? (eventsById.get(row.event_id) ?? null) : null }));
}

/** The COURT/Side feed, via the same court_side_feed() RPC the web uses —
 * SECURITY INVOKER, so RLS applies exactly as a direct query would. The
 * cursor is effective_at (a reshare's own time, not the original post's),
 * which is invisible to callers: still just an ISO string from the last row. */
export async function listFeedPosts({
  limit = FEED_PAGE_SIZE,
  cursor,
}: { limit?: number; cursor?: string } = {}): Promise<{ posts: FeedPost[]; nextCursor: string | null }> {
  const { data, error } = await supabase.rpc('court_side_feed', { p_limit: limit, p_cursor: cursor });
  if (error) throw error;

  const rows = data ?? [];
  const authorIds = rows.map((r) => r.user_id);
  const resharerIds = rows.map((r) => r.resharer_id).filter((id): id is string => id !== null);
  const [profiles, rowsWithEvents] = await Promise.all([profilesByIds([...authorIds, ...resharerIds]), attachEvents(rows)]);

  const posts: FeedPost[] = rowsWithEvents.map((row) => ({
    ...row,
    author: profiles.get(row.user_id) ?? null,
    resharer: row.resharer_id ? (profiles.get(row.resharer_id) ?? null) : null,
  }));

  const nextCursor = rows.length === limit ? rows[rows.length - 1].effective_at : null;
  return { posts, nextCursor };
}

/** One user's own COURT/Side history — backs the public profile page. */
export async function listPostsByUser(
  userId: string,
  { limit = FEED_PAGE_SIZE, cursor }: { limit?: number; cursor?: string } = {}
): Promise<{ posts: PostWithAuthor[]; nextCursor: string | null }> {
  let query = supabase.from('posts').select('*').eq('user_id', userId).order('created_at', { ascending: false }).limit(limit);
  if (cursor) query = query.lt('created_at', cursor);

  const { data, error } = await query;
  if (error) throw error;

  const [withAuthors, withEvents] = await Promise.all([attachAuthors(data ?? []), attachEvents(data ?? [])]);
  const eventById = new Map(withEvents.map((row) => [row.id, row.event]));
  const posts = withAuthors.map((row) => ({ ...row, event: eventById.get(row.id) ?? null }));
  const nextCursor = data && data.length === limit ? data[data.length - 1].created_at : null;
  return { posts, nextCursor };
}

/** One club's own feed — "My Club". A club post can never be reshared
 * (post_reshares' insert policy blocks it), so this is a direct query,
 * not the court_side_feed() RPC — no reshare union to build. */
export async function listClubPosts(
  clubId: string,
  { limit = FEED_PAGE_SIZE, cursor }: { limit?: number; cursor?: string } = {}
): Promise<{ posts: PostWithAuthor[]; nextCursor: string | null }> {
  let query = supabase.from('posts').select('*').eq('club_id', clubId).order('created_at', { ascending: false }).limit(limit);
  if (cursor) query = query.lt('created_at', cursor);

  const { data, error } = await query;
  if (error) throw error;

  const [withAuthors, withEvents] = await Promise.all([attachAuthors(data ?? []), attachEvents(data ?? [])]);
  const eventById = new Map(withEvents.map((row) => [row.id, row.event]));
  const posts = withAuthors.map((row) => ({ ...row, event: eventById.get(row.id) ?? null }));
  const nextCursor = data && data.length === limit ? data[data.length - 1].created_at : null;
  return { posts, nextCursor };
}

export async function createPost(
  userId: string,
  content: string,
  eventId?: string | null,
  clubId?: string | null
): Promise<Post> {
  const { data, error } = await supabase
    .from('posts')
    .insert({ user_id: userId, content, image_url: null, image_paths: [], event_id: eventId ?? null, club_id: clubId ?? null })
    .select()
    .single();
  if (error) throw error;
  return data;
}

/** RLS scopes this to the caller's own post — a mismatched id is a silent no-op. */
export async function deletePost(postId: string): Promise<void> {
  const { error } = await supabase.from('posts').delete().eq('id', postId);
  if (error) throw error;
}

export async function likePost(userId: string, postId: string): Promise<void> {
  const { error } = await supabase.from('post_likes').insert({ post_id: postId, user_id: userId });
  if (error && error.code !== '23505') throw error;
}

export async function unlikePost(userId: string, postId: string): Promise<void> {
  const { error } = await supabase.from('post_likes').delete().eq('post_id', postId).eq('user_id', userId);
  if (error) throw error;
}

export async function listLikedPostIds(userId: string, postIds: string[]): Promise<string[]> {
  if (postIds.length === 0) return [];
  const { data, error } = await supabase.from('post_likes').select('post_id').eq('user_id', userId).in('post_id', postIds);
  if (error) throw error;
  return (data ?? []).map((row) => row.post_id);
}

export async function resharePost(userId: string, postId: string): Promise<void> {
  const { error } = await supabase.from('post_reshares').insert({ post_id: postId, user_id: userId });
  if (error && error.code !== '23505') throw error;
}

export async function unresharePost(userId: string, postId: string): Promise<void> {
  const { error } = await supabase.from('post_reshares').delete().eq('post_id', postId).eq('user_id', userId);
  if (error) throw error;
}

export async function listResharedPostIds(userId: string, postIds: string[]): Promise<string[]> {
  if (postIds.length === 0) return [];
  const { data, error } = await supabase.from('post_reshares').select('post_id').eq('user_id', userId).in('post_id', postIds);
  if (error) throw error;
  return (data ?? []).map((row) => row.post_id);
}

export async function listCommentsForPost(postId: string): Promise<PostCommentWithAuthor[]> {
  const { data, error } = await supabase
    .from('post_comments')
    .select('*')
    .eq('post_id', postId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return attachAuthors(data ?? []);
}

export async function createComment(userId: string, postId: string, content: string): Promise<PostComment> {
  const { data, error } = await supabase.from('post_comments').insert({ post_id: postId, user_id: userId, content }).select().single();
  if (error) throw error;
  return data;
}

export async function deleteComment(commentId: string): Promise<void> {
  const { error } = await supabase.from('post_comments').delete().eq('id', commentId);
  if (error) throw error;
}

/** Records who a post tagged — ids from a picker, not re-parsed from text,
 * because "@Lea" doesn't identify a person on its own. Best-effort: a
 * mention failure must never lose the post that was already created. */
export async function recordPostMentions(postId: string, authorId: string, userIds: string[]): Promise<void> {
  const targets = Array.from(new Set(userIds)).filter((id) => id !== authorId);
  if (targets.length === 0) return;
  const { error } = await supabase.from('post_mentions').insert(targets.map((userId) => ({ post_id: postId, user_id: userId })));
  if (error && error.code !== '23505') throw error;
}
