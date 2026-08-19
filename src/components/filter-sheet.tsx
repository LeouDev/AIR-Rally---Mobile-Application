import { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button } from '@/components/ui/button';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { Amenity } from '@/lib/database.types';
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

function Chip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[
        styles.chip,
        {
          backgroundColor: selected ? theme.secondary : theme.card,
          borderColor: selected ? theme.secondary : theme.border,
        },
      ]}>
      <ThemedText type="small" style={{ color: selected ? theme.secondaryForeground : theme.foreground }}>
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

  useEffect(() => {
    if (!visible) return;
    setDraft(filters);
    setMinPriceInput(filters.minPrice?.toString() ?? '');
    setMaxPriceInput(filters.maxPrice?.toString() ?? '');
    setDateInput(filters.availableOn ?? '');
    setTimeInput(filters.availableAt ?? '');
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
  };

  const apply = () => {
    const min = minPriceInput ? Number(minPriceInput) : undefined;
    const max = maxPriceInput ? Number(maxPriceInput) : undefined;
    const dateOk = /^\d{4}-\d{2}-\d{2}$/.test(dateInput);
    const timeOk = /^\d{2}:\d{2}$/.test(timeInput);
    onApply({
      ...draft,
      minPrice: min !== undefined && Number.isFinite(min) ? min : undefined,
      maxPrice: max !== undefined && Number.isFinite(max) ? max : undefined,
      availableOn: dateOk ? dateInput : undefined,
      availableAt: dateOk && timeOk ? timeInput : undefined,
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
                <TextInput
                  value={minPriceInput}
                  onChangeText={setMinPriceInput}
                  placeholder="Min"
                  placeholderTextColor={theme.placeholder}
                  keyboardType="numeric"
                  style={[styles.priceInput, { backgroundColor: theme.card, borderColor: theme.input, color: theme.cardForeground }]}
                />
                <ThemedText themeColor="mutedForeground">–</ThemedText>
                <TextInput
                  value={maxPriceInput}
                  onChangeText={setMaxPriceInput}
                  placeholder="Max"
                  placeholderTextColor={theme.placeholder}
                  keyboardType="numeric"
                  style={[styles.priceInput, { backgroundColor: theme.card, borderColor: theme.input, color: theme.cardForeground }]}
                />
              </View>
            </View>

            <View style={styles.block}>
              <SectionLabel>Min rating</SectionLabel>
              <View style={styles.chipRow}>
                {RATINGS.map((rating) => (
                  <Chip
                    key={rating}
                    label={rating === 0 ? 'Any' : `★ ${rating}+`}
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
              <View style={styles.priceRow}>
                <TextInput
                  value={dateInput}
                  onChangeText={setDateInput}
                  placeholder="YYYY-MM-DD"
                  placeholderTextColor={theme.placeholder}
                  style={[styles.priceInput, { backgroundColor: theme.card, borderColor: theme.input, color: theme.cardForeground }]}
                />
                <TextInput
                  value={timeInput}
                  onChangeText={setTimeInput}
                  placeholder="HH:MM"
                  placeholderTextColor={theme.placeholder}
                  editable={/^\d{4}-\d{2}-\d{2}$/.test(dateInput)}
                  style={[styles.priceInput, { backgroundColor: theme.card, borderColor: theme.input, color: theme.cardForeground }]}
                />
              </View>
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
        </SafeAreaView>
      </ThemedView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
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
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one,
    borderRadius: Radius.pill,
    borderWidth: 1,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  priceInput: {
    flex: 1,
    minHeight: 44,
    borderRadius: Radius.md,
    borderWidth: 1,
    paddingHorizontal: Spacing.three,
    fontSize: 16,
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
