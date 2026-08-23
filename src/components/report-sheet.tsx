import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { ReportReason, ReportTargetType } from '@/lib/database.types';
import {
  createReport,
  REPORT_DETAILS_MAX,
  REPORT_REASON_LABELS,
  REPORT_REASONS,
  ReportError,
} from '@/lib/reports';
import { useSession } from '@/providers/session';

/**
 * Reporting objectionable content — App Store Guideline 1.2, which
 * requires any app carrying user-generated content to offer a way to
 * report it.
 *
 * Deliberately low-friction, matching the web's ReportButton: pick a
 * reason, optionally say more, done. Requiring an explanation suppresses
 * reports of exactly the content that most needs reporting, because it
 * makes the reader re-read and describe something they wanted to get
 * away from.
 *
 * THE RULE THIS FILE EXISTS TO KEEP: the sheet never closes on a report
 * that wasn't written. Someone reporting harassment is having the worst
 * experience this app can give them, and a tap that appears to succeed
 * while nothing reached the database leaves them believing they've been
 * heard. Success closes and confirms; every failure keeps the sheet open
 * and says something true.
 *
 * It also does not promise what happens next. "Reviewed within X" is a
 * commitment the platform can't currently keep, and reporting an outcome
 * would leak a moderation decision about someone else.
 */
type ReportSheetProps = {
  visible: boolean;
  onClose: () => void;
  targetType: ReportTargetType;
  targetId: string;
  /** What is being reported, in the reader's words: "post", "player". */
  targetLabel: string;
};

export function ReportSheet({ visible, ...rest }: ReportSheetProps) {
  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={rest.onClose}>
      {/* The body mounts only while open, so a reopened sheet starts
          clean — no half-typed details or stale error from last time —
          without an effect that resets four pieces of state on a prop
          change. Fresh state by construction rather than by cleanup. */}
      {visible ? <ReportSheetBody {...rest} /> : null}
    </Modal>
  );
}

function ReportSheetBody({ onClose, targetType, targetId, targetLabel }: Omit<ReportSheetProps, 'visible'>) {
  const theme = useTheme();
  const { show } = useToast();
  const { session } = useSession();
  const userId = session?.user.id ?? null;

  const [reason, setReason] = useState<ReportReason | null>(null);
  const [details, setDetails] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!reason || submitting) return;
    if (!userId) {
      setError('Sign in to report this.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await createReport(userId, { targetType, targetId, reason, details });
      // Only past this line has anything actually been written.
      show('Report sent. Thanks for telling us.', 'success');
      onClose();
    } catch (e) {
      // Stays open, on purpose. A closed sheet is indistinguishable from
      // a successful one, which is the failure this whole file guards.
      setError(
        e instanceof ReportError ? e.message : "We couldn't send that report. Check your connection and try again."
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ThemedView style={styles.container}>
        <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flex}>
            <View style={[styles.header, { borderBottomColor: theme.border }]}>
              <ThemedText type="heading">Report {targetLabel}</ThemedText>
              <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={onClose} hitSlop={8}>
                <ThemedText type="smallBold" themeColor="primary">
                  Cancel
                </ThemedText>
              </Pressable>
            </View>

            <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
              <ThemedText type="small" themeColor="subtle">
                Tell us what&apos;s wrong. Your report is private — the person you&apos;re reporting won&apos;t know who
                filed it.
              </ThemedText>

              <View style={styles.reasons}>
                {REPORT_REASONS.map((value) => {
                  const selected = reason === value;
                  return (
                    <Pressable
                      key={value}
                      accessibilityRole="radio"
                      accessibilityState={{ checked: selected }}
                      accessibilityLabel={REPORT_REASON_LABELS[value]}
                      onPress={() => {
                        setReason(value);
                        setError(null);
                      }}
                      style={({ pressed }) => [
                        styles.reasonRow,
                        {
                          backgroundColor: selected ? theme.accent : theme.card,
                          borderColor: selected ? theme.primary : theme.border,
                          opacity: pressed ? 0.8 : 1,
                        },
                      ]}>
                      <ThemedText type="small" style={styles.reasonLabel}>
                        {REPORT_REASON_LABELS[value]}
                      </ThemedText>
                      {selected ? <Ionicons name="checkmark-circle" size={20} color={theme.primary} /> : null}
                    </Pressable>
                  );
                })}
              </View>

              <View style={styles.detailsBlock}>
                <ThemedText type="smallBold">Anything else? (optional)</ThemedText>
                <TextInput
                  value={details}
                  onChangeText={setDetails}
                  placeholder="Add context that would help us understand"
                  placeholderTextColor={theme.placeholder}
                  accessibilityLabel="Anything else? (optional)"
                  multiline
                  maxLength={REPORT_DETAILS_MAX}
                  style={[
                    styles.detailsInput,
                    { backgroundColor: theme.card, borderColor: theme.input, color: theme.cardForeground },
                  ]}
                />
              </View>

              {error ? (
                <View style={[styles.errorCard, { backgroundColor: theme.destructiveSoft }]}>
                  <ThemedText type="small" style={{ color: theme.destructiveSoftForeground }}>
                    {error}
                  </ThemedText>
                </View>
              ) : null}
            </ScrollView>

            <View style={[styles.footer, { borderTopColor: theme.border }]}>
              <Button
                title={submitting ? 'Sending…' : 'Send report'}
                onPress={submit}
                disabled={!reason || submitting}
                loading={submitting}
              />
            </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1, maxWidth: MaxContentWidth, width: '100%', alignSelf: 'center' },
  flex: { flex: 1 },
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
  reasons: { gap: Spacing.two },
  reasonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
    minHeight: 48,
    borderRadius: Radius.lg,
    borderWidth: 1,
    paddingHorizontal: Spacing.three,
  },
  reasonLabel: { flexShrink: 1 },
  detailsBlock: { gap: Spacing.one + Spacing.half },
  detailsInput: {
    minHeight: 96,
    borderRadius: Radius.lg,
    borderWidth: 1,
    padding: Spacing.three,
    fontSize: 16,
    textAlignVertical: 'top',
  },
  errorCard: { borderRadius: Radius.lg, padding: Spacing.three },
  footer: { padding: Spacing.four, borderTopWidth: 1 },
});
