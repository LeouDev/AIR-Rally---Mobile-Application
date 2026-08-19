import { Stack, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { Alert, FlatList, KeyboardAvoidingView, Platform, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Avatar, PostCard } from '@/components/post-card';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/toast';
import { MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { formatRelativeTime } from '@/lib/relative-time';
import {
  createComment,
  deleteComment,
  likePost,
  listCommentsForPost,
  listLikedPostIds,
  listResharedPostIds,
  resharePost,
  unlikePost,
  unresharePost,
  type PostCommentWithAuthor,
  type PostWithAuthor,
} from '@/lib/posts';
import { supabase } from '@/lib/supabase';
import { useSession } from '@/providers/session';

export default function PostDetailScreen() {
  const theme = useTheme();
  const { postId } = useLocalSearchParams<{ postId: string }>();
  const { session } = useSession();
  const userId = session?.user.id ?? null;
  const { show } = useToast();

  const [post, setPost] = useState<PostWithAuthor | null | undefined>(undefined);
  const [comments, setComments] = useState<PostCommentWithAuthor[] | null>(null);
  const [liked, setLiked] = useState(false);
  const [reshared, setReshared] = useState(false);
  const [draft, setDraft] = useState('');
  const [posting, setPosting] = useState(false);

  const load = useCallback(async () => {
    if (!postId) return;
    const [postResult, commentRows] = await Promise.all([
      supabase.from('posts').select('*').eq('id', postId).maybeSingle(),
      listCommentsForPost(postId),
    ]);
    if (postResult.error || !postResult.data) {
      setPost(null);
      return;
    }
    const authorResult = await supabase.from('public_profiles').select('*').eq('id', postResult.data.user_id).maybeSingle();
    setPost({ ...postResult.data, author: authorResult.data ?? null });
    setComments(commentRows);
    if (userId) {
      const [likedIds, resharedIds] = await Promise.all([
        listLikedPostIds(userId, [postId]),
        listResharedPostIds(userId, [postId]),
      ]);
      setLiked(likedIds.includes(postId));
      setReshared(resharedIds.includes(postId));
    }
  }, [postId, userId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const toggleLike = async () => {
    if (!userId || !postId) return;
    const was = liked;
    setLiked(!was);
    setPost((prev) => (prev ? { ...prev, like_count: prev.like_count + (was ? -1 : 1) } : prev));
    try {
      was ? await unlikePost(userId, postId) : await likePost(userId, postId);
    } catch {
      load();
    }
  };

  const toggleReshare = async () => {
    if (!userId || !postId) return;
    const was = reshared;
    setReshared(!was);
    try {
      was ? await unresharePost(userId, postId) : await resharePost(userId, postId);
      load();
    } catch {
      load();
    }
  };

  const submitComment = async () => {
    if (!userId || !postId || !draft.trim() || posting) return;
    setPosting(true);
    try {
      await createComment(userId, postId, draft.trim());
      setDraft('');
      load();
    } catch {
      show("Couldn't post your comment. Please try again.", 'error');
    } finally {
      setPosting(false);
    }
  };

  const removeComment = (commentId: string) => {
    Alert.alert('Delete comment?', 'This can\'t be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          setComments((prev) => prev?.filter((c) => c.id !== commentId) ?? prev);
          try {
            await deleteComment(commentId);
          } catch {
            show("Couldn't delete the comment. Please try again.", 'error');
            load();
          }
        },
      },
    ]);
  };

  return (
    <ThemedView style={styles.container}>
      <Stack.Screen options={{ headerShown: true, title: 'Post', headerBackButtonDisplayMode: 'minimal' }} />
      <SafeAreaView style={styles.safeArea} edges={['bottom']}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flex}>
          {post === undefined ? (
            <View style={styles.block}>
              <Skeleton height={140} radius={Radius.xl} />
            </View>
          ) : post === null ? (
            <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
              <ThemedText type="subtitle">This post isn&apos;t available</ThemedText>
            </View>
          ) : (
            <FlatList
              data={comments ?? []}
              keyExtractor={(item) => item.id}
              contentContainerStyle={styles.list}
              keyboardShouldPersistTaps="handled"
              ListHeaderComponent={
                <View style={styles.headerBlock}>
                  <PostCard
                    post={post}
                    currentUserId={userId ?? ''}
                    liked={liked}
                    reshared={reshared}
                    onToggleLike={toggleLike}
                    onToggleReshare={toggleReshare}
                  />
                  <ThemedText type="smallBold">Comments</ThemedText>
                </View>
              }
              renderItem={({ item }) => (
                <View style={styles.commentRow}>
                  <Avatar profile={item.author} size={28} />
                  <View style={styles.commentBody}>
                    <ThemedText type="small">
                      <ThemedText type="smallBold">{item.author?.display_name ?? 'A player'}</ThemedText>{' '}
                      {item.content}
                    </ThemedText>
                    <View style={styles.commentMeta}>
                      <ThemedText type="caption" themeColor="mutedForeground">
                        {formatRelativeTime(item.created_at)}
                      </ThemedText>
                      {item.user_id === userId ? (
                        <ThemedText type="caption" themeColor="destructive" onPress={() => removeComment(item.id)}>
                          Delete
                        </ThemedText>
                      ) : null}
                    </View>
                  </View>
                </View>
              )}
              ListEmptyComponent={
                <ThemedText type="small" themeColor="subtle" style={styles.emptyComments}>
                  No comments yet.
                </ThemedText>
              }
              ListFooterComponent={
                userId ? (
                  <View style={[styles.composer, { backgroundColor: theme.card, borderColor: theme.border }]}>
                    <TextInput
                      value={draft}
                      onChangeText={setDraft}
                      placeholder="Add a comment…"
                      placeholderTextColor={theme.placeholder}
                      style={[styles.input, { color: theme.cardForeground }]}
                      multiline
                      maxLength={500}
                    />
                    <Button title="Send" onPress={submitComment} disabled={!draft.trim() || posting} loading={posting} />
                  </View>
                ) : null
              }
            />
          )}
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
    gap: Spacing.three,
    maxWidth: MaxContentWidth,
    width: '100%',
    alignSelf: 'center',
  },
  headerBlock: {
    gap: Spacing.three,
    marginBottom: Spacing.one,
  },
  commentRow: {
    flexDirection: 'row',
    gap: Spacing.two,
    paddingVertical: Spacing.one,
  },
  commentBody: {
    flex: 1,
    gap: 2,
  },
  commentMeta: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  emptyComments: {
    paddingVertical: Spacing.three,
  },
  composer: {
    borderRadius: Radius.lg,
    borderWidth: 1,
    padding: Spacing.two,
    gap: Spacing.two,
    marginTop: Spacing.two,
  },
  input: {
    minHeight: 40,
    maxHeight: 120,
    fontSize: 15,
  },
});
