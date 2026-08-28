import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button } from '@/components/ui/button';
import { VenueRequestForm } from '@/components/venue-request-form';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/** Migration 100 freezes rating entirely for a calibrated player outside a
 * booked court — no rating change, no win, no loss, no streak. Founder-
 * approved copy: says the rule plainly, then leads straight into asking
 * for their court, since a player who's just been told "no bookable
 * court" is the single highest-intent moment to capture that request. */
const EXPLANATION =
  "You've finished calibration — from here, your rating only moves in matches on a court booked through AIR/Rally. You can still play without one; it just won't count.";

type RatingFreezeSheetProps = {
  visible: boolean;
  onClose: () => void;
  userId: string;
  /** Present only when this sheet is gating an in-flight "Find match"
   * submit — swaps the single "Got it" close for Cancel / Play anyway,
   * and fires only on the latter. Absent when opened from the screen's
   * own tappable line, where there's no pending action to gate. */
  onConfirm?: () => void;
};

/**
 * One sheet, two entry points, two intents. Confirm mode — the first
 * time a calibrated player with no booked court taps Find match (see
 * play.tsx's `confirmBeforeCreate`) — leads with the explanation and
 * offers the form after it, then Cancel/Play anyway. Info mode — the
 * permanent "Your court not here?" line on the same screen — answers
 * the question that was actually tapped: form first, explanation
 * demoted below it, header matching the tap instead of a generic
 * title. Same explanation, same VenueRequestForm either way — reused,
 * not duplicated, exactly as for the lobby vs. Explore's empty state.
 */
export function RatingFreezeSheet({ visible, ...rest }: RatingFreezeSheetProps) {
  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={rest.onClose}>
      {visible ? <RatingFreezeSheetBody {...rest} /> : null}
    </Modal>
  );
}

function RatingFreezeSheetBody({ onClose, userId, onConfirm }: Omit<RatingFreezeSheetProps, 'visible'>) {
  const theme = useTheme();
  const explanation = (
    <ThemedText type="small" themeColor="subtle">
      {EXPLANATION}
    </ThemedText>
  );
  const form = <VenueRequestForm userId={userId} variant="rankedBlocked" />;

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
        <View style={[styles.header, { borderBottomColor: theme.border }]}>
          {/* Confirm mode is reached from "Find match" — the explanation
              IS the point there, and the form is the offer that follows
              it. Info mode is reached by tapping "Your court not here?"
              — that question deserves the header and the top of the
              sheet, with the fuller explanation demoted below it. */}
          <ThemedText type="heading">{onConfirm ? 'Playing without a booking' : 'Your court not here?'}</ThemedText>
          <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={onClose} hitSlop={8}>
            <ThemedText type="smallBold" themeColor="primary">
              Close
            </ThemedText>
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={styles.scroll}>
          {onConfirm ? (
            <>
              {explanation}
              {form}
            </>
          ) : (
            <>
              {form}
              {explanation}
            </>
          )}
        </ScrollView>

        {onConfirm ? (
          <View style={[styles.footer, { borderTopColor: theme.border }]}>
            <View style={styles.footerButton}>
              <Button title="Cancel" variant="outline" onPress={onClose} />
            </View>
            <View style={styles.footerButton}>
              <Button
                title="Play anyway"
                onPress={() => {
                  onConfirm();
                  onClose();
                }}
              />
            </View>
          </View>
        ) : null}
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1, maxWidth: MaxContentWidth, width: '100%', alignSelf: 'center' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.four,
    paddingBottom: Spacing.three,
    borderBottomWidth: 1,
    gap: Spacing.two,
  },
  scroll: { padding: Spacing.four, gap: Spacing.three },
  footer: { flexDirection: 'row', gap: Spacing.two + Spacing.half, padding: Spacing.four, borderTopWidth: 1 },
  footerButton: { flex: 1 },
});
