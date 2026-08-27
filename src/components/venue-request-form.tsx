import { useEffect, useRef, useState } from 'react';
import { Pressable, Share, StyleSheet, TextInput, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import {
  createVenueRequest,
  DuplicateVenueRequestError,
  getMyVenueRequestDemand,
  getVenueRequestSuggestions,
  type MyVenueRequestDemand,
  type VenueRequestSuggestion,
} from '@/lib/venue-requests';

function venueRequestShareUrl(requestId: string): string {
  return `https://air-rally.com/venues/requests/${requestId}`;
}

const COPY = {
  searching: {
    title: "We couldn't find that",
    subtitle: 'Want us to go get it? Tell us the venue and we’ll reach out.',
  },
  empty: {
    title: 'No venues here yet',
    subtitle: 'Tell us where you’d play and we’ll reach out to them.',
  },
} as const;

/**
 * "Bring a court here" — the capture surface on Explore's empty state, in
 * both variants (a search/filter that matched nothing, and the bare
 * unfiltered empty state). Port of the web repo's RequestVenueForm.
 *
 * Gated by the caller already being signed in — every screen this renders
 * on sits inside the app's Stack.Protected(session !== null) guard, so
 * unlike the web version there's no anonymous-visitor path to design for
 * here, and no state to preserve across a sign-in redirect.
 */
export function VenueRequestForm({
  userId,
  variant,
  initialPlaceName = '',
}: {
  userId: string;
  variant: 'searching' | 'empty';
  /** Prefilled from the Explore search box when there's active search
   * text — the player already told us what they want. */
  initialPlaceName?: string;
}) {
  const theme = useTheme();
  const [placeName, setPlaceName] = useState(initialPlaceName);
  const [placeCity, setPlaceCity] = useState('');
  const [suggestions, setSuggestions] = useState<VenueRequestSuggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState<{ id: string } | null>(null);
  const [demand, setDemand] = useState<MyVenueRequestDemand | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestSeq = useRef(0);

  // Derived at render time rather than reset via a synchronous setState
  // inside the effect below (React flags that as a cascading-render risk)
  // — same fix as the web version. Below two characters there is nothing
  // to show regardless of what a stale fetch from a moment ago returned.
  const effectiveSuggestions = placeName.trim().length < 2 ? [] : suggestions;

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (placeName.trim().length < 2) return;
    const seq = ++requestSeq.current;
    debounceRef.current = setTimeout(() => {
      getVenueRequestSuggestions(placeName).then((result) => {
        if (seq !== requestSeq.current) return;
        setSuggestions(result);
      });
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [placeName]);

  function pickSuggestion(s: VenueRequestSuggestion) {
    setPlaceName(s.placeName);
    setPlaceCity(s.placeCity);
    setShowSuggestions(false);
    setSuggestions([]);
  }

  async function handleSubmit() {
    setError(null);
    setSubmitting(true);
    try {
      const result = await createVenueRequest(userId, {
        placeName: placeName.trim(),
        placeCity: placeCity.trim() || undefined,
      });
      setSubmitted(result);
      const d = await getMyVenueRequestDemand(result.id);
      setDemand(d);
    } catch (e) {
      setError(e instanceof DuplicateVenueRequestError ? e.message : "Couldn't send that — try again.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleShare() {
    if (!submitted) return;
    const url = venueRequestShareUrl(submitted.id);
    const message = `I asked my venue to join AIR/Rally — help me get ${placeName} listed.\n\n${url}`;
    try {
      await Share.share({ message, url });
    } catch {
      // Share sheet dismissed or unavailable — not an error to surface.
    }
  }

  if (submitted) {
    return (
      <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
        {/* No email promise here — nothing currently sends one for a
            free-text request (the notify trigger matches on venue_id,
            which a fresh request doesn't have, and fires on the venue's
            approval, not on an admin's later manual link). Points at the
            share link instead, which is real, live, and verified —
            replace only if the notify pipeline gets fixed to actually
            cover this path. */}
        <ThemedText type="smallBold">{placeName} is on our list.</ThemedText>
        {demand?.showCount ? (
          // show_count is only ever true at the RPC's threshold of 5
          // (venue_request_demand_for_me returns v_count >= 5), so this
          // can never render below "5 players" — no singular case exists
          // to handle, so none is added.
          <ThemedText type="small" themeColor="mutedForeground">
            {demand.requesters} players have asked for this venue.
          </ThemedText>
        ) : null}
        <ThemedText type="small" themeColor="mutedForeground">
          The fastest way to get them on AIR/Rally: send them this.
        </ThemedText>
        <Button title="Share with your venue" variant="outline" onPress={handleShare} />
      </View>
    );
  }

  const copy = COPY[variant];

  return (
    <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
      <ThemedText type="subtitle">{copy.title}</ThemedText>
      <ThemedText type="small" themeColor="mutedForeground">
        {copy.subtitle}
      </ThemedText>

      <View style={styles.field}>
        <TextInput
          value={placeName}
          onChangeText={(value) => {
            setPlaceName(value);
            setShowSuggestions(true);
          }}
          onFocus={() => setShowSuggestions(true)}
          placeholder="Venue name"
          placeholderTextColor={theme.placeholder}
          accessibilityLabel="Venue name"
          maxLength={160}
          style={[styles.input, { backgroundColor: theme.background, borderColor: theme.input, color: theme.foreground }]}
        />
        {showSuggestions && effectiveSuggestions.length > 0 ? (
          <View style={[styles.suggestions, { backgroundColor: theme.background, borderColor: theme.border }]}>
            {effectiveSuggestions.map((s) => (
              <Pressable
                key={`${s.placeName}-${s.placeCity}`}
                accessibilityRole="button"
                onPress={() => pickSuggestion(s)}
                style={({ pressed }) => [styles.suggestionRow, pressed && { opacity: 0.7 }]}>
                <ThemedText type="small" numberOfLines={1}>
                  {s.placeName}
                  {s.placeCity ? <ThemedText type="small" themeColor="mutedForeground"> · {s.placeCity}</ThemedText> : null}
                </ThemedText>
              </Pressable>
            ))}
          </View>
        ) : null}
      </View>

      <TextInput
        value={placeCity}
        onChangeText={setPlaceCity}
        placeholder="City (optional)"
        placeholderTextColor={theme.placeholder}
        accessibilityLabel="City"
        maxLength={160}
        style={[styles.input, { backgroundColor: theme.background, borderColor: theme.input, color: theme.foreground }]}
      />

      {error ? (
        <ThemedText type="small" themeColor="destructive">
          {error}
        </ThemedText>
      ) : null}

      <Button
        title="Ask us to bring a court here"
        onPress={handleSubmit}
        loading={submitting}
        disabled={placeName.trim().length < 2}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: Radius.lg,
    borderWidth: 1,
    padding: Spacing.three,
    gap: Spacing.two,
  },
  field: {
    position: 'relative',
  },
  input: {
    minHeight: 48,
    borderRadius: Radius.lg,
    borderWidth: 1,
    paddingHorizontal: Spacing.three,
    fontSize: 16,
  },
  suggestions: {
    position: 'absolute',
    top: 52,
    left: 0,
    right: 0,
    borderRadius: Radius.md,
    borderWidth: 1,
    overflow: 'hidden',
    zIndex: 10,
    elevation: 4,
  },
  suggestionRow: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
});
