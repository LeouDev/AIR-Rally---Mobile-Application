import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button } from '@/components/ui/button';
import { DateTimeField } from '@/components/ui/date-time-field';
import { TextField } from '@/components/ui/text-field';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { Amenity } from '@/lib/database.types';
import { formatFilterDate, formatFilterTime, parseFilterDate, parseFilterTime } from '@/lib/filter-dates';
import type { MarketplaceFilters, VenueSortOption } from '@/lib/venues';

const COURT_TYPES: { value: MarketplaceFilters['indoorOutdoor'] | undefined; label: string }[] = [
  { value: undefined, label: 'Any' },
  { value: 'indoor', label: 'Indoor' },
  { value: 'outdoor', label: 'Outdoor' },
];

const RATINGS = [0, 4, 4.5];

const SORT_OPTIONS: { value: VenueSortOption; label: string }[] = [
  { value: 'recommended', label: 'Recommended' },
  { value: 'rating', label: 'Top rated' },
  { value: 'price_asc', label: 'Price: low to high' },
  { value: 'price_desc', label: 'Price: high to low' },
];

function Chip({
  label,
  icon,
  selected,
  onPress,
}: {
  label: string;
  icon?: keyof typeof Ionicons.glyphMap;
  selected: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();
  const color = selected ? theme.secondaryForeground : theme.foreground;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      hitSlop={8}
      style={({ pressed }) => [
        styles.chip,
        {
          backgroundColor: selected ? theme.secondary : theme.card,
          borderColor: selected ? theme.secondary : theme.border,
          opacity: pressed ? 0.7 : 1,
        },
      ]}>
      {icon ? <Ionicons name={icon} size={13} color={color} /> : null}
      <ThemedText type="small" style={{ color }}>
        {label}
      </ThemedText>
    </Pressable>
  );
}

function SectionLabel({ children }: { children: string }) {
  return (
    <ThemedText type="caption" themeColor="mutedForeground" style={styles.sectionLabel}>
      {children.toUpperCase()}
    </ThemedText>
  );
}

type FilterSheetProps = {
  visible: boolean;
  onClose: () => void;
  filters: MarketplaceFilters;
  onApply: (filters: MarketplaceFilters) => void;
  amenities: Amenity[];
  surfaceTypes: string[];
};

/**
 * Same filter set as the web's FilterBar (court type, price range, min
 * rating, surface, open-on date/time, amenities) minus distance — that
 * one needs expo-location, a native module this app doesn't carry. Date
 * and time are plain text fields rather than a native picker for the
 * same reason: no @react-native-community/datetimepicker dependency to
 * avoid another native-rebuild detour.
 */
