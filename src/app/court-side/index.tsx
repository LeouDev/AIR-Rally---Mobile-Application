import { Stack, useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Avatar, PostCard } from '@/components/post-card';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { PublicProfile } from '@/lib/database.types';
import { searchPublicProfiles } from '@/lib/follows';
import {
  createPost,
  deletePost,
  likePost,
  listFeedPosts,
  listLikedPostIds,
  listResharedPostIds,
  recordPostMentions,
  resharePost,
  unlikePost,
  unresharePost,
  type FeedPost,
} from '@/lib/posts';
import { useSession } from '@/providers/session';

export default function CourtSideScreen() {
  const theme = useTheme();
  const { session } = useSession();
  const userId = session?.user.id ?? null;

  const [posts, setPosts] = useState<FeedPost[] | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [likedIds, setLikedIds] = useState<Set<string>>(new Set());
  const [resharedIds, setResharedIds] = useState<Set<string>>(new Set());

  const [content, setContent] = useState('');
  const [posting, setPosting] = useState(false);
  const [mentioned, setMentioned] = useState<Map<string, string>>(new Map());
  const [mentionResults, setMentionResults] = useState<PublicProfile[]>([]);
  const mentionSeq = useRef(0);

  const loadFirstPage = useCallback(async () => {
    try {
      const { posts: rows, nextCursor: cursor } = await listFeedPosts();
      setPosts(rows);
      setNextCursor(cursor);
      if (userId && rows.length > 0) {
        const ids = rows.map((r) => r.id);
        const [liked, reshared] = await Promise.all([listLikedPostIds(userId, ids), listResharedPostIds(userId, ids)]);
        setLikedIds(new Set(liked));
        setResharedIds(new Set(reshared));
      }
    } catch {
      setPosts([]);
    }
  }, [userId]);

  useFocusEffect(
    useCallback(() => {
      loadFirstPage();
    }, [loadFirstPage])
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadFirstPage();
    setRefreshing(false);
  }, [loadFirstPage]);

  const loadMore = useCallback(async () => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const { posts: rows, nextCursor: cursor } = await listFeedPosts({ cursor: nextCursor });
      setPosts((prev) => [...(prev ?? []), ...rows]);
      setNextCursor(cursor);
      if (userId && rows.length > 0) {
        const ids = rows.map((r) => r.id);
        const [liked, reshared] = await Promise.all([listLikedPostIds(userId, ids), listResharedPostIds(userId, ids)]);
        setLikedIds((prev) => new Set([...prev, ...liked]));
        setResharedIds((prev) => new Set([...prev, ...reshared]));
      }
    } finally {
      setLoadingMore(false);
    }
  }, [nextCursor, loadingMore, userId]);

  const onChangeContent = (value: string) => {
    setContent(value);
    const match = value.match(/@([a-zA-Z0-9_]{2,})$/);
    if (!match) {
      setMentionResults([]);
      return;
    }
    const seq = ++mentionSeq.current;
    searchPublicProfiles(match[1], 6).then((profiles) => {
      if (seq === mentionSeq.current) setMentionResults(profiles.filter((p) => p.id !== userId));
    });
  };

  const pickMention = (profile: PublicProfile) => {
    const name = profile.display_name ?? 'player';
    const handle = name.replace(/\s+/g, '');
    setContent((prev) => prev.replace(/@[a-zA-Z0-9_]*$/, `@${handle} `));
    setMentioned((prev) => new Map(prev).set(handle, profile.id));
    setMentionResults([]);
  };

  const submitPost = async () => {
    if (!userId || !content.trim() || posting) return;
    setPosting(true);
    try {
      const post = await createPost(userId, content.trim());
      // Only handles that survived edits after being picked — deleting an
      // "@handle" before posting must drop the mention notification too.
      const mentionedIds = Array.from(mentioned.entries())
        .filter(([handle]) => content.includes(`@${handle}`))
        .map(([, id]) => id);
      if (mentionedIds.length > 0) {
        recordPostMentions(post.id, userId, mentionedIds).catch(() => {});
      }
      setContent('');
      setMentioned(new Map());
      loadFirstPage();
    } catch {
      // Best-effort — the composer just keeps the draft so the player can retry.
    } finally {
      setPosting(false);
    }
  };

  const toggleLike = async (postId: string) => {
    if (!userId) return;
    const wasLiked = likedIds.has(postId);
    setLikedIds((prev) => {
      const next = new Set(prev);
      wasLiked ? next.delete(postId) : next.add(postId);
      return next;
    });
    setPosts((prev) => prev?.map((p) => (p.id === postId ? { ...p, like_count: p.like_count + (wasLiked ? -1 : 1) } : p)) ?? prev);
    try {
      wasLiked ? await unlikePost(userId, postId) : await likePost(userId, postId);
    } catch {
      loadFirstPage();
    }
  };

  const toggleReshare = async (postId: string) => {
    if (!userId) return;
    const wasReshared = resharedIds.has(postId);
    setResharedIds((prev) => {
      const next = new Set(prev);
      wasReshared ? next.delete(postId) : next.add(postId);
      return next;
    });
    try {
      wasReshared ? await unresharePost(userId, postId) : await resharePost(userId, postId);
      loadFirstPage();
    } catch {
      loadFirstPage();
    }
  };

  const handleDelete = async (postId: string) => {
    setPosts((prev) => prev?.filter((p) => p.id !== postId) ?? prev);
    try {
      await deletePost(postId);
    } catch {
      loadFirstPage();
    }
  };

  return (
    <ThemedView style={styles.container}>
      <Stack.Screen options={{ headerShown: true, title: 'COURT/Side', headerBackButtonDisplayMode: 'minimal' }} />
      <SafeAreaView style={styles.safeArea} edges={['bottom']}>
        <FlatList
          data={posts ?? []}
          keyExtractor={(item, index) => `${item.id}-${item.effective_at}-${index}`}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          onEndReachedThreshold={0.4}
          onEndReached={loadMore}
          contentContainerStyle={styles.list}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item }) => (
            <PostCard
              post={item}
              currentUserId={userId ?? ''}
              liked={likedIds.has(item.id)}
              reshared={resharedIds.has(item.id)}
              onToggleLike={() => toggleLike(item.id)}
              onToggleReshare={() => toggleReshare(item.id)}
              onDelete={item.user_id === userId ? () => handleDelete(item.id) : undefined}
            />
          )}
          ItemSeparatorComponent={() => <View style={{ height: Spacing.three }} />}
          ListHeaderComponent={
            <View style={styles.composerBlock}>
              <View style={[styles.composer, { backgroundColor: theme.card, borderColor: theme.border }]}>
                <View style={styles.composerRow}>
                  <Avatar profile={null} />
                  <TextInput
                    value={content}
                    onChangeText={onChangeContent}
                    placeholder="Share something with COURT/Side…"
                    placeholderTextColor={theme.placeholder}
                    multiline
                    maxLength={2000}
                    style={[styles.composerInput, { color: theme.cardForeground }]}
                  />
                </View>
                {mentionResults.length > 0 ? (
                  <View style={[styles.mentionList, { backgroundColor: theme.muted, borderColor: theme.border }]}>
                    {mentionResults.map((profile) => (
                      <Pressable
                        key={profile.id}
                        accessibilityRole="button"
                        onPress={() => pickMention(profile)}
                        style={styles.mentionRow}>
                        <Avatar profile={profile} size={22} />
                        <ThemedText type="small">{profile.display_name}</ThemedText>
                      </Pressable>
                    ))}
                  </View>
                ) : null}
                <View style={styles.composerFooter}>
                  <Button
                    title={posting ? 'Posting…' : 'Post'}
                    onPress={submitPost}
                    disabled={!content.trim() || posting}
                    loading={posting}
                  />
                </View>
              </View>
            </View>
          }
          ListEmptyComponent={
            posts === null ? (
              <View style={styles.skeletons}>
                <Skeleton height={140} radius={Radius.xl} />
                <Skeleton height={140} radius={Radius.xl} />
              </View>
            ) : (
              <View style={[styles.empty, { backgroundColor: theme.card, borderColor: theme.border }]}>
                <ThemedText type="subtitle">No posts yet</ThemedText>
                <ThemedText type="small" themeColor="subtle">
                  Be the first to share something with the community.
                </ThemedText>
              </View>
            )
          }
        />
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  list: {
    padding: Spacing.four,
    maxWidth: MaxContentWidth,
    width: '100%',
    alignSelf: 'center',
  },
  composerBlock: {
    marginBottom: Spacing.three,
  },
  composer: {
    borderRadius: Radius.xl,
    borderWidth: 1,
    padding: Spacing.three,
    gap: Spacing.two,
  },
  composerRow: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  composerInput: {
    flex: 1,
    fontSize: 15,
    minHeight: 40,
    maxHeight: 140,
  },
  mentionList: {
    borderRadius: Radius.md,
    borderWidth: 1,
    overflow: 'hidden',
  },
  mentionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.two,
  },
  composerFooter: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  skeletons: {
    gap: Spacing.three,
  },
  empty: {
    borderRadius: Radius.xl,
    borderWidth: 1,
    padding: Spacing.four,
    gap: Spacing.two,
  },
});
