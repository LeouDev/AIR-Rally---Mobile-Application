import { Ionicons } from '@expo/vector-icons';
import { Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Avatar } from '@/components/post-card';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/toast';
import { MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { Club } from '@/lib/database.types';
import { getClubForViewer, leaveClub, listClubMembers, requestClubMembership, type ClubMemberWithProfile, type ClubWithViewerState } from '@/lib/clubs';
import { useSession } from '@/providers/session';

const SKILL_LABELS: Record<Club['skill_level'], string> = {
  beginner: 'Beginner',
  intermediate: 'Intermediate',
  advanced: 'Advanced',
  mixed: 'All levels',
};

const TYPE_LABELS: Record<Club['club_type'], string> = {
  social: 'Social',
  competitive: 'Competitive',
  training: 'Training',
  casual: 'Casual',
};

export default function ClubDetailScreen() {
  const theme = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useSession();
  const userId = session?.user.id ?? null;
  const { show } = useToast();

  const [club, setClub] = useState<ClubWithViewerState | null | undefined>(undefined);
  const [members, setMembers] = useState<ClubMemberWithProfile[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const [clubResult, memberRows] = await Promise.all([getClubForViewer(id, userId), listClubMembers(id)]);
      setClub(clubResult);
      setMembers(memberRows);
      setError(null);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "We couldn't load this club.";
      setError(msg);
      show(msg, 'error');
    }
  }, [id, userId, show]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const join = async () => {
    if (!id || !userId || busy) return;
    setBusy(true);
    try {
      await requestClubMembership(id, userId);
      setMessage(club?.visibility === 'approval_required' ? 'Request sent.' : 'Welcome to the club.');
      load();
    } catch (e) {
      show(e instanceof Error ? e.message : "We couldn't send that request.", 'error');
    } finally {
      setBusy(false);
    }
  };

  const leave = async () => {
    if (!id || !userId || busy) return;
    setBusy(true);
    try {
      await leaveClub(id, userId);
      setMessage("You've left the club.");
      load();
    } catch (e) {
      show(e instanceof Error ? e.message : "We couldn't leave the club.", 'error');
    } finally {
      setBusy(false);
    }
  };

  const activeMembers = (members ?? []).filter((m) => m.status === 'active');

  return (
    <ThemedView style={styles.container}>
      <Stack.Screen options={{ headerShown: true, title: club?.name ?? 'Club', headerBackButtonDisplayMode: 'minimal' }} />
      <SafeAreaView style={styles.safeArea} edges={['bottom']}>
        {club === undefined && error ? (
          <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <ThemedText type="subtitle">Couldn&apos;t load this club</ThemedText>
            <ThemedText type="small" themeColor="subtle">
              {error}
            </ThemedText>
            <Button title="Try again" variant="secondary" onPress={load} />
          </View>
        ) : club === undefined ? (
          <View style={styles.block}>
            <Skeleton height={140} radius={Radius.xl} />
          </View>
        ) : club === null ? (
          <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <ThemedText type="subtitle">This club isn&apos;t available</ThemedText>
          </View>
        ) : (
          <ScrollView contentContainerStyle={styles.scroll}>
            <View style={styles.titleBlock}>
              <ThemedText type="heading">{club.name}</ThemedText>
              {club.visibility !== 'public' ? (
                <View style={styles.visibilityRow}>
                  <Ionicons name="lock-closed-outline" size={13} color={theme.mutedForeground} />
                  <ThemedText type="small" themeColor="mutedForeground">
                    {club.visibility === 'private' ? 'Invite only' : 'Approval required'}
                  </ThemedText>
                </View>
              ) : null}
            </View>

            {club.description ? (
              <ThemedText type="small" themeColor="subtle">
                {club.description}
              </ThemedText>
            ) : null}

            <View style={styles.badgeRow}>
              <Badge label={SKILL_LABELS[club.skill_level]} tone="accent" />
              <Badge label={TYPE_LABELS[club.club_type]} tone="neutral" />
            </View>

            <ThemedText type="small" themeColor="subtle">
              {club.member_count} {club.member_count === 1 ? 'member' : 'members'}
              {club.location ? ` · ${club.location}` : ''}
            </ThemedText>

            {message ? (
              <ThemedText type="small" themeColor="subtle">
                {message}
              </ThemedText>
            ) : null}

            {!club.viewerRole && userId ? (
              <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
                {club.viewerPending ? (
                  <ThemedText type="small" themeColor="subtle">
                    Your request to join is waiting for approval.
                  </ThemedText>
                ) : club.visibility === 'private' ? (
                  <ThemedText type="small" themeColor="subtle">
                    This club is invite only.
                  </ThemedText>
                ) : (
                  <>
                    <ThemedText type="small" themeColor="subtle">
                      {club.visibility === 'approval_required'
                        ? 'Request to join — an organizer will review it.'
                        : 'This club is open to anyone.'}
                    </ThemedText>
                    <Button
                      title={club.visibility === 'approval_required' ? 'Request to join' : 'Join club'}
                      onPress={join}
                      disabled={busy}
                      loading={busy}
                    />
                  </>
                )}
              </View>
            ) : null}

            {club.viewerRole && club.viewerRole !== 'owner' ? (
              <Button title="Leave club" variant="secondary" onPress={leave} disabled={busy} loading={busy} />
            ) : null}

            <View style={styles.section}>
              <ThemedText type="smallBold">
                Members{' '}
                <ThemedText type="small" themeColor="mutedForeground">
                  ({activeMembers.length})
                </ThemedText>
              </ThemedText>
              {members === null ? (
                <Skeleton height={60} radius={Radius.lg} />
              ) : activeMembers.length === 0 ? (
                <ThemedText type="small" themeColor="subtle">
                  No members yet.
                </ThemedText>
              ) : (
                activeMembers.map((member) => (
                  <View key={member.user_id} style={[styles.memberRow, { backgroundColor: theme.card, borderColor: theme.border }]}>
                    <Avatar profile={member.profile} size={32} />
                    <ThemedText type="small" style={styles.memberName}>
                      {member.profile?.display_name ?? 'Player'}
                    </ThemedText>
                    {member.role !== 'member' ? (
                      <Badge label={member.role.charAt(0).toUpperCase() + member.role.slice(1)} tone="neutral" />
                    ) : null}
                  </View>
                ))
              )}
            </View>
          </ScrollView>
        )}
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  visibilityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.half,
  },
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  block: {
    padding: Spacing.four,
  },
  card: {
    borderRadius: Radius.xl,
    borderWidth: 1,
    padding: Spacing.four,
    gap: Spacing.two,
  },
  scroll: {
    padding: Spacing.four,
    gap: Spacing.three,
    maxWidth: MaxContentWidth,
    width: '100%',
    alignSelf: 'center',
  },
  titleBlock: {
    gap: Spacing.one,
  },
  badgeRow: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  section: {
    gap: Spacing.two,
    marginTop: Spacing.two,
  },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    borderRadius: Radius.lg,
    borderWidth: 1,
    padding: Spacing.three,
  },
  memberName: {
    flex: 1,
  },
});
