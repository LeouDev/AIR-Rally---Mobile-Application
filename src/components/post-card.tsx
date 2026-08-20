import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Image } from 'expo-image';
import { useState } from 'react';
import { Pressable, Share, StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { EventAttendeeStatus, PublicProfile } from '@/lib/database.types';
import { formatRelativeTime } from '@/lib/relative-time';
import { postImagePublicUrl } from '@/lib/post-images';
import type { PostWithAuthor } from '@/lib/posts';

function formatEventWhen(iso: string): string {
  return new Date(iso).toLocaleString('en-PH', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

const JOIN_LABEL: Record<EventAttendeeStatus, string> = {
  pending_approval: 'Requested',
  joined: 'Joined',
  waitlisted: 'Waitlisted',
  cancelled: 'Ask to join',
};

/** The card a "share this game" post embeds. Join is only interactive
 * where the parent tracks event status (the main COURT/Side feed);
 * elsewhere it falls back to a plain tap-through to the full game
 * screen, which has its own working join/approve UI. */
function EmbeddedEventCard({
  event,
  status,
  onToggleJoin,
}: {
  event: NonNullable<PostWithAuthor['event']>;
  status?: EventAttendeeStatus | null;
  onToggleJoin?: (eventId: string) => void;
}) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push({ pathname: '/events/[id]', params: { id: event.id } })}
      style={[styles.eventCard, { backgroundColor: theme.muted, borderColor: theme.border }]}>
      <ThemedText type="smallBold">{event.title}</ThemedText>
      <View style={styles.eventMetaRow}>
        <Ionicons name="calendar-outline" size={13} color={theme.mutedForeground} />
        <ThemedText type="caption" themeColor="mutedForeground">
          {formatEventWhen(event.start_time)}
        </ThemedText>
      </View>
      {event.venue ? (
        <View style={styles.eventMetaRow}>
          <Ionicons name="location-outline" size={13} color={theme.mutedForeground} />
          <ThemedText type="caption" themeColor="mutedForeground">
            {event.venue.name}
          </ThemedText>
        </View>
      ) : null}
      <View style={styles.eventMetaRow}>
        <Ionicons name="people-outline" size={13} color={theme.mutedForeground} />
        <ThemedText type="caption" themeColor="mutedForeground">
          {event.attendeeCount}
          {event.max_players ? ` / ${event.max_players}` : ''} playing
          {event.isFull ? ' · full' : ''}
        </ThemedText>
      </View>
      {onToggleJoin ? (
        <Button
          title={status ? JOIN_LABEL[status] : 'Ask to join'}
          variant={status ? 'secondary' : 'outline'}
          style={styles.eventJoinButton}
          onPress={() => onToggleJoin(event.id)}
        />
      ) : null}
    </Pressable>
  );
}

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
  const [imageFailed, setImageFailed] = useState(false);
  const initials = (profile?.display_name ?? '?')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('');

  if (profile?.avatar_url && !imageFailed) {
    return (
      <Image
        source={{ uri: profile.avatar_url }}
        style={[styles.avatar, { width: size, height: size, borderRadius: size / 2 }]}
        contentFit="cover"
        onError={() => setImageFailed(true)}
      />
    );
  }

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
  /** The viewer's status on post.event, if this post shared a game and
   * the parent tracks it (only the main feed does today). */
  eventStatus?: EventAttendeeStatus | null;
  onToggleJoinEvent?: (eventId: string) => void;
  /** Per-author follow state for this card. Omitted entirely on screens
   * that already handle following at a different level — the profile
   * screen (player/[userId].tsx) has one follow button for the whole
   * page, not one per post, so it never passes these. */
  isFollowingAuthor?: boolean;
  onToggleFollow?: (userId: string) => void;
};

/** One post in the feed or on a profile — likes, comments, and reshares
 * are optimistic in the parent; this is purely presentational. */