export function FilterSheet({ visible, onClose, filters, onApply, amenities, surfaceTypes }: FilterSheetProps) {
  const theme = useTheme();
  const [draft, setDraft] = useState<MarketplaceFilters>(filters);
  const [minPriceInput, setMinPriceInput] = useState(filters.minPrice?.toString() ?? '');
  const [maxPriceInput, setMaxPriceInput] = useState(filters.maxPrice?.toString() ?? '');
  const [dateInput, setDateInput] = useState(filters.availableOn ?? '');
  const [timeInput, setTimeInput] = useState(filters.availableAt ?? '');
  const [dateError, setDateError] = useState<string | null>(null);
  const [timeError, setTimeError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    setDraft(filters);
    setMinPriceInput(filters.minPrice?.toString() ?? '');
    setMaxPriceInput(filters.maxPrice?.toString() ?? '');
    // A value arriving from anywhere other than this sheet — restored
    // state, a deep link, a saved search — gets the same treatment as a
    // typed one: understood, or refused out loud. Never shown as though
    // it were in force. Silently blanking it here would be the original
    // bug moved one layer up.
    const incomingDate = filters.availableOn ?? '';
    const incomingDateOk = incomingDate === '' || parseFilterDate(incomingDate) !== null;
    setDateInput(incomingDateOk ? incomingDate : '');
    setDateError(incomingDateOk ? null : `Couldn't read the date "${incomingDate}", so it isn't applied.`);

    const incomingTime = filters.availableAt ?? '';
    const anchor = parseFilterDate(incomingDate);
    const incomingTimeOk =
      incomingTime === '' || (anchor !== null && parseFilterTime(incomingTime, anchor) !== null);
    setTimeInput(incomingDateOk && incomingTimeOk ? incomingTime : '');
    setTimeError(incomingTimeOk ? null : `Couldn't read the time "${incomingTime}", so it isn't applied.`);
  }, [visible, filters]);

  const toggleAmenity = (id: string) => {
    const set = new Set(draft.amenityIds ?? []);
    if (set.has(id)) set.delete(id);
    else set.add(id);
    setDraft({ ...draft, amenityIds: Array.from(set) });
  };

  const reset = () => {
    setDraft({ sort: draft.sort });
    setMinPriceInput('');
    setMaxPriceInput('');
    setDateInput('');
    setTimeInput('');
    setDateError(null);
    setTimeError(null);
  };

  /**
   * Every branch below either applies the value or refuses out loud.
   * None of them drops one and closes.
   *
   * That was the bug: an unparseable date was discarded here and the
   * sheet dismissed itself, so the player watched the interaction
   * succeed while the filter silently never existed — and
   * countActiveFilters() then reported nothing active, corroborating
   * the lie. Refusing is allowed; refusing quietly is not.
   */
  const apply = () => {
    const min = minPriceInput ? Number(minPriceInput) : undefined;
    const max = maxPriceInput ? Number(maxPriceInput) : undefined;

    const typedDate = dateInput.trim();
    const typedTime = timeInput.trim();
    const parsedDate = parseFilterDate(typedDate);

    if (typedDate && !parsedDate) {
      setDateError('Use a date like 2026-08-24.');
      return;
    }
    if (typedTime && !parsedDate) {
      setDateError('Pick a date for this time.');
      return;
    }
    const parsedTime = parsedDate ? parseFilterTime(typedTime, parsedDate) : null;
    if (typedTime && !parsedTime) {
      setTimeError('Use a 24-hour time like 18:30.');
      return;
    }

    setDateError(null);
    setTimeError(null);
    onApply({
      ...draft,
      minPrice: min !== undefined && Number.isFinite(min) ? min : undefined,
      maxPrice: max !== undefined && Number.isFinite(max) ? max : undefined,
      // Re-formatted from the parsed value rather than passed through as
      // typed, so what gets applied is provably what was understood.
      availableOn: parsedDate ? formatFilterDate(parsedDate) : undefined,
      availableAt: parsedTime ? formatFilterTime(parsedTime) : undefined,
    });
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <ThemedView style={styles.container}>
        <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
          <View style={styles.header}>
            <ThemedText type="subtitle">Filters</ThemedText>
            <Pressable accessibilityRole="button" onPress={onClose} hitSlop={8}>
              <ThemedText type="smallBold" themeColor="primary">
                Done
              </ThemedText>
            </Pressable>
          </View>

          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flex}>
            <ScrollView contentContainerStyle={styles.scroll}>
              <View style={styles.block}>
                <SectionLabel>Sort by</SectionLabel>
                <View style={styles.chipRow}>
                  {SORT_OPTIONS.map((option) => (
                    <Chip
                      key={option.value}
                      label={option.label}
                      selected={(draft.sort ?? 'recommended') === option.value}
                      onPress={() => setDraft({ ...draft, sort: option.value })}
                    />
                  ))}
                </View>
              </View>

              <View style={styles.block}>
                <SectionLabel>Court type</SectionLabel>
                <View style={styles.chipRow}>
                  {COURT_TYPES.map((option) => (
                    <Chip
                      key={option.label}
                      label={option.label}
                      selected={draft.indoorOutdoor === option.value}
                      onPress={() => setDraft({ ...draft, indoorOutdoor: option.value })}
                    />
                  ))}
                </View>
              </View>

              <View style={styles.block}>
                <SectionLabel>Price per hour</SectionLabel>
                <View style={styles.priceRow}>
                  <View style={styles.priceField}>
                    <TextField
                      label="Min"
                      value={minPriceInput}
                      onChangeText={setMinPriceInput}
                      placeholder="₱0"
                      keyboardType="numeric"
                    />
                  </View>
                  <ThemedText themeColor="mutedForeground" style={styles.priceSeparator}>
                    –
                  </ThemedText>
                  <View style={styles.priceField}>
                    <TextField
                      label="Max"
                      value={maxPriceInput}
                      onChangeText={setMaxPriceInput}
                      placeholder="No max"
                      keyboardType="numeric"
                    />
                  </View>
                </View>
              </View>

              <View style={styles.block}>
                <SectionLabel>Min rating</SectionLabel>
                <View style={styles.chipRow}>
                  {RATINGS.map((rating) => (
                    <Chip
                      key={rating}
                      label={rating === 0 ? 'Any' : `${rating}+`}
                      icon={rating === 0 ? undefined : 'star'}
                      selected={(draft.minRating ?? 0) === rating}
                      onPress={() => setDraft({ ...draft, minRating: rating || undefined })}
                    />
                  ))}
                </View>
              </View>

              {surfaceTypes.length > 0 ? (
                <View style={styles.block}>
                  <SectionLabel>Surface</SectionLabel>
                  <View style={styles.chipRow}>
                    {surfaceTypes.map((surface) => (
                      <Chip
                        key={surface}
                        label={surface}
                        selected={draft.surfaceType === surface}
                        onPress={() =>
                          setDraft({ ...draft, surfaceType: draft.surfaceType === surface ? undefined : surface })
                        }
                      />
                    ))}
                  </View>
                </View>
              ) : null}

              <View style={styles.block}>
                <SectionLabel>Open on</SectionLabel>
                {/*
                  A picker always displays SOMETHING, so rendering one for
                  an unset filter would put today's date on screen beside
                  a filter that isn't filtering by it — the same lie this
                  whole change exists to remove, wearing a nicer control.
                  No date chosen means no date shown.
                */}
                {dateInput.trim().length === 0 ? (
                  <>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Choose a date"
                      onPress={() => {
                        setDateInput(formatFilterDate(new Date()));
                        setDateError(null);
                      }}
                      style={({ pressed }) => [
                        styles.openOnEmpty,
                        { backgroundColor: theme.card, borderColor: theme.border, opacity: pressed ? 0.7 : 1 },
                      ]}>
                      <ThemedText type="small">Any date</ThemedText>
                      <ThemedText type="caption" themeColor="primary">
                        Choose a date
                      </ThemedText>
                    </Pressable>
                    {/* An unreadable incoming value has no field to attach
                        itself to once cleared, so it is reported here — the
                        alternative is dropping it in silence, which is the
                        bug. */}
                    {dateError ? (
                      <ThemedText type="caption" themeColor="destructive">
                        {dateError}
                      </ThemedText>
                    ) : null}
                    {timeError ? (
                      <ThemedText type="caption" themeColor="destructive">
                        {timeError}
                      </ThemedText>
                    ) : null}
                  </>
                ) : (
                  <>
                    <View style={styles.priceRow}>
                      <View style={styles.priceField}>
                        <DateTimeField
                          label="Date"
                          mode="date"
                          value={dateInput}
                          onChangeText={(value) => {
                            setDateInput(value);
                            setDateError(null);
                          }}
                          error={dateError}
                        />
                      </View>
                      <View style={styles.priceField}>
                        {timeInput.trim().length === 0 ? (
                          <View style={styles.wrapperGap}>
                            <ThemedText type="smallBold">Time</ThemedText>
                            <Pressable
                              accessibilityRole="button"
                              accessibilityLabel="Choose a time"
                              onPress={() => {
                                setTimeInput(formatFilterTime(new Date()));
                                setTimeError(null);
                              }}
                              style={({ pressed }) => [
                                styles.openOnEmpty,
                                { backgroundColor: theme.card, borderColor: theme.border, opacity: pressed ? 0.7 : 1 },
                              ]}>
                              <ThemedText type="small" themeColor="primary">
                                Any time
                              </ThemedText>
                            </Pressable>
                          </View>
                        ) : (
                          <DateTimeField
                            label="Time"
                            mode="time"
                            value={timeInput}
                            onChangeText={(value) => {
                              setTimeInput(value);
                              setTimeError(null);
                            }}
                            error={timeError}
                            relativeTo={dateInput}
                          />
                        )}
                      </View>
                    </View>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Clear date and time"
                      onPress={() => {
                        setDateInput('');
                        setTimeInput('');
                        setDateError(null);
                        setTimeError(null);
                      }}
                      hitSlop={8}
                      style={({ pressed }) => [styles.openOnClear, { opacity: pressed ? 0.6 : 1 }]}>
                      <ThemedText type="caption" themeColor="primary">
                        Clear date and time
                      </ThemedText>
                    </Pressable>
                  </>
                )}
                <ThemedText type="caption" themeColor="mutedForeground">
                  Shows venues open then — check the court page for live availability.
                </ThemedText>
              </View>

              {amenities.length > 0 ? (
                <View style={styles.block}>
                  <SectionLabel>Amenities</SectionLabel>
                  <View style={styles.chipRow}>
                    {amenities.map((amenity) => (
                      <Chip
                        key={amenity.id}
                        label={amenity.name}
                        selected={(draft.amenityIds ?? []).includes(amenity.id)}
                        onPress={() => toggleAmenity(amenity.id)}
                      />
                    ))}
                  </View>
                </View>
              ) : null}
            </ScrollView>

            <View style={[styles.footer, { borderTopColor: theme.border }]}>
              <View style={styles.footerButton}>
                <Button title="Reset" variant="secondary" onPress={reset} />
              </View>
              <View style={styles.footerButton}>
                <Button title="Apply" onPress={apply} />
              </View>
            </View>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </ThemedView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  openOnEmpty: {
    minHeight: 48,
    borderRadius: Radius.lg,
    borderWidth: 1,
    paddingHorizontal: Spacing.three,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  openOnClear: {
    alignSelf: 'flex-start',
    paddingVertical: Spacing.one,
  },
  wrapperGap: {
    gap: Spacing.one + Spacing.half,
  },
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  flex: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.three,
  },
  scroll: {
    paddingHorizontal: Spacing.four,
    paddingBottom: Spacing.six,
    gap: Spacing.five,
  },
  block: {
    gap: Spacing.two,
  },
  sectionLabel: {
    letterSpacing: 1.2,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.half,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one,
    borderRadius: Radius.pill,
    borderWidth: 1,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: Spacing.two,
  },
  priceField: {
    flex: 1,
  },
  priceSeparator: {
    paddingBottom: Spacing.two,
  },
  footer: {
    flexDirection: 'row',
    gap: Spacing.two,
    padding: Spacing.four,
    borderTopWidth: 1,
  },
  footerButton: {
    flex: 1,
  },
});
