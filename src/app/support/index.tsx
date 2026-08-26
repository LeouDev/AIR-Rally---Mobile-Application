import { Ionicons } from '@expo/vector-icons';
import { Stack, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { KeyboardAvoidingView, Linking, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { TextField } from '@/components/ui/text-field';
import { useToast } from '@/components/ui/toast';
import { MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { SupportCategory, SupportRequest, SupportStatus } from '@/lib/database.types';
import {
  createSupportRequest,
  listMySupportRequests,
  MESSAGE_MAX,
  MESSAGE_MIN,
  SUBJECT_MAX,
  SUPPORT_CATEGORIES,
  SUPPORT_STATUS_LABELS,
  SupportError,
} from '@/lib/support';
import { useSession } from '@/providers/session';

/** Same address the web's /support page shows, and the same one the
 * signup welcome email already promises — not a new commitment. */
const SUPPORT_EMAIL = 'support@air-rally.com';

function formatWhen(iso: string): string {
  return new Date(iso).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
}

/** Open reads as "not looked at yet"; everything else has been picked
 * up, resolved, or closed. Matches the web's outline-vs-secondary split. */
function statusTone(status: SupportStatus): 'neutral' | 'success' {
  return status === 'open' ? 'neutral' : 'success';
}

/**
 * The mobile half of the web's /support. Before this screen existed, a
 * "your support request was resolved" notification resolved to
 * /(tabs)/notifications — the Alerts tab the user was already on — so
 * tapping it appeared to do nothing at all. There was no support surface
 * in this app to route to, and no way to raise a request from it either.
 *
 * Mirrors the web's vocabulary deliberately: the same seven categories,
 * the same status labels ("Being looked at", not "In progress"), the
 * same "Our reply" heading, and the same refusal wording on the rate
 * limit, so one request reads identically wherever it was raised.
 */
export default function SupportScreen() {
  const theme = useTheme();
  const { session } = useSession();
  const { show } = useToast();
  const userId = session?.user.id ?? null;

  const [requests, setRequests] = useState<SupportRequest[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);

  const [category, setCategory] = useState<SupportCategory>('booking');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [errors, setErrors] = useState<{ subject?: string; message?: string }>({});
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    if (!userId) return;
    try {
      setRequests(await listMySupportRequests(userId));
      setLoadFailed(false);
    } catch {
      // An empty list and a failed load look identical otherwise, and
      // "you have no messages" is a lie if the fetch just failed.
      setLoadFailed(true);
      setRequests((prev) => prev ?? []);
    }
  }, [userId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const submit = async () => {
    if (!userId || submitting) return;

    // Same bounds as the web's createSupportRequestSchema — checked here
    // so the message says what's wrong without a round trip, not instead
    // of the database CHECK, which remains the boundary.
    const trimmedSubject = subject.trim();
    const trimmedMessage = message.trim();
    const nextErrors: { subject?: string; message?: string } = {};
    if (trimmedSubject.length === 0) nextErrors.subject = 'Add a short subject.';
    else if (trimmedSubject.length > SUBJECT_MAX) nextErrors.subject = `Please keep the subject under ${SUBJECT_MAX} characters.`;
    if (trimmedMessage.length < MESSAGE_MIN) nextErrors.message = `Tell us a bit more — at least ${MESSAGE_MIN} characters.`;
    else if (trimmedMessage.length > MESSAGE_MAX) nextErrors.message = `Please keep this under ${MESSAGE_MAX} characters.`;

    setErrors(nextErrors);
    if (nextErrors.subject || nextErrors.message) return;

    setSubmitting(true);
    try {
      await createSupportRequest(userId, { category, subject: trimmedSubject, message: trimmedMessage });
      setSubject('');
      setMessage('');
      show("Sent. We'll reply in your notifications.");
      await load();
    } catch (err) {
      // A support request that silently fails is the worst version of
      // this screen — someone believes they've been heard when nothing
      // was written. Every failure surfaces, and the one refusal the
      // user can act on says what it actually is.
      show(
        err instanceof SupportError ? err.message : "That didn't send. Check your connection and try again.",
        'error'
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ThemedView style={styles.container}>
      <Stack.Screen options={{ headerShown: true, title: 'Get help', headerBackButtonDisplayMode: 'minimal' }} />
      <SafeAreaView style={styles.safeArea} edges={['bottom']}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flex}>
          <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
            <ThemedText type="small" themeColor="subtle">
              Tell us what&apos;s going on and we&apos;ll look into it.
            </ThemedText>

            {/* Stated plainly rather than implied, same as the web: there
                is no email reply infrastructure, so promising one here
                would be a promise the platform cannot keep. */}
            <View style={[styles.noteCard, { backgroundColor: theme.muted, borderColor: theme.border }]}>
              <Ionicons name="notifications-outline" size={16} color={theme.mutedForeground} />
              <ThemedText type="small" themeColor="subtle" style={styles.noteText}>
                We reply in your AIR/Rally notifications, not by email — check the Alerts tab.
              </ThemedText>
            </View>

            <View style={styles.block}>
              <ThemedText type="smallBold">What&apos;s this about?</ThemedText>
              <View style={styles.categoryGrid}>
                {SUPPORT_CATEGORIES.map((option) => {
                  const active = option.value === category;
                  return (
                    <Button
                      key={option.value}
                      title={option.label}
                      variant={active ? 'secondary' : 'outline'}
                      onPress={() => setCategory(option.value)}
                      style={styles.categoryChip}
                    />
                  );
                })}
              </View>
            </View>

            <TextField
              label="Subject"
              value={subject}
              onChangeText={setSubject}
              maxLength={SUBJECT_MAX}
              placeholder="A one-line summary"
              error={errors.subject}
            />

            <TextField
              label="What happened?"
              value={message}
              onChangeText={setMessage}
              maxLength={MESSAGE_MAX}
              multiline
              numberOfLines={7}
              style={styles.messageInput}
              placeholder="Include booking references, venue names, or anything else that helps us find it."
              error={errors.message}
            />

            <Button
              title={submitting ? 'Sending…' : 'Send message'}
              onPress={submit}
              disabled={submitting}
              loading={submitting}
            />

            <View style={styles.historyBlock}>
              <ThemedText type="smallBold">Your previous messages</ThemedText>

              {requests === null ? (
                <View style={styles.block}>
                  <Skeleton height={90} radius={Radius.xl} />
                  <Skeleton height={90} radius={Radius.xl} />
                </View>
              ) : loadFailed ? (
                <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
                  <ThemedText type="small" themeColor="destructive">
                    Couldn&apos;t load your previous messages.
                  </ThemedText>
                  <ThemedText type="caption" themeColor="mutedForeground">
                    Anything you&apos;ve already sent is still with us — this is only the list failing to load.
                  </ThemedText>
                  <Button title="Try again" variant="outline" onPress={load} />
                </View>
              ) : requests.length === 0 ? (
                <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
                  <ThemedText type="small" themeColor="subtle">
                    You haven&apos;t messaged us yet. Anything you send appears here with its status, and our reply
                    lands in your Alerts.
                  </ThemedText>
                </View>
              ) : (
                requests.map((request) => (
                  <View
                    key={request.id}
                    style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
                    <View style={styles.cardTop}>
                      <ThemedText type="smallBold" style={styles.cardTitle} numberOfLines={2}>
                        {request.subject}
                      </ThemedText>
                      <Badge label={SUPPORT_STATUS_LABELS[request.status]} tone={statusTone(request.status)} />
                    </View>
                    <ThemedText type="small" themeColor="subtle" numberOfLines={2}>
                      {request.message}
                    </ThemedText>

                    {request.resolution_note ? (
                      <View style={[styles.replyCard, { backgroundColor: theme.muted, borderColor: theme.border }]}>
                        <ThemedText type="caption" themeColor="foreground" style={styles.replyLabel}>
                          Our reply
                        </ThemedText>
                        <ThemedText type="small" themeColor="subtle">
                          {request.resolution_note}
                        </ThemedText>
                      </View>
                    ) : null}

                    <ThemedText type="caption" themeColor="mutedForeground">
                      {formatWhen(request.created_at)}
                    </ThemedText>
                  </View>
                ))
              )}
            </View>

            <View style={[styles.noteCard, { backgroundColor: theme.muted, borderColor: theme.border }]}>
              <Ionicons name="mail-outline" size={16} color={theme.mutedForeground} />
              <ThemedText type="small" themeColor="subtle" style={styles.noteText}>
                Prefer email? Reach us at{' '}
                <ThemedText
                  type="small"
                  themeColor="primary"
                  onPress={() => Linking.openURL(`mailto:${SUPPORT_EMAIL}`)}>
                  {SUPPORT_EMAIL}
                </ThemedText>
                .
              </ThemedText>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1 },
  flex: { flex: 1 },
  scroll: {
    padding: Spacing.four,
    paddingBottom: Spacing.six,
    gap: Spacing.four,
    maxWidth: MaxContentWidth,
    width: '100%',
    alignSelf: 'center',
  },
  block: {
    gap: Spacing.two,
  },
  noteCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.two,
    borderRadius: Radius.lg,
    borderWidth: 1,
    padding: Spacing.three,
  },
  noteText: {
    flex: 1,
  },
  categoryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  categoryChip: {
    minHeight: 40,
    paddingHorizontal: Spacing.three,
  },
  messageInput: {
    minHeight: 140,
    textAlignVertical: 'top',
    paddingTop: Spacing.two,
  },
  historyBlock: {
    gap: Spacing.two,
  },
  card: {
    borderRadius: Radius.xl,
    borderWidth: 1,
    padding: Spacing.three,
    gap: Spacing.two,
  },
  cardTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  cardTitle: {
    flexShrink: 1,
  },
  replyCard: {
    borderRadius: Radius.lg,
    borderWidth: 1,
    padding: Spacing.three,
    gap: Spacing.half,
  },
  replyLabel: {
    fontWeight: '700',
  },
});
