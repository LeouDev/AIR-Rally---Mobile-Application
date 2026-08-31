import { router, Stack } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CityPickerSheet } from '@/components/open-match/city-picker-sheet';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button } from '@/components/ui/button';
import { DateTimeField } from '@/components/ui/date-time-field';
import { useToast } from '@/components/ui/toast';
import { MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { useKeyboardAwareScroll } from '@/hooks/use-keyboard-aware-scroll';
import { useTheme } from '@/hooks/use-theme';
import { formatFilterDate, formatFilterTime, parseFilterDate, parseFilterTime } from '@/lib/filter-dates';
import { createOpenMatch, getMyCity, setMyCity, type City } from '@/lib/open-match';
import { RankedError } from '@/lib/ranked';
import { listMarketplaceVenues, type MarketplaceVenue } from '@/lib/venues';
import { useSession } from '@/providers/session';

const SEARCH_DEBOUNCE_MS = 300;

type TimePreset = 'in30' | 'tonight' | 'tomorrow' | 'custom';

/** "In 30 min" / "Tonight" (7pm) / "Tomorrow" (9am) / a custom picker.
 * All three presets can land close to or even past "now" (posting at
 * 11pm makes "Tonight" already past) — that's fine, createOpenMatch's
 * own forward buffer pushes anything too close to now safely into the
 * future rather than hitting the server's future-only guard. */
function presetScheduledAt(preset: Exclude<TimePreset, 'custom'>, now: Date): Date {
  if (preset === 'in30') return new Date(now.getTime() + 30 * 60000);
  const target = new Date(now);
  if (preset === 'tonight') {
    target.setHours(19, 0, 0, 0);
  } else {
    target.setDate(target.getDate() + 1);
    target.setHours(9, 0, 0, 0);
  }
  return target;
}

/**
 * "Post an open game" — the founder's own approved shape, 2026-08-31:
 * one flow, time always required, with fast presets over a single field
 * rather than a separate "now" mode ("two modes would make every user
 * learn a distinction that exists only because of how it's built").
 * Fully separate from RankedDirectInvite (ranked/play.tsx) — that path
 * invites specific people and starts immediately; this one broadcasts
 * to the host's city and fills over time via join requests.
 */
export default function NewOpenMatchScreen() {
  const theme = useTheme();
  const { show } = useToast();
  const { session } = useSession();
  const userId = session?.user.id ?? null;
  const { ref: scrollRef, props: keyboardProps, scrollFocusedIntoView } = useKeyboardAwareScroll<ScrollView>();

  const [citySlug, setCitySlug] = useState<string | null | undefined>(undefined);
  const [cityDisplayName, setCityDisplayName] = useState<string | null>(null);
  const [cityPickerVisible, setCityPickerVisible] = useState(false);

  const [preset, setPreset] = useState<TimePreset>('in30');
  const [customDate, setCustomDate] = useState(() => formatFilterDate(new Date()));
  const [customTime, setCustomTime] = useState(() => formatFilterTime(new Date(Date.now() + 30 * 60000)));

  const [venueQuery, setVenueQuery] = useState('');
  const [venueResults, setVenueResults] = useState<MarketplaceVenue[]>([]);
  const [venueSearching, setVenueSearching] = useState(false);
  const [selectedVenue, setSelectedVenue] = useState<MarketplaceVenue | null>(null);
  const requestSeq = useRef(0);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!userId) return;
    getMyCity(userId)
      .then(setCitySlug)
      .catch(() => setCitySlug(null));
  }, [userId]);

  useEffect(() => {
    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
  }, []);

  function handleVenueQueryChange(value: string) {
    setVenueQuery(value);
    setSelectedVenue(null);
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    if (value.trim().length < 2) {
      setVenueResults([]);
      setVenueSearching(false);
      return;
    }
    const seq = ++requestSeq.current;
    setVenueSearching(true);
    debounceTimer.current = setTimeout(() => {
      listMarketplaceVenues({ q: value })
        .then((venues) => {
          if (seq === requestSeq.current) setVenueResults(venues);
        })
        .catch(() => {
          if (seq === requestSeq.current) setVenueResults([]);
        })
        .finally(() => {
          if (seq === requestSeq.current) setVenueSearching(false);
        });
    }, SEARCH_DEBOUNCE_MS);
  }

  async function handleCitySelect(city: City) {
    setCitySlug(city.slug);
    setCityDisplayName(city.display_name);
    setCityPickerVisible(false);
    if (userId) {
      try {
        await setMyCity(userId, city.slug);
      } catch {
        // The picker's own selection is what matters for THIS post — a
        // failed persist just means the next visit asks again, never a
        // blocked post now.
      }
    }
  }

  function computeScheduledAt(): Date | null {
    const now = new Date();
    if (preset !== 'custom') return presetScheduledAt(preset, now);
    const day = parseFilterDate(customDate);
    if (!day) return null;
    return parseFilterTime(customTime, day);
  }

  async function submit() {
    if (!citySlug || submitting) return;
    const scheduledAt = computeScheduledAt();
    if (!scheduledAt) {
      show("That time doesn't look right. Try again.", 'error');
      return;
    }
    setSubmitting(true);
    try {
      await createOpenMatch(citySlug, scheduledAt, {
        id: selectedVenue?.id,
        label: selectedVenue ? undefined : venueQuery.trim() || undefined,
      });
      show('Game posted — players nearby will be notified.', 'success');
      router.replace('/(tabs)/play');
    } catch (e) {
      show(e instanceof RankedError ? e.message : "That didn't go through. Try again.", 'error');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <ThemedView style={styles.container}>
      <Stack.Screen options={{ headerShown: true, title: 'Post an open game', headerBackButtonDisplayMode: 'minimal' }} />
      <SafeAreaView style={styles.safeArea} edges={['bottom']}>
        <ScrollView ref={scrollRef} contentContainerStyle={styles.scroll} {...keyboardProps}>
          <View style={styles.block}>
            <ThemedText type="smallBold">City</ThemedText>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Choose city"
              onPress={() => setCityPickerVisible(true)}
              style={({ pressed }) => [
                styles.fieldRow,
                { backgroundColor: theme.card, borderColor: theme.border, opacity: pressed ? 0.85 : 1 },
              ]}>
              <ThemedText type="small" themeColor={citySlug ? undefined : 'subtle'}>
                {cityDisplayName ?? citySlug ?? 'Where do you play?'}
              </ThemedText>
            </Pressable>
          </View>

          <View style={styles.block}>
            <ThemedText type="smallBold">When</ThemedText>
            <View style={styles.chipRow}>
              {(
                [
                  { key: 'in30', label: 'In 30 min' },
                  { key: 'tonight', label: 'Tonight' },
                  { key: 'tomorrow', label: 'Tomorrow' },
                  { key: 'custom', label: 'Pick a time' },
                ] as const
              ).map((option) => {
                const selected = preset === option.key;
                return (
                  <Pressable
                    key={option.key}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    onPress={() => setPreset(option.key)}
                    style={[
                      styles.chip,
                      {
                        backgroundColor: selected ? theme.primary : theme.card,
                        borderColor: selected ? theme.primary : theme.border,
                      },
                    ]}>
                    <ThemedText type="small" style={{ color: selected ? theme.primaryForeground : theme.foreground }}>
                      {option.label}
                    </ThemedText>
                  </Pressable>
                );
              })}
            </View>
            {preset === 'custom' ? (
              <View style={styles.customTimeRow}>
                <View style={styles.customTimeField}>
                  <DateTimeField label="Date" mode="date" value={customDate} onChangeText={setCustomDate} />
                </View>
                <View style={styles.customTimeField}>
                  <DateTimeField label="Time" mode="time" value={customTime} onChangeText={setCustomTime} relativeTo={customDate} />
                </View>
              </View>
            ) : null}
          </View>

          <View style={styles.block}>
            <ThemedText type="smallBold">Venue (optional)</ThemedText>
            <View style={[styles.fieldRow, styles.searchRow, { backgroundColor: theme.card, borderColor: theme.border }]}>
              <TextInput
                value={selectedVenue ? selectedVenue.name : venueQuery}
                onChangeText={handleVenueQueryChange}
                placeholder="Search a listed court or type a name"
                placeholderTextColor={theme.placeholder}
                accessibilityLabel="Search or type a venue"
                onFocus={scrollFocusedIntoView}
                style={[styles.searchInput, { color: theme.cardForeground }]}
              />
              {venueSearching ? <ActivityIndicator size="small" color={theme.mutedForeground} /> : null}
            </View>
            {!selectedVenue && venueResults.length > 0 ? (
              <View style={[styles.results, { backgroundColor: theme.card, borderColor: theme.border }]}>
                {venueResults.map((venue) => (
                  <Pressable
                    key={venue.id}
                    accessibilityRole="button"
                    onPress={() => {
                      setSelectedVenue(venue);
                      setVenueResults([]);
                    }}
                    style={({ pressed }) => [styles.resultRow, pressed && { opacity: 0.7 }]}>
                    <ThemedText type="small" numberOfLines={1}>
                      {venue.name}
                    </ThemedText>
                    {venue.city ? (
                      <ThemedText type="caption" themeColor="mutedForeground">
                        {venue.city}
                      </ThemedText>
                    ) : null}
                  </Pressable>
                ))}
              </View>
            ) : null}
            <ThemedText type="caption" themeColor="mutedForeground">
              Not in our list? Just type the name — nothing here is checked, it&apos;s shown to whoever joins.
            </ThemedText>
          </View>

          <Button
            title={submitting ? 'Posting…' : 'Post game'}
            onPress={submit}
            disabled={!citySlug || submitting}
            loading={submitting}
          />
        </ScrollView>
      </SafeAreaView>
      <CityPickerSheet
        visible={cityPickerVisible}
        onClose={() => setCityPickerVisible(false)}
        currentCitySlug={citySlug ?? null}
        onSelect={handleCitySelect}
      />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1 },
  scroll: {
    padding: Spacing.four,
    gap: Spacing.four,
    maxWidth: MaxContentWidth,
    width: '100%',
    alignSelf: 'center',
  },
  block: {
    gap: Spacing.two,
  },
  fieldRow: {
    minHeight: 48,
    borderRadius: Radius.lg,
    borderWidth: 1,
    paddingHorizontal: Spacing.three,
    justifyContent: 'center',
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  chip: {
    borderRadius: Radius.pill,
    borderWidth: 1,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  customTimeRow: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  customTimeField: {
    flex: 1,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    padding: 0,
  },
  results: {
    borderRadius: Radius.md,
    borderWidth: 1,
    overflow: 'hidden',
  },
  resultRow: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    gap: 2,
  },
});
