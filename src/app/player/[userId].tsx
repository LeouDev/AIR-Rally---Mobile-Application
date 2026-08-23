import { Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Avatar, PostCard } from '@/components/post-card';
import { ReportAction } from '@/components/report-action';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { PublicProfile } from '@/lib/database.types';
import {
  followUser,
  getFollowCounts,
  getPublicProfile,
  isFollowing,
  unfollowUser,
  type FollowCounts,
} from '@/lib/follows';
import { likePost, listLikedPostIds, listPostsByUser, listResharedPostIds, resharePost, unlikePost, unresharePost, type PostWithAuthor } from '@/lib/posts';
import { useSession } from '@/providers/session';

export default function PublicProfileScreen() {
  const theme = useTheme();
  const { userId } = useLocalSearchParams<{ userId: string }>();
  const { session } = useSession();
  const viewerId = session?.user.id ?? null;
  const isOwnProfile = viewerId === userId;

  const [profile, setProfile] = useState<PublicProfile | null | undefined>(undefined);
  const [counts, setCounts] = useState<FollowCounts>({ followers: 0, following: 0 });
  const [following, setFollowing] = useState(false);
  const [followBusy, setFollowBusy] = useState(false);
  const [posts, setPosts] = useState<PostWithAuthor[] | null>(null);
  const [likedIds, setLikedIds] = useState<Set<string>>(new Set());
  const [resharedIds, setResharedIds] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!userId) return;
    try {
      const [profileResult, countsResult, postsResult] = await Promise.all([
        getPublicProfile(userId),
        getFollowCounts(userId),
        listPostsByUser(userId),
      ]);
      setProfile(profileResult);
      setCounts(countsResult);
      setPosts(postsResult.posts);
      setError(null);

      if (viewerId && !isOwnProfile) {
        isFollowing(viewerId, userId).then(setFollowing).catch(() => {});
      }
      if (viewerId && postsResult.posts.length > 0) {
        const ids = postsResult.posts.map((p) => p.id);
        const [liked, reshared] = await Promise.all([listLikedPostIds(viewerId, ids), listResharedPostIds(viewerId, ids)]);
        setLikedIds(new Set(liked));
        setResharedIds(new Set(reshared));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "We couldn't load this profile.");
    }
  }, [userId, viewerId, isOwnProfile]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const toggleFollow = async () => {
    if (!viewerId || !userId || followBusy) return;
    const was = following;
    setFollowing(!was);
    setCounts((prev) => ({ ...prev, followers: prev.followers + (was ? -1 : 1) }));
    setFollowBusy(true);
    try {
      was ? await unfollowUser(viewerId, userId) : await followUser(viewerId, userId);
    } catch {
      setFollowing(was);
      setCounts((prev) => ({ ...prev, followers: prev.followers + (was ? 1 : -1) }));
    } finally {
      setFollowBusy(false);
    }
  };

  const toggleLike = async (postId: string) => {
    if (!viewerId) return;
    const was = likedIds.has(postId);
    setLikedIds((prev) => {
      const next = new Set(prev);
      was ? next.delete(postId) : next.add(postId);
      return next;
    });
    setPosts((prev) => prev?.map((p) => (p.id === postId ? { ...p, like_count: p.like_count + (was ? -1 : 1) } : p)) ?? prev);
    try {
      was ? await unlikePost(viewerId, postId) : await likePost(viewerId, postId);
    } catch {
      load();
    }
  };

  const toggleReshare = async (postId: string) => {
    if (!viewerId) return;
    const was = resharedIds.has(postId);
    setResharedIds((prev) => {
      const next = new Set(prev);
      was ? next.delete(postId) : next.add(postId);
      return next;
    });
    try {
      was ? await unresharePost(viewerId, postId) : await resharePost(viewerId, postId);
      load();
    } catch {
      load();
    }
  };

  return (
    <ThemedView style={styles.container}>
      <Stack.Screen
        options={{
          headerShown: true,
          title: profile?.display_name ?? 'Profile',
          headerBackButtonDisplayMode: 'minimal',
          // Absent on your own profile — reporting yourself is noise in
          // the moderation queue.
          headerRight:
            profile && !isOwnProfile
              ? () => <ReportAction targetType="user" targetId={profile.id} targetLabel="player" />
              : undefined,
        }}
      />
      <SafeAreaView style={styles.safeArea} edges={['bottom']}>
        {profile === undefined && error ? (
          <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <ThemedText type="subtitle">Couldn&apos;t load this profile</ThemedText>
            <ThemedText type="small" themeColor="subtle">
              {error}
            </ThemedText>
            <Button title="Try again" variant="secondary" onPress={load} />
          </View>
        ) : profile === undefined ? (
          <View style={styles.block}>
            <Skeleton height={100} radius={Radius.xl} />
          </View>
        ) : profile === null ? (
          <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <ThemedText type="subtitle">This profile isn&apos;t available</ThemedText>
          </View>
        ) : (
          <FlatList
            data={posts ?? []}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.list}
            renderItem={({ item }) => (
              <PostCard
                post={item}
                currentUserId={viewerId ?? ''}
                liked={likedIds.has(item.id)}
                reshared={resharedIds.has(item.id)}
                onToggleLike={() => toggleLike(item.id)}
                onToggleReshare={() => toggleReshare(item.id)}
              />
            )}
            ItemSeparatorComponent={() => <View style={{ height: Spacing.three }} />}
            ListHeaderComponent={
              <View style={styles.headerBlock}>
                <View style={[styles.profileCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
                  <Avatar profile={profile} size={64} />
                  <ThemedText type="subtitle">{profile.display_name ?? 'A player'}</ThemedText>
                  <View style={styles.statsRow}>
                    <View style={styles.statItem}>
                      <ThemedText type="smallBold">{counts.followers}</ThemedText>
                      <ThemedText type="caption" themeColor="mutedForeground">
                        Followers
                      </ThemedText>
                    </View>
                    <View style={styles.statItem}>
                      <ThemedText type="smallBold">{counts.following}</ThemedText>
                      <ThemedText type="caption" themeColor="mutedForeground">
                        Following
                      </ThemedText>
                    </View>
                    <View style={styles.statItem}>
                      <ThemedText type="smallBold">{posts?.length ?? 0}</ThemedText>
                      <ThemedText type="caption" themeColor="mutedForeground">
                        Posts
                      </ThemedText>
                    </View>
                  </View>
                  {!isOwnProfile && viewerId ? (
                    <Button
                      title={following ? 'Following' : 'Follow'}
                      variant={following ? 'secondary' : 'primary'}
                      onPress={toggleFollow}
                      disabled={followBusy}
                    />
                  ) : null}
                </View>
                <ThemedText type="smallBold">Posts</ThemedText>
              </View>
            }
            ListEmptyComponent={
              posts === null ? (
                <View style={styles.skeletons}>
                  <Skeleton height={120} radius={Radius.xl} />
                </View>
              ) : (
                <ThemedText type="small" themeColor="subtle" style={styles.emptyPosts}>
                  No posts yet.
                </ThemedText>
              )
            }
          />
        )}
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
  block: {
    padding: Spacing.four,
  },
  card: {
    margin: Spacing.four,
    borderRadius: Radius.xl,
    borderWidth: 1,
    padding: Spacing.four,
  },
  list: {
    padding: Spacing.four,
    maxWidth: MaxContentWidth,
    width: '100%',
    alignSelf: 'center',
  },
  headerBlock: {
    gap: Spacing.three,
    marginBottom: Spacing.one,
  },
  profileCard: {
    borderRadius: Radius.xl,
    borderWidth: 1,
    padding: Spacing.four,
    alignItems: 'center',
    gap: Spacing.two,
  },
  statsRow: {
    flexDirection: 'row',
    gap: Spacing.five,
  },
  statItem: {
    alignItems: 'center',
    gap: 2,
  },
  skeletons: {
    gap: Spacing.three,
  },
  emptyPosts: {
    paddingVertical: Spacing.four,
    textAlign: 'center',
  },
});
