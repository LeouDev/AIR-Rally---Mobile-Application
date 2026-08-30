import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { listCities, type City } from '@/lib/open-match';

/**
 * A picker, never a free-text field — founder-approved, and for a
 * specific reason: the venue-request feature already produced an entry
 * reading "cebu" with the city field literally the word "city", and
 * free text yields "Cebu"/"cebu city"/"CEBU"/"cebu" as four distinct
 * places that silently fail to match anything. This sheet is the only
 * way profiles.city_slug gets written from the client — always a real
 * cities.slug, never typed.
 *
 * No search input deliberately: 25 cities fits on one scroll without
 * one, and it sidesteps this app's known keyboard-avoidance bug
 * entirely rather than needing yet another workaround for it.
 */
type CityPickerSheetProps = {
  visible: boolean;
  onClose: () => void;
  currentCitySlug: string | null;
  onSelect: (city: City) => void;
};

export function CityPickerSheet({ visible, ...rest }: CityPickerSheetProps) {
  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={rest.onClose}>
      {visible ? <CityPickerSheetBody {...rest} /> : null}
    </Modal>
  );
}

function CityPickerSheetBody({ onClose, currentCitySlug, onSelect }: Omit<CityPickerSheetProps, 'visible'>) {
  const theme = useTheme();
  // undefined = still loading, [] = loaded and genuinely empty (shouldn't
  // happen with a seeded table, but distinct from "not fetched yet").
  const [cities, setCities] = useState<City[] | undefined>(undefined);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    listCities()
      .then((result) => {
        if (!cancelled) setCities(result);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // cities.sort_order already groups a region's rows contiguously (confirmed
  // live against staging) — this only needs to notice where one region ends
  // and the next begins, not re-bucket anything.
  const sections: { region: string; cities: City[] }[] = [];
  for (const city of cities ?? []) {
    const last = sections[sections.length - 1];
    if (last && last.region === city.region) last.cities.push(city);
    else sections.push({ region: city.region, cities: [city] });
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
        <View style={[styles.header, { borderBottomColor: theme.border }]}>
          <ThemedText type="heading">Where do you play?</ThemedText>
          <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={onClose} hitSlop={8}>
            <ThemedText type="smallBold" themeColor="primary">
              Cancel
            </ThemedText>
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={styles.scroll}>
          <ThemedText type="small" themeColor="subtle">
            Open matches near you are matched to this city. Not where you are right now — where you actually play.
          </ThemedText>

          {cities === undefined && !error ? (
            <ThemedText type="small" themeColor="subtle" style={styles.centerText}>
              Loading…
            </ThemedText>
          ) : error ? (
            <ThemedText type="small" themeColor="destructive" style={styles.centerText}>
              Couldn&apos;t load cities. Try again.
            </ThemedText>
          ) : (
            sections.map((section) => (
              <View key={section.region} style={styles.section}>
                <ThemedText type="caption" themeColor="mutedForeground" style={styles.sectionLabel}>
                  {section.region.toUpperCase()}
                </ThemedText>
                <View style={[styles.list, { borderColor: theme.border, backgroundColor: theme.card }]}>
                  {section.cities.map((city, i) => {
                    const selected = city.slug === currentCitySlug;
                    return (
                      <Pressable
                        key={city.slug}
                        accessibilityRole="button"
                        accessibilityLabel={city.display_name}
                        onPress={() => onSelect(city)}
                        style={({ pressed }) => [
                          styles.row,
                          i < section.cities.length - 1 && { borderBottomWidth: 1, borderBottomColor: theme.hairline },
                          pressed && styles.pressed,
                        ]}>
                        <ThemedText type="small">{city.display_name}</ThemedText>
                        {selected ? <Ionicons name="checkmark" size={18} color={theme.primary} /> : null}
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            ))
          )}
        </ScrollView>
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.three,
    borderBottomWidth: 1,
  },
  scroll: {
    padding: Spacing.four,
    gap: Spacing.four,
  },
  centerText: {
    textAlign: 'center',
    paddingVertical: Spacing.six,
  },
  section: {
    gap: Spacing.two,
  },
  sectionLabel: {
    fontWeight: '700',
    letterSpacing: 1,
  },
  list: {
    borderWidth: 1,
    borderRadius: Radius.lg,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
  },
  pressed: {
    opacity: 0.7,
  },
});