export function PostCard({
  post,
  currentUserId,
  liked,
  reshared,
  onToggleLike,
  onToggleReshare,
  onDelete,
  eventStatus,
  onToggleJoinEvent,
  isFollowingAuthor,
  onToggleFollow,
}: PostCardProps) {
  const theme = useTheme();
  const isOwn = post.user_id === currentUserId;

  const handleExternalShare = async () => {
    try {
      const postUrl = `https://air-rally.com/court-side/${post.id}`;
      await Share.share({
        message: `Check out this post on AIR/Rally: ${postUrl}`,
        url: postUrl,
      });
    } catch {
      // Share sheet dismissed or unavailable — not an error.
    }
  };

  return (
    <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
      {post.resharer ? (
        <ThemedText type="caption" themeColor="mutedForeground">
          ↻ Reshared by {post.resharer.display_name ?? 'a player'}
        </ThemedText>
      ) : null}

      <View style={styles.authorRow}>
        <Pressable
          accessibilityRole="button"
          onPress={() => post.author && router.push({ pathname: '/player/[userId]', params: { userId: post.author.id } })}
          style={styles.authorPressable}>
          <Avatar profile={post.author} />
          <View style={styles.authorText}>
            <ThemedText type="smallBold">{post.author?.display_name ?? 'A player'}</ThemedText>
            <ThemedText type="caption" themeColor="mutedForeground">
              {formatRelativeTime(post.created_at)}
            </ThemedText>
          </View>
        </Pressable>
        {!isOwn && onToggleFollow ? (
          <Button
            title={isFollowingAuthor ? 'Following' : 'Follow'}
            variant={isFollowingAuthor ? 'secondary' : 'primary'}
            style={styles.followButton}
            onPress={() => post.author && onToggleFollow(post.author.id)}
          />
        ) : null}
      </View>

      <View style={styles.content}>{renderContent(post.content)}</View>

      {post.image_paths.length > 0 ? (
        <View style={styles.imageGrid}>
          {post.image_paths.map((path) => (
            <Image
              key={path}
              source={{ uri: postImagePublicUrl(path) }}
              style={post.image_paths.length === 1 ? styles.imageSingle : styles.imageGridItem}
              contentFit="cover"
            />
          ))}
        </View>
      ) : null}

      {post.event ? <EmbeddedEventCard event={post.event} status={eventStatus} onToggleJoin={onToggleJoinEvent} /> : null}

      <View style={styles.actionsRow}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${liked ? 'Unlike' : 'Like'}, ${post.like_count} like${post.like_count === 1 ? '' : 's'}`}
          accessibilityState={{ selected: liked }}
          onPress={onToggleLike}
          style={styles.action}
          hitSlop={6}>
          <Ionicons name={liked ? 'heart' : 'heart-outline'} size={18} color={liked ? theme.primary : theme.mutedForeground} />
          <ThemedText type="caption" themeColor="mutedForeground">
            {post.like_count > 0 ? post.like_count : ''}
          </ThemedText>
        </Pressable>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Comment, ${post.comment_count} comment${post.comment_count === 1 ? '' : 's'}`}
          onPress={() => router.push({ pathname: '/court-side/[postId]', params: { postId: post.id } })}
          style={styles.action}
          hitSlop={6}>
          <Ionicons name="chatbubble-outline" size={18} color={theme.mutedForeground} />
          <ThemedText type="caption" themeColor="mutedForeground">
            {post.comment_count ? post.comment_count : ''}
          </ThemedText>
        </Pressable>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Reshare"
          accessibilityState={{ selected: reshared }}
          onPress={onToggleReshare}
          style={styles.action}
          hitSlop={6}>
          <Ionicons name={reshared ? 'repeat' : 'repeat-outline'} size={18} color={reshared ? theme.primary : theme.mutedForeground} />
          <ThemedText type="caption" themeColor="mutedForeground">
            {post.reshare_count > 0 ? post.reshare_count : ''}
          </ThemedText>
        </Pressable>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Share post"
          onPress={handleExternalShare}
          style={styles.action}
          hitSlop={6}>
          <Ionicons name="share-outline" size={18} color={theme.mutedForeground} />
        </Pressable>

        {isOwn && onDelete ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Delete post"
            onPress={onDelete}
            style={[styles.action, styles.deleteAction]}
            hitSlop={6}>
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
  authorPressable: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    flexShrink: 1,
  },
  followButton: {
    marginLeft: 'auto',
    minHeight: 32,
    paddingHorizontal: Spacing.three,
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
  imageGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    borderRadius: Radius.lg,
    overflow: 'hidden',
  },
  imageSingle: {
    width: '100%',
    height: 220,
  },
  imageGridItem: {
    width: '48.5%',
    aspectRatio: 1,
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
  eventCard: {
    borderRadius: Radius.lg,
    borderWidth: 1,
    padding: Spacing.three,
    gap: 4,
  },
  eventMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  eventJoinButton: {
    marginTop: Spacing.one,
    minHeight: 36,
    alignSelf: 'flex-start',
    paddingHorizontal: Spacing.three,
  },
});
