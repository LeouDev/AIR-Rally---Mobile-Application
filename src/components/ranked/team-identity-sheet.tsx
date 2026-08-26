import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button } from '@/components/ui/button';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { useToast } from '@/components/ui/toast';
import { MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { Club, RankedTeam } from '@/lib/database.types';
import { listClubsForUser } from '@/lib/clubs';
import { RankedError, setTeamIdentity, type ClubRef } from '@/lib/ranked';

const NAME_MAX = 40;

/**
 * Doubles-only, lobby-only (086's own constraints — enforced server-side,
 * this sheet just doesn't offer the affordance outside that window).
 * Custom name and club are mutually exclusive at the DB CHECK constraint;
 * a club choice requires the SETTER to be an active member, not the whole
 * team, so the picker only ever lists clubs *this* viewer belongs to.
 *
 * Same "never closes on failure" discipline as report-sheet.tsx: success
 * closes and confirms, every failure keeps the sheet open with a real
 * error message.
 */
type TeamIdentitySheetProps = {
  visible: boolean;
  onClose: () => void;
  matchId: string;
  team: RankedTeam;
  userId: string;
  currentName: string | null;
  currentClub: ClubRef | null;
};

export function TeamIdentitySheet({ visible, ...rest }: TeamIdentitySheetProps) {
  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={rest.onClose}>
      {visible ? <TeamIdentitySheetBody {...rest} /> : null}
    </Modal>
  );
}

function TeamIdentitySheetBody({
  onClose,
  matchId,
  team,
  userId,
  currentName,
  currentClub,
}: Omit<TeamIdentitySheetProps, 'visible'>) {
  const theme = useTheme();
  const { show } = useToast();

  const [kind, setKind] = useState<'custom' | 'club'>(currentClub ? 'club' : 'custom');
  const [name, setName] = useState(currentName ?? '');
  const [clubId, setClubId] = useState<string | null>(currentClub?.id ?? null);
  const [clubs, setClubs] = useState<Club[] | undefined>(undefined);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    listClubsForUser(userId)
      .then((result) => {
        if (!cancelled) setClubs(result);
      })
      .catch(() => {
        if (!cancelled) setClubs([]);
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const submit = async (identity: { name: string } | { clubId: string } | null) => {
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await setTeamIdentity(matchId, team, identity);
      // Only past this line has anything actually been written.
      show(identity ? 'Team identity updated.' : 'Team identity cleared.', 'success');
      onClose();
    } catch (e) {
      // Stays open — a closed sheet would look identical to a saved one.
      setError(e instanceof RankedError ? e.message : "That didn't go through. Try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const save = () => {
    if (kind === 'custom') {
      const trimmed = name.trim();
      if (!trimmed) {
        setError('Enter a team name.');
        return;
      }
      submit({ name: trimmed });
    } else {
      if (!clubId) {
        setError('Choose a club.');
        return;
      }
      submit({ clubId });
    }
  };

  const hasExisting = currentName !== null || currentClub !== null;

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flex}>
          <View style={[styles.header, { borderBottomColor: theme.border }]}>
            <ThemedText type="heading">Team identity</ThemedText>
            <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={onClose} hitSlop={8}>
              <ThemedText type="smallBold" themeColor="primary">
                Cancel
              </ThemedText>
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
            <ThemedText type="small" themeColor="subtle">
              Give your team a custom name, or show your club instead. Either one shows to everyone in this match.
            </ThemedText>

            <SegmentedControl
              options={[
                { value: 'custom', label: 'Custom name' },
                { value: 'club', label: 'Club' },
              ]}
              selected={kind}
              onSelect={(value) => {
                setKind(value);
                setError(null);
              }}
            />

            {kind === 'custom' ? (
              <View style={styles.block}>
                <TextInput
                  value={name}
                  onChangeText={setName}
                  placeholder="e.g. The Smashers"
                  placeholderTextColor={theme.placeholder}
                  accessibilityLabel="Team name"
                  maxLength={NAME_MAX}
                  style={[styles.input, { backgroundColor: theme.card, borderColor: theme.input, color: theme.cardForeground }]}
                />
                <ThemedText type="caption" themeColor="subtle">
                  {name.length}/{NAME_MAX}
                </ThemedText>
              </View>
            ) : clubs === undefined ? (
              <ThemedText type="small" themeColor="subtle">
                Loading your clubs…
              </ThemedText>
            ) : clubs.length === 0 ? (
              <ThemedText type="small" themeColor="subtle">
                You&apos;re not an active member of any club yet.
              </ThemedText>
            ) : (
              <View style={styles.block}>
                {clubs.map((club) => {
                  const selected = club.id === clubId;
                  return (
                    <Pressable
                      key={club.id}
                      accessibilityRole="radio"
                      accessibilityState={{ checked: selected }}
                      accessibilityLabel={club.name}
                      onPress={() => {
                        setClubId(club.id);
                        setError(null);
                      }}
                      style={({ pressed }) => [
                        styles.clubRow,
                        {
                          backgroundColor: selected ? theme.accent : theme.card,
                          borderColor: selected ? theme.primary : theme.border,
                          opacity: pressed ? 0.8 : 1,
                        },
                      ]}>
                      <ThemedText type="small" style={styles.clubLabel}>
                        {club.name}
                      </ThemedText>
                      {selected ? <Ionicons name="checkmark-circle" size={20} color={theme.primary} /> : null}
                    </Pressable>
                  );
                })}
              </View>
            )}

            {error ? (
              <View style={[styles.errorCard, { backgroundColor: theme.destructiveSoft }]}>
                <ThemedText type="small" style={{ color: theme.destructiveSoftForeground }}>
                  {error}
                </ThemedText>
              </View>
            ) : null}
          </ScrollView>

          <View style={[styles.footer, { borderTopColor: theme.border }]}>
            {hasExisting ? (
              <Button title="Clear" variant="outline" onPress={() => submit(null)} disabled={submitting} />
            ) : null}
            <Button title={submitting ? 'Saving…' : 'Save'} onPress={save} disabled={submitting} loading={submitting} />
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
  block: { gap: Spacing.two },
  input: {
    minHeight: 48,
    borderRadius: Radius.lg,
    borderWidth: 1,
    paddingHorizontal: Spacing.three,
    fontSize: 16,
  },
  clubRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
    minHeight: 48,
    borderRadius: Radius.lg,
    borderWidth: 1,
    paddingHorizontal: Spacing.three,
  },
  clubLabel: { flexShrink: 1 },
  errorCard: { borderRadius: Radius.lg, padding: Spacing.three },
  footer: { flexDirection: 'row', gap: Spacing.two + Spacing.half, padding: Spacing.four, borderTopWidth: 1 },
});
