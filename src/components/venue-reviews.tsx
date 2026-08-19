import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { TextField } from '@/components/ui/text-field';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import {
  createReview,
  getReviewEligibility,
  listReviewsByVenue,
  type ReviewWithAuthor,
} from '@/lib/reviews';
import { useSession } from '@/providers/session';

function formatReviewDate(iso: string): string {
  return new Intl.DateTimeFormat('en-PH', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(iso));
}

function StarRow({ value, onChange, size = 22 }: { value: number; onChange?: (v: number) => void; size?: number }) {
  const theme = useTheme();
  return (
    <View style={styles.starRow}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Pressable
          key={n}
          disabled={!onChange}
          accessibilityRole={onChange ? 'button' : undefined}
          accessibilityLabel={`${n} star${n === 1 ? '' : 's'}`}
          hitSlop={6}
          onPress={() => onChange?.(n)}>
          <ThemedText style={{ fontSize: size, color: n <= value ? theme.primary : theme.border }}>★</ThemedText>
        </Pressable>
      ))}
    </View>
  );
}

/**
 * Reviews section for a venue page: existing reviews, newest first, plus
 * a "Write a review" form gated by the same eligibility the database
 * itself enforces (a confirmed booking here that's already ended) — RLS
 * is the real gate, this just gives an honest reason instead of a bare
 * policy rejection.
 */
export function VenueReviews({ venueId }: { venueId: string }) {
  const theme = useTheme();
  const { session } = useSession();
  const userId = session?.user.id ?? null;

  const [reviews, setReviews] = useState<ReviewWithAuthor[] | null>(null);
  const [eligibility, setEligibility] = useState<{ eligible: boolean; bookingId: string | null } | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [rating, setRating] = useState(0);
  const [title, setTitle] = useState('');
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    listReviewsByVenue(venueId)
      .then((rows) => mounted.current && setReviews(rows))
      .catch(() => mounted.current && setReviews([]));
    if (userId) {
      getReviewEligibility(userId, venueId)
        .then((e) => mounted.current && setEligibility(e))
        .catch(() => {});
    }
    return () => {
      mounted.current = false;
    };
  }, [venueId, userId]);

  const alreadyReviewed = userId != null && reviews?.some((r) => r.user_id === userId);

  const submit = async () => {
    if (!userId || !eligibility?.bookingId || rating === 0 || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const review = await createReview(userId, {
        venueId,
        bookingId: eligibility.bookingId,
        rating,
        title,
        comment,
      });
      setReviews((prev) => [{ ...review, author: null }, ...(prev ?? [])]);
      setShowForm(false);
      setRating(0);
      setTitle('');
      setComment('');
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't submit your review.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View style={styles.block}>
      <View style={styles.header}>
        <ThemedText type="caption" themeColor="mutedForeground" style={styles.metaLabel}>
          REVIEWS
        </ThemedText>
        {eligibility?.eligible && !alreadyReviewed && !showForm ? (
          <Pressable accessibilityRole="button" onPress={() => setShowForm(true)}>
            <ThemedText type="smallBold" themeColor="primary">
              Write a review
            </ThemedText>
          </Pressable>
        ) : null}
      </View>

      {showForm ? (
        <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <ThemedText type="small" themeColor="subtle">
            How was your visit?
          </ThemedText>
          <StarRow value={rating} onChange={setRating} size={28} />
          <TextField label="Title (optional)" value={title} onChangeText={setTitle} maxLength={100} />
          <TextField
            label="Comment (optional)"
            value={comment}
            onChangeText={setComment}
            maxLength={500}
            multiline
            numberOfLines={3}
            style={styles.commentInput}
          />
          {error ? (
            <ThemedText type="small" themeColor="destructive">
              {error}
            </ThemedText>
          ) : null}
          <View style={styles.formActions}>
            <View style={styles.formButton}>
              <Button title="Cancel" variant="secondary" onPress={() => setShowForm(false)} disabled={submitting} />
            </View>
            <View style={styles.formButton}>
              <Button
                title={submitting ? 'Posting…' : 'Post review'}
                onPress={submit}
                disabled={rating === 0 || submitting}
                loading={submitting}
              />
            </View>
          </View>
        </View>
      ) : null}

      {reviews === null ? (
        <Skeleton height={80} radius={Radius.xl} />
      ) : reviews.length === 0 ? (
        <ThemedText type="small" themeColor="subtle">
          No reviews yet — be the first to play here.
        </ThemedText>
      ) : (
        reviews.map((review) => (
          <View key={review.id} style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <View style={styles.reviewHeader}>
              <ThemedText type="smallBold">{review.author?.display_name ?? 'A player'}</ThemedText>
              <ThemedText type="caption" themeColor="mutedForeground">
                {formatReviewDate(review.created_at)}
              </ThemedText>
            </View>
            <StarRow value={review.rating} size={14} />
            {review.title ? <ThemedText type="smallBold">{review.title}</ThemedText> : null}
            {review.comment ? (
              <ThemedText type="small" themeColor="subtle">
                {review.comment}
              </ThemedText>
            ) : null}
          </View>
        ))
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  block: { gap: Spacing.two },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  metaLabel: { letterSpacing: 1.2 },
  starRow: { flexDirection: 'row', gap: Spacing.half },
  card: {
    borderRadius: Radius.xl,
    borderWidth: 1,
    padding: Spacing.three,
    gap: Spacing.one,
  },
  reviewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  commentInput: {
    minHeight: 80,
    textAlignVertical: 'top',
    paddingTop: Spacing.two,
  },
  formActions: {
    flexDirection: 'row',
    gap: Spacing.two,
    marginTop: Spacing.one,
  },
  formButton: { flex: 1 },
});
