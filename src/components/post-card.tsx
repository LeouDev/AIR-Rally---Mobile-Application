import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Image } from 'expo-image';
import * as Sharing from 'expo-sharing';
import { useRef, useState } from 'react';
import { Pressable, Share, StyleSheet, Text, View } from 'react-native';
import { captureRef } from 'react-native-view-shot';

import { monoFont, ShareCardFrame } from '@/components/share-card-frame';
import { Button } from '@/components/ui/button';
import { ReportAction } from '@/components/report-action';
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

/** The image actually attached when a post is shared externally (see
 * PostCard's handleExternalShare) — rendered off-screen at all times and
 * captured with react-native-view-shot right before the share sheet
 * opens, so Instagram/Threads/X/Messenger get a real picture instead of
 * a bare link. Body content only — the wordmark/tag/author-row/footer
 * chrome lives in ShareCardFrame, shared with the Ranked result card. */
function ShareCard({ post, viewRef }: { post: PostWithAuthor; viewRef: React.RefObject<View | null> }) {
  const authorName = post.author?.display_name ?? 'A player';
  const initial = authorName.trim()[0]?.toUpperCase() ?? '?';
  const event = post.event;
  const fillPct = event?.max_players ? Math.min(100, (event.attendeeCount / event.max_players) * 100) : null;

  return (
    <ShareCardFrame
      viewRef={viewRef}
      tag={event ? 'OPEN PLAY' : 'COURT/SIDE'}
      authorInitial={initial}
      authorName={authorName}
      authorSub={event ? 'is hosting a game' : 'posted on COURT/Side'}>
      {event ? (
        <View style={shareCardStyles.eventPanel}>
          <Text style={shareCardStyles.eventEyebrow}>Open Play</Text>
          <Text style={shareCardStyles.eventTitle}>{event.title}</Text>
          <Text style={shareCardStyles.eventMeta}>{formatEventWhen(event.start_time)}</Text>
          {event.venue ? <Text style={shareCardStyles.eventMeta}>{event.venue.name}</Text> : null}
          <View style={shareCardStyles.progressRow}>
            {fillPct !== null ? (
              <View style={shareCardStyles.progressTrack}>
                <View style={[shareCardStyles.progressFill, { width: `${fillPct}%` }]} />
              </View>
            ) : null}
            <Text style={shareCardStyles.progressLabel}>
              {event.attendeeCount}
              {event.max_players ? ` / ${event.max_players}` : ''} playing
            </Text>
          </View>
        </View>
      ) : (
        <>
          <Text style={shareCardStyles.headline} numberOfLines={6}>
            {post.content}
          </Text>
          <View style={shareCardStyles.statRow}>
            <Text style={shareCardStyles.stat}>♥ {post.like_count}</Text>
            <Text style={shareCardStyles.stat}>💬 {post.comment_count}</Text>
          </View>
        </>
      )}
    </ShareCardFrame>
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

/**
 * `on` picks the initials-fallback palette for the surface underneath.
 * 'navy' is for the fixed-dark Ranked match surfaces, where the default
 * accent fill (a pale cream in light mode) would read as a hole punched
 * in the card. The photo path is identical either way — only the
 * no-photo fallback needs to know where it is being drawn.
 */
export function Avatar({
  profile,
  size = 36,
  on = 'surface',
}: {
  profile: PublicProfile | null;
  size?: number;
  on?: 'surface' | 'navy';
}) {
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

  const fallbackBg = on === 'navy' ? theme.rally : theme.accent;
  const fallbackFg = on === 'navy' ? theme.rallyForeground : theme.accentForeground;

  return (
    <View
      style={[
        styles.avatar,
        { width: size, height: size, borderRadius: size / 2, backgroundColor: fallbackBg },
      ]}>
      <ThemedText type="caption" style={{ color: fallbackFg }}>
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
  const shareCardRef = useRef<View>(null);

  const handleExternalShare = async () => {
    // The branded card first — captures the always-mounted, off-screen
    // ShareCard (see its own comment) and attaches the actual image, not
    // just a link, to whatever app the sheet's target is.
    try {
      const uri = await captureRef(shareCardRef, { format: 'png', quality: 1, width: 1080, height: 1920 });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: 'Share to AIR/Rally', UTI: 'public.png' });
        return;
      }
    } catch {
      // Capture failed or sharing isn't available on this device — fall
      // through to a plain link rather than the share button doing
      // nothing at all.
    }
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
      <View style={styles.shareCardOffscreen} pointerEvents="none">
        <ShareCard post={post} viewRef={shareCardRef} />
      </View>
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
        ) : (
          // Never on your own post — reporting yourself is noise in the
          // moderation queue. Sits in the same trailing slot Delete
          // occupies for an author, so the row has one meaning: the
          // thing you can do about THIS post that isn't engagement.
          // ReportAction owns its own trigger, menu and sheet — no local
          // `reporting` state to hold here anymore.
          <View style={[styles.action, styles.deleteAction]}>
            <ReportAction targetType="post" targetId={post.id} targetLabel="post" />
          </View>
        )}
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
  shareCardOffscreen: {
    position: 'absolute',
    top: 0,
    left: -2000,
  },
});

// Fixed brand palette, not theme tokens — see ShareCard's own comment.
const shareCardStyles = StyleSheet.create({
  eventPanel: {
    backgroundColor: '#f6f1e8',
    borderLeftWidth: 4,
    borderLeftColor: '#f3700f',
    padding: 18,
  },
  eventEyebrow: {
    fontFamily: monoFont,
    fontSize: 9.5,
    letterSpacing: 1.4,
    fontWeight: '700',
    color: '#f3700f',
    marginBottom: 6,
    textTransform: 'uppercase',
  },
  eventTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#0f2747',
    marginBottom: 10,
    lineHeight: 22,
  },
  eventMeta: {
    fontSize: 12,
    color: '#2b3a4f',
    marginBottom: 5,
  },
  progressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 10,
  },
  progressTrack: {
    flex: 1,
    height: 5,
    backgroundColor: '#e6dac6',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#1f9d55',
  },
  progressLabel: {
    fontFamily: monoFont,
    fontSize: 11,
    fontWeight: '700',
    color: '#1f9d55',
  },
  headline: {
    fontSize: 17,
    lineHeight: 25,
    fontWeight: '600',
    color: '#f3ead9',
  },
  statRow: {
    flexDirection: 'row',
    gap: 16,
    marginTop: 4,
  },
  stat: {
    fontFamily: monoFont,
    fontSize: 11.5,
    color: '#93a2b8',
  },
});
