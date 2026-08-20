import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { router, Stack, useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { Alert, FlatList, KeyboardAvoidingView, Platform, Pressable, RefreshControl, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Avatar, PostCard } from '@/components/post-card';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/toast';
import { MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { Club, EventAttendeeStatus, PublicProfile } from '@/lib/database.types';
import { listClubsForUser } from '@/lib/clubs';
import { joinEvent, leaveEvent, listMyEventStatuses } from '@/lib/events';
import { followUser, getFollowCounts, getPublicProfile, listFollowingIds, searchPublicProfiles, unfollowUser, type FollowCounts } from '@/lib/follows';
import { MAX_POST_IMAGES, pickPostImages, uploadPostImages, type PickedPostImage } from '@/lib/post-images';
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

const FEED_TABS = ['For you', 'Following', 'Near you'] as const;

export default function CourtSideScreen() {
  const theme = useTheme();
  const { session } = useSession();
  const userId = session?.user.id ?? null;
  const { show } = useToast();

  const [activeTab, setActiveTab] = useState<(typeof FEED_TABS)[number]>('For you');
  const [myProfile, setMyProfile] = useState<PublicProfile | null>(null);
  const [counts, setCounts] = useState<FollowCounts>({ followers: 0, following: 0 });
  const [myClubs, setMyClubs] = useState<Club[]>([]);

  const [posts, setPosts] = useState<FeedPost[] | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [likedIds, setLikedIds] = useState<Set<string>>(new Set());
  const [resharedIds, setResharedIds] = useState<Set<string>>(new Set());
  const [followingIds, setFollowingIds] = useState<Set<string>>(new Set());
  const [eventStatuses, setEventStatuses] = useState<Map<string, EventAttendeeStatus>>(new Map());

  const [content, setContent] = useState('');
  const [posting, setPosting] = useState(false);
  const [mentioned, setMentioned] = useState<Map<string, string>>(new Map());
  const [mentionResults, setMentionResults] = useState<PublicProfile[]>([]);
  const mentionSeq = useRef(0);
  const [pendingImages, setPendingImages] = useState<PickedPostImage[]>([]);
  const contentInputRef = useRef<TextInput>(null);

  const loadFirstPage = useCallback(async () => {
    try {
      const [{ posts: rows, nextCursor: cursor }, profileResult, countsResult, clubsResult] = await Promise.all([
        listFeedPosts(),
        userId ? getPublicProfile(userId) : Promise.resolve(null),
        userId ? getFollowCounts(userId) : Promise.resolve({ followers: 0, following: 0 }),
        userId ? listClubsForUser(userId) : Promise.resolve([]),
      ]);
      setPosts(rows);
      setNextCursor(cursor);
      setMyProfile(profileResult);
      setCounts(countsResult);
      setMyClubs(clubsResult);
      if (userId && rows.length > 0) {
        const ids = rows.map((r) => r.id);
        const eventIds = rows.map((r) => r.event?.id).filter((id): id is string => id !== undefined && id !== null);
        const authorIds = Array.from(new Set(rows.map((r) => r.user_id)));
        const [liked, reshared, statuses, following] = await Promise.all([
          listLikedPostIds(userId, ids),
          listResharedPostIds(userId, ids),
          listMyEventStatuses(userId, eventIds),
          listFollowingIds(userId, authorIds),
        ]);
        setLikedIds(new Set(liked));
        setResharedIds(new Set(reshared));
        setEventStatuses(statuses);
        setFollowingIds(new Set(following));
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
        const authorIds = Array.from(new Set(rows.map((r) => r.user_id)));
        const [liked, reshared, following] = await Promise.all([
          listLikedPostIds(userId, ids),
          listResharedPostIds(userId, ids),
          listFollowingIds(userId, authorIds),
        ]);
        setLikedIds((prev) => new Set([...prev, ...liked]));
        setResharedIds((prev) => new Set([...prev, ...reshared]));
        setFollowingIds((prev) => new Set([...prev, ...following]));
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

  /** Inserting "@" through the button re-enters the same live-search path
   * typing it would — onChangeContent's own regex picks it up from there. */
  const insertTagTrigger = () => {
    const next = content.length > 0 && !content.endsWith(' ') ? `${content} @` : `${content}@`;
    onChangeContent(next);
    contentInputRef.current?.focus();
  };

  const addImages = async () => {
    const room = MAX_POST_IMAGES - pendingImages.length;
    if (room <= 0) {
      show(`You can attach up to ${MAX_POST_IMAGES} photos.`, 'error');
      return;
    }
    const picked = await pickPostImages(room);
    if (picked.length === 0) return;
    setPendingImages((prev) => [...prev, ...picked].slice(0, MAX_POST_IMAGES));
  };

  const removeImage = (index: number) => {
    setPendingImages((prev) => prev.filter((_, i) => i !== index));
  };

  const submitPost = async () => {
    if (!userId || !content.trim() || posting) return;
    setPosting(true);
    try {
      let imagePaths: string[] = [];
      if (pendingImages.length > 0) {
        const upload = await uploadPostImages(userId, pendingImages);
        imagePaths = upload.paths;
        upload.errors.forEach((message) => show(message, 'error'));
        if (imagePaths.length === 0) {
          setPosting(false);
          return;
        }
      }
      const post = await createPost(userId, content.trim(), null, null, imagePaths);
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
      setPendingImages([]);
      loadFirstPage();
    } catch {
      // The composer keeps the draft so the player can retry.
      show("Couldn't post. Please try again.", 'error');
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

  // Not optimistic: a join no longer always lands a seat (it may land
  // pending_approval or waitlisted instead), so there's nothing safe to
  // guess here — apply the database's actual answer once it's back.
  const toggleJoinEvent = async (eventId: string) => {
    if (!userId) return;
    const previousStatus = eventStatuses.get(eventId) ?? null;
    try {
      const active = previousStatus === 'joined' || previousStatus === 'waitlisted' || previousStatus === 'pending_approval';
      const nextStatus = active ? null : await joinEvent(userId, eventId);
      if (active) await leaveEvent(userId, eventId);
      setEventStatuses((prev) => {
        const next = new Map(prev);
        if (nextStatus) next.set(eventId, nextStatus);
        else next.delete(eventId);
        return next;
      });
      if (nextStatus === 'pending_approval') show('Request sent — the organiser will review it.');
      else if (nextStatus === 'joined') show("You're in!");
      else if (nextStatus === 'waitlisted') show("You're on the waitlist.");
    } catch {
      show("Couldn't update that. Try again.", 'error');
    }
  };

  const toggleFollow = async (authorId: string) => {
    if (!userId) return;
    const wasFollowing = followingIds.has(authorId);
    setFollowingIds((prev) => {
      const next = new Set(prev);
      wasFollowing ? next.delete(authorId) : next.add(authorId);
      return next;
    });
    try {
      wasFollowing ? await unfollowUser(userId, authorId) : await followUser(userId, authorId);
    } catch {
      setFollowingIds((prev) => {
        const next = new Set(prev);
        wasFollowing ? next.add(authorId) : next.delete(authorId);
        return next;
      });
      show("Couldn't update that. Try again.", 'error');
    }
  };

  const handleDelete = (postId: string) => {
    Alert.alert('Delete post?', 'This can\'t be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          setPosts((prev) => prev?.filter((p) => p.id !== postId) ?? prev);
          try {
            await deletePost(postId);
          } catch {
            show("Couldn't delete the post. Please try again.", 'error');
            loadFirstPage();
          }
        },
      },
    ]);
  };

  return (
    <ThemedView style={styles.container}>
      <Stack.Screen options={{ headerShown: true, title: 'COURT/Side', headerBackButtonDisplayMode: 'minimal' }} />
      <SafeAreaView style={styles.safeArea} edges={['bottom']}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flex}>
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
                eventStatus={item.event ? (eventStatuses.get(item.event.id) ?? null) : null}
                onToggleJoinEvent={toggleJoinEvent}
                isFollowingAuthor={followingIds.has(item.user_id)}
                onToggleFollow={toggleFollow}
              />
            )}
            ItemSeparatorComponent={() => <View style={{ height: Spacing.three }} />}
            ListHeaderComponent={
              <View>
                <View style={styles.header}>
                  <ThemedText type="caption" themeColor="primary" style={styles.eyebrow}>
                    COURT/SIDE
                  </ThemedText>
                  <ThemedText type="title" style={styles.headline}>
                    Rally together.
                  </ThemedText>
                  <View style={styles.metaRow}>
                    <Pressable
                      accessibilityRole="button"
                      onPress={() => userId && router.push({ pathname: '/player/[userId]', params: { userId } })}
                      style={styles.myRallyLink}
                      hitSlop={6}>
                      <Ionicons name="people" size={16} color={theme.primary} />
                      <ThemedText type="smallBold" themeColor="primary">
                        My/Rally
                      </ThemedText>
                    </Pressable>
                    <ThemedText type="small" themeColor="mutedForeground">
                      {counts.followers} followers
                    </ThemedText>
                    <ThemedText type="small" themeColor="mutedForeground">
                      {counts.following} following
                    </ThemedText>
                  </View>
                  <View style={[styles.tabsRow, { borderBottomColor: theme.border }]}>
                    {FEED_TABS.map((tab) => (
                      <Pressable
                        key={tab}
                        accessibilityRole="button"
                        accessibilityState={{ selected: activeTab === tab }}
                        onPress={() => {
                          setActiveTab(tab);
                          if (tab !== 'For you') show(`${tab} feed selected`);
                        }}
                        style={styles.tab}
                        hitSlop={4}>
                        <ThemedText type="smallBold" themeColor={activeTab === tab ? 'foreground' : 'mutedForeground'}>
                          {tab}
                        </ThemedText>
                        {activeTab === tab ? <View style={[styles.tabIndicator, { backgroundColor: theme.primary }]} /> : null}
                      </Pressable>
                    ))}
                  </View>
                </View>
                {myClubs.length > 0 ? (
                  <View style={styles.myClubsRow}>
                    {myClubs.map((club) => (
                      <Pressable
                        key={club.id}
                        accessibilityRole="button"
                        onPress={() => router.push({ pathname: '/court-side/club/[clubId]', params: { clubId: club.id } })}
                        style={[styles.myClubChip, { borderColor: theme.border }]}>
                        <Ionicons name="people" size={13} color={theme.primary} />
                        <ThemedText type="small">{club.name}</ThemedText>
                      </Pressable>
                    ))}
                  </View>
                ) : null}
                <View style={styles.composerBlock}>
                <View style={[styles.composer, { backgroundColor: theme.card, borderColor: theme.border }]}>
                  <View style={styles.composerRow}>
                    <Avatar profile={myProfile} />
                    <TextInput
                      ref={contentInputRef}
                      value={content}
                      onChangeText={onChangeContent}
                      placeholder="Share something with COURT/Side…"
                      placeholderTextColor={theme.placeholder}
                      multiline
                      maxLength={280}
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
                  {pendingImages.length > 0 ? (
                    <View style={styles.pendingImageRow}>
                      {pendingImages.map((image, index) => (
                        <View key={image.uri} style={styles.pendingImageWrap}>
                          <Image source={{ uri: image.uri }} style={styles.pendingImage} contentFit="cover" />
                          <Pressable
                            accessibilityRole="button"
                            accessibilityLabel={`Remove photo ${index + 1}`}
                            onPress={() => removeImage(index)}
                            style={[styles.pendingImageRemove, { backgroundColor: theme.foreground }]}
                            hitSlop={6}>
                            <Ionicons name="close" size={12} color={theme.background} />
                          </Pressable>
                        </View>
                      ))}
                    </View>
                  ) : null}
                  <View style={[styles.composerToolbar, { borderTopColor: theme.border }]}>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Add photos"
                      onPress={addImages}
                      disabled={pendingImages.length >= MAX_POST_IMAGES}
                      style={[styles.toolbarButton, pendingImages.length >= MAX_POST_IMAGES && styles.toolbarButtonDisabled]}
                      hitSlop={6}>
                      <Ionicons name="images-outline" size={18} color={theme.mutedForeground} />
                    </Pressable>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Tag a player"
                      onPress={insertTagTrigger}
                      style={styles.toolbarButton}
                      hitSlop={6}>
                      <Ionicons name="at-outline" size={18} color={theme.mutedForeground} />
                    </Pressable>
                    <ThemedText type="caption" themeColor="mutedForeground" style={styles.charCount}>
                      {content.length} / 280
                    </ThemedText>
                    <Button
                      title={posting ? 'Posting…' : 'Post'}
                      onPress={submitPost}
                      disabled={!content.trim() || posting}
                      loading={posting}
                    />
                  </View>
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
        </KeyboardAvoidingView>
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
  flex: {
    flex: 1,
  },
  list: {
    padding: Spacing.four,
    maxWidth: MaxContentWidth,
    width: '100%',
    alignSelf: 'center',
  },
  header: {
    marginBottom: Spacing.four,
  },
  eyebrow: {
    fontWeight: '700',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    marginBottom: Spacing.one,
  },
  headline: {
    marginBottom: Spacing.three,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: Spacing.three,
    marginBottom: Spacing.four,
  },
  myRallyLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  tabsRow: {
    flexDirection: 'row',
    gap: Spacing.four,
    borderBottomWidth: 1,
  },
  tab: {
    paddingBottom: Spacing.two,
  },
  tabIndicator: {
    marginTop: Spacing.two,
    height: 2,
    borderRadius: 1,
  },
  myClubsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
    marginTop: Spacing.three,
  },
  myClubChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.one,
    borderRadius: Radius.pill,
    borderWidth: 1,
  },
  composerBlock: {
    marginTop: Spacing.four,
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
  pendingImageRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  pendingImageWrap: {
    position: 'relative',
  },
  pendingImage: {
    width: 64,
    height: 64,
    borderRadius: Radius.md,
  },
  pendingImageRemove: {
    position: 'absolute',
    top: -6,
    right: -6,
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  composerToolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    borderTopWidth: 1,
    paddingTop: Spacing.two,
  },
  toolbarButton: {
    padding: 2,
  },
  toolbarButtonDisabled: {
    opacity: 0.4,
  },
  charCount: {
    marginLeft: 'auto',
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
