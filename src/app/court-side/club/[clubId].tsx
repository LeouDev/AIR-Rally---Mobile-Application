import { Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { FlatList, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Avatar, PostCard } from '@/components/post-card';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/toast';
import { MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { useKeyboardAwareScroll } from '@/hooks/use-keyboard-aware-scroll';
import { useTheme } from '@/hooks/use-theme';
import { getClubForViewer, type ClubWithViewerState } from '@/lib/clubs';
import { getPublicProfile } from '@/lib/follows';
import { createPost, deletePost, likePost, listClubPosts, listLikedPostIds, unlikePost, type PostWithAuthor } from '@/lib/posts';
import type { PublicProfile } from '@/lib/database.types';
import { useSession } from '@/providers/session';

/** "My Club" — a leaner sibling of the main COURT/Side screen scoped to
 * one club. No reshare (blocked at the database for club posts), no
 * @mentions, no images — just text posts and likes. RLS is the real
 * membership boundary; this screen shows a clear non-member state
 * rather than trusting an empty feed to explain itself. */
export default function MyClubScreen() {
  const theme = useTheme();
  const { ref: listRef, props: keyboardProps, scrollFocusedIntoView } = useKeyboardAwareScroll<FlatList>();
  const { clubId } = useLocalSearchParams<{ clubId: string }>();
  const { session } = useSession();
  const userId = session?.user.id ?? null;
  const { show } = useToast();

  const [club, setClub] = useState<ClubWithViewerState | null | undefined>(undefined);
  const [myProfile, setMyProfile] = useState<PublicProfile | null>(null);
  const [posts, setPosts] = useState<PostWithAuthor[] | null>(null);
  const [likedIds, setLikedIds] = useState<Set<string>>(new Set());
  const [content, setContent] = useState('');
  const [posting, setPosting] = useState(false);

  const load = useCallback(async () => {
    if (!clubId) return;
    try {
      const clubResult = await getClubForViewer(clubId, userId);
      setClub(clubResult);
      if (!clubResult?.viewerRole) return;

      const [{ posts: rows }, profileResult] = await Promise.all([
        listClubPosts(clubId),
        userId ? getPublicProfile(userId) : Promise.resolve(null),
      ]);
      setPosts(rows);
      setMyProfile(profileResult);
      if (userId && rows.length > 0) {
        setLikedIds(new Set(await listLikedPostIds(userId, rows.map((r) => r.id))));
      }
    } catch {
      setClub(null);
    }
  }, [clubId, userId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const submitPost = async () => {
    if (!userId || !clubId || !content.trim() || posting) return;
    setPosting(true);
    try {
      await createPost(userId, content.trim(), null, clubId);
      setContent('');
      load();
    } catch {
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
      load();
    }
  };

  const handleDelete = async (postId: string) => {
    setPosts((prev) => prev?.filter((p) => p.id !== postId) ?? prev);
    try {
      await deletePost(postId);
    } catch {
      show("Couldn't delete the post. Please try again.", 'error');
      load();
    }
  };

  return (
    <ThemedView style={styles.container}>
      <Stack.Screen options={{ headerShown: true, title: 'My Club', headerBackButtonDisplayMode: 'minimal' }} />
      <SafeAreaView style={styles.safeArea} edges={['bottom']}>
        {/* See [postId].tsx — same swap, same reason. */}
        <View style={styles.flex}>
          {club === undefined ? (
            <View style={styles.block}>
              <Skeleton height={100} radius={Radius.xl} />
            </View>
          ) : club === null ? (
            <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
              <ThemedText type="subtitle">This club isn&apos;t available</ThemedText>
            </View>
          ) : !club.viewerRole ? (
            <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
              <ThemedText type="subtitle">You&apos;re not a member of {club.name}</ThemedText>
              <ThemedText type="small" themeColor="subtle">
                {club.viewerPending ? 'Your request to join is still pending.' : 'Join the club to see its posts.'}
              </ThemedText>
            </View>
          ) : (
            <FlatList
              ref={listRef}
              {...keyboardProps}
              data={posts ?? []}
              keyExtractor={(item) => item.id}
              contentContainerStyle={styles.list}
              ItemSeparatorComponent={() => <View style={{ height: Spacing.three }} />}
              ListHeaderComponent={
                <View style={styles.header}>
                  <ThemedText type="caption" themeColor="primary" style={styles.eyebrow}>
                    MY CLUB
                  </ThemedText>
                  <ThemedText type="title" style={styles.headline}>
                    {club.name}
                  </ThemedText>
                  <ThemedText type="small" themeColor="mutedForeground" style={styles.memberCount}>
                    Members-only — {club.member_count} member{club.member_count === 1 ? '' : 's'}
                  </ThemedText>

                  <View style={[styles.composer, { backgroundColor: theme.card, borderColor: theme.border }]}>
                    <View style={styles.composerRow}>
                      <Avatar profile={myProfile} />
                      <TextInput
                        onFocus={scrollFocusedIntoView}
                        value={content}
                        onChangeText={setContent}
                        placeholder={`Share something with ${club.name}…`}
                        placeholderTextColor={theme.placeholder}
                        multiline
                        maxLength={280}
                        style={[styles.composerInput, { color: theme.cardForeground }]}
                      />
                    </View>
                    <View style={styles.composerFooter}>
                      <Button title={posting ? 'Posting…' : 'Post'} onPress={submitPost} disabled={!content.trim() || posting} loading={posting} />
                    </View>
                  </View>
                </View>
              }
              renderItem={({ item }) => (
                <PostCard
                  post={item}
                  currentUserId={userId ?? ''}
                  liked={likedIds.has(item.id)}
                  reshared={false}
                  onToggleLike={() => toggleLike(item.id)}
                  onToggleReshare={() => {}}
                  onDelete={item.user_id === userId ? () => handleDelete(item.id) : undefined}
                />
              )}
              ListEmptyComponent={
                posts === null ? (
                  <View style={styles.skeletons}>
                    <Skeleton height={140} radius={Radius.xl} />
                  </View>
                ) : (
                  <View style={[styles.empty, { backgroundColor: theme.card, borderColor: theme.border }]}>
                    <ThemedText type="subtitle">Nobody&apos;s posted here yet</ThemedText>
                    <ThemedText type="small" themeColor="subtle">
                      Be the first to say something to {club.name}.
                    </ThemedText>
                  </View>
                )
              }
            />
          )}
        </View>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1 },
  flex: { flex: 1 },
  block: { padding: Spacing.four },
  card: {
    margin: Spacing.four,
    borderRadius: Radius.xl,
    borderWidth: 1,
    padding: Spacing.four,
    gap: Spacing.two,
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
    marginBottom: Spacing.one,
  },
  memberCount: {
    marginBottom: Spacing.four,
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
