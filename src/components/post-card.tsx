import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { PublicProfile } from '@/lib/database.types';
import { formatRelativeTime } from '@/lib/relative-time';
import type { PostWithAuthor } from '@/lib/posts';

/** "@Name" picked out in bold — a hand-typed mention that doesn't resolve
 * to anyone still degrades gracefully to highlighted plain text, same as
 * the web. */
function renderContent(content: string) {
  const parts = content.split(/(@[a-zA-Z0-9_]+)/g);
  return parts.map((part, i) =>
    part.startsWith('@') ? (
      <ThemedText key={i} type="small" themeColor="primary" style={styles.mention}>
        {part}
      </ThemedText>
    ) : (
      <ThemedText key={i} type="small">
        {part}
      </ThemedText>
    )
  );
}

export function Avatar({ profile, size = 36 }: { profile: PublicProfile | null; size?: number }) {
  const theme = useTheme();
  const initials = (profile?.display_name ?? '?')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('');
  return (
    <View
      style={[
        styles.avatar,
        { width: size, height: size, borderRadius: size / 2, backgroundColor: theme.accent },
      ]}>
      <ThemedText type="caption" style={{ color: theme.accentForeground }}>
        {initials || '?'}
      </ThemedText>
    </View>
  );
}

type PostCardProps = {
  post: PostWithAuthor & { resharer?: PublicProfile | null };
  currentUserId: string;
  liked: boolean;
  reshared: boolean;
  onToggleLike: () => void;
  onToggleReshare: () => void;
  onDelete?: () => void;
};

/** One post in the feed or on a profile — likes, comments, and reshares
 * are optimistic in the parent; this is purely presentational. */
export function PostCard({ post, currentUserId, liked, reshared, onToggleLike, onToggleReshare, onDelete }: PostCardProps) {
  const theme = useTheme();
  const isOwn = post.user_id === currentUserId;

  return (
    <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
      {post.resharer ? (
        <ThemedText type="caption" themeColor="mutedForeground">
          ↻ Reshared by {post.resharer.display_name ?? 'a player'}
        </ThemedText>
      ) : null}

      <Pressable
        accessibilityRole="button"
        onPress={() => post.author && router.push({ pathname: '/player/[userId]', params: { userId: post.author.id } })}
        style={styles.authorRow}>
        <Avatar profile={post.author} />
        <View style={styles.authorText}>
          <ThemedText type="smallBold">{post.author?.display_name ?? 'A player'}</ThemedText>
          <ThemedText type="caption" themeColor="mutedForeground">
            {formatRelativeTime(post.created_at)}
          </ThemedText>
        </View>
      </Pressable>

      <View style={styles.content}>{renderContent(post.content)}</View>

      <View style={styles.actionsRow}>
        <Pressable accessibilityRole="button" onPress={onToggleLike} style={styles.action} hitSlop={6}>
          <ThemedText style={{ fontSize: 16, color: liked ? theme.primary : theme.mutedForeground }}>
            {liked ? '♥' : '♡'}
          </ThemedText>
          <ThemedText type="caption" themeColor="mutedForeground">
            {post.like_count > 0 ? post.like_count : ''}
          </ThemedText>
        </Pressable>

        <Pressable
          accessibilityRole="button"
          onPress={() => router.push({ pathname: '/court-side/[postId]', params: { postId: post.id } })}
          style={styles.action}
          hitSlop={6}>
          <ThemedText style={{ fontSize: 16, color: theme.mutedForeground }}>💬</ThemedText>
          <ThemedText type="caption" themeColor="mutedForeground">
            {post.comment_count ? post.comment_count : ''}
          </ThemedText>
        </Pressable>

        <Pressable accessibilityRole="button" onPress={onToggleReshare} style={styles.action} hitSlop={6}>
          <ThemedText style={{ fontSize: 16, color: reshared ? theme.primary : theme.mutedForeground }}>↻</ThemedText>
          <ThemedText type="caption" themeColor="mutedForeground">
            {post.reshare_count > 0 ? post.reshare_count : ''}
          </ThemedText>
        </Pressable>

        {isOwn && onDelete ? (
          <Pressable accessibilityRole="button" onPress={onDelete} style={[styles.action, styles.deleteAction]} hitSlop={6}>
            <ThemedText type="caption" themeColor="destructive">
              Delete
            </ThemedText>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: Radius.xl,
    borderWidth: 1,
    padding: Spacing.four,
    gap: Spacing.two,
  },
  authorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  avatar: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  authorText: {
    gap: 1,
  },
  content: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  mention: {
    fontWeight: '600',
  },
  actionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.four,
    marginTop: Spacing.one,
  },
  action: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  deleteAction: {
    marginLeft: 'auto',
  },
});
