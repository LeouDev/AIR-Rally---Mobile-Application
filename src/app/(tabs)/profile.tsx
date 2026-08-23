import { Ionicons } from '@expo/vector-icons';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import { Image } from 'expo-image';

import { OwnerApplicationCTA } from '@/components/owner-application-cta';
import { RankCard } from '@/components/ranked/rank-card';
import { ReferralCard } from '@/components/referral-card';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/toast';
import { BottomTabInset, MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { pickAvatarImage, uploadAvatar } from '@/lib/avatars';
import { formatCentavos } from '@/lib/bookings';
import type { Profile } from '@/lib/database.types';
import { getFollowCounts, type FollowCounts } from '@/lib/follows';
import { updateProfile } from '@/lib/profile';
import { getProfileStats, type ProfileStats } from '@/lib/profile-stats';
import { getPlayerMatchTotals } from '@/lib/ranked';
import { supabase } from '@/lib/supabase';
import { useSession } from '@/providers/session';

function formatMemberSince(iso: string): string {
  return new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' }).format(new Date(iso));
}

export default function ProfileScreen() {
  const theme = useTheme();
  const { session, signOut } = useSession();
  const { show } = useToast();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [creditBalance, setCreditBalance] = useState<number | null>(null);
  const [stats, setStats] = useState<ProfileStats | null>(null);
  const [followCounts, setFollowCounts] = useState<FollowCounts | null>(null);
  // Across every confirmed match, casual included — not PlayerRank.wins,
  // which is ranked-only. A player with no confirmed matches has no row
  // in the view at all; that's zero wins, not a failure.
  const [totalWins, setTotalWins] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [signingOut, setSigningOut] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  const userId = session?.user.id ?? null;

  const load = useCallback(() => {
    if (!userId) return;
    setLoading(true);
    Promise.allSettled([
      supabase.from('profiles').select('*').eq('id', userId).maybeSingle(),
      // No wallet row means no credit has ever moved — a zero balance.
      supabase.from('user_credit_wallets').select('balance').eq('user_id', userId).maybeSingle(),
      getProfileStats(userId),
      getFollowCounts(userId),
      getPlayerMatchTotals(userId),
    ]).then(([profileResult, walletResult, statsResult, followResult, totalsResult]) => {
      let failed = false;

      if (profileResult.status === 'fulfilled') {
        const { data, error } = profileResult.value;
        if (error) failed = true;
        else if (data) setProfile(data);
      } else {
        failed = true;
      }

      if (walletResult.status === 'fulfilled') {
        const { data, error } = walletResult.value;
        if (error) failed = true;
        else setCreditBalance(data?.balance ?? 0);
      } else {
        failed = true;
      }

      if (statsResult.status === 'fulfilled') setStats(statsResult.value);
      else failed = true;

      if (followResult.status === 'fulfilled') setFollowCounts(followResult.value);
      else failed = true;

      // No row means no confirmed matches — zero, not an error.
      if (totalsResult.status === 'fulfilled') setTotalWins(totalsResult.value?.wins ?? 0);
      else failed = true;

      if (failed) show("Some profile info couldn't be loaded. Switch tabs and back to retry.", 'error');
      setLoading(false);
    });
  }, [userId, show]);

  useFocusEffect(load);

  const handleSignOut = async () => {
    setSigningOut(true);
    await signOut();
    // No navigation here either — the root guard swaps stacks.
  };

  const handleChangePhoto = async () => {
    if (!userId || uploadingAvatar) return;
    const picked = await pickAvatarImage();
    if (!picked) return;
    setUploadingAvatar(true);
    try {
      const url = await uploadAvatar(userId, picked);
      const updated = await updateProfile(userId, {
        firstName: profile?.first_name ?? '',
        lastName: profile?.last_name ?? '',
        displayName: profile?.display_name ?? '',
        phone: profile?.phone ?? '',
        avatarUrl: url,
      });
      setProfile(updated);
    } catch {
      // The avatar just stays as it was; nothing to roll back. But this
      // used to fail fully silently — a picked photo could look accepted
      // and just never appear, with no way to tell upload failed from
      // "still loading." Surface it instead.
      show("Couldn't update your photo — try again.", 'error');
    } finally {
      setUploadingAvatar(false);
    }
  };

  const roleLabel =
    profile?.role === 'venue_owner' ? 'Venue Owner' : profile?.role === 'admin' ? 'Admin' : 'Player';
  const displayName = profile?.display_name || session?.user.email || 'Your name';
  const initials = displayName.slice(0, 1).toUpperCase();

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.scroll}>
          <ThemedText type="title">Profile</ThemedText>
          <ThemedText type="small" themeColor="subtle">
            Manage your account and preferences.
          </ThemedText>

          {profile === null && loading ? (
            <Skeleton height={168} radius={Radius.xl} />
          ) : (
            <View style={[styles.headerCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
              <View style={styles.headerTop}>
                <View style={styles.avatarWrap}>
                  <View style={[styles.avatar, { backgroundColor: theme.navy }]}>
                    {profile?.avatar_url ? (
                      <Image source={{ uri: profile.avatar_url }} style={styles.avatarImage} contentFit="cover" />
                    ) : (
                      <ThemedText type="heading" style={{ color: theme.navyForeground }}>
                        {initials}
                      </ThemedText>
                    )}
                  </View>
                  {userId ? (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Change profile photo"
                      onPress={handleChangePhoto}
                      disabled={uploadingAvatar}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      style={[styles.avatarEdit, { backgroundColor: theme.foreground, borderColor: theme.card }]}>
                      {uploadingAvatar ? (
                        <ThemedText style={{ fontSize: 14, color: theme.background }}>…</ThemedText>
                      ) : (
                        <Ionicons name="camera" size={14} color={theme.background} />
                      )}
                    </Pressable>
                  ) : null}
                </View>

                <View style={styles.identity}>
                  <View style={styles.nameRow}>
                    <ThemedText type="subtitle">{displayName}</ThemedText>
                    <View style={[styles.rolePill, { backgroundColor: theme.neutralSoft }]}>
                      <ThemedText type="caption" style={{ color: theme.neutralSoftForeground }}>
                        {roleLabel}
                      </ThemedText>
                    </View>
                  </View>
                  {profile ? (
                    <ThemedText type="small" themeColor="subtle">
                      Playing since {formatMemberSince(profile.created_at)}
                    </ThemedText>
                  ) : null}
                </View>
              </View>

              {userId ? (
                <Pressable
                  accessibilityRole="button"
                  onPress={() => router.push({ pathname: '/player/[userId]', params: { userId } })}
                  style={[styles.publicProfileButton, { borderColor: theme.border }]}>
                  <ThemedText type="smallBold">View public profile</ThemedText>
                </Pressable>
              ) : null}

              <View style={[styles.statsRow, { borderTopColor: theme.border }]}>
                {/* Four fits, five collides — "Followers"/"Following"
                    run together at this width. Reviews gives up the
                    slot rather than Wins: Wins is what was actually
                    asked for, and nothing on this screen links to a
                    reviews list anyway. getProfileStats still returns
                    reviewCount, so restoring it is a one-line change. */}
                <StatItem label="Plays" value={stats?.tripCount} />
                <StatItem label="Wins" value={totalWins ?? undefined} />
                <StatItem label="Followers" value={followCounts?.followers} />
                <StatItem label="Following" value={followCounts?.following} />
              </View>
            </View>
          )}

          <RankCard />

          {profile?.role === 'player' ? <OwnerApplicationCTA ownerStatus={profile.owner_status} /> : null}

          {profile ? <ReferralCard referralCode={profile.referral_code} /> : null}

          {profile?.role === 'venue_owner' || profile?.role === 'admin' ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push('/owner')}
              style={({ pressed }) => [
                styles.card,
                { backgroundColor: theme.card, borderColor: theme.border, opacity: pressed ? 0.9 : 1 },
              ]}>
              <View style={styles.identity}>
                <ThemedText type="subtitle">Your venues</ThemedText>
                <ThemedText type="small" themeColor="subtle">
                  Bookings and customer payments, read-only. Manage venues at air-rally.com.
                </ThemedText>
              </View>
              <ThemedText type="heading" themeColor="mutedForeground">
                ›
              </ThemedText>
            </Pressable>
          ) : null}

          <Pressable
            accessibilityRole="button"
            onPress={() => router.push('/credits')}
            style={({ pressed }) => [
              styles.card,
              { backgroundColor: theme.navy, borderColor: theme.navy, opacity: pressed ? 0.9 : 1 },
            ]}>
            <View style={styles.identity}>
              <ThemedText type="small" style={{ color: theme.navyForeground }}>
                AIR/Rally Credits
              </ThemedText>
              <ThemedText type="heading" style={{ color: theme.navyForeground }}>
                {creditBalance === null ? '—' : formatCentavos(creditBalance)}
              </ThemedText>
              <ThemedText type="caption" style={{ color: theme.navyForeground }}>
                Credits apply automatically at checkout. Bookings paid with credits are final.
              </ThemedText>
            </View>
            <ThemedText type="heading" style={{ color: theme.navyForeground }}>
              ›
            </ThemedText>
          </Pressable>

          <View style={styles.shortcutsSection}>
            <ThemedText type="smallBold">Shortcuts</ThemedText>
            <View style={styles.shortcutGrid}>
              <ShortcutCard
                icon="chatbubbles-outline"
                title="COURT/Side"
                subtitle="Posts, players you follow, and the community feed."
                onPress={() => router.push('/court-side')}
              />
              <ShortcutCard
                icon="people-outline"
                title="Clubs"
                subtitle="Find a club or manage the ones you're in."
                onPress={() => router.push('/clubs')}
              />
              <ShortcutCard
                icon="trophy-outline"
                title="Games"
                subtitle="Your ranked record — wins, rank, and match history."
                onPress={() => router.push('/ranked/games')}
              />
              <ShortcutCard
                icon="list-outline"
                title="My bookings"
                subtitle="Upcoming games and your booking history."
                onPress={() => router.push('/(tabs)/bookings')}
              />
              <ShortcutCard
                icon="card-outline"
                title="AIR/Rally Credits"
                subtitle="Your balance and where it came from."
                onPress={() => router.push('/credits')}
              />
              <ShortcutCard
                icon="heart-outline"
                title="Saved courts"
                subtitle="Venues you've favourited."
                onPress={() => router.push('/favorites')}
              />
              <ShortcutCard
                icon="ban-outline"
                title="Blocked players"
                subtitle="Manage who you've blocked."
                onPress={() => router.push('/blocked')}
              />
              <ShortcutCard
                icon="search-outline"
                title="Find a court"
                subtitle="Browse venues and book your next rally."
                onPress={() => router.push('/(tabs)')}
              />
              <ShortcutCard
                icon="settings-outline"
                title="Account settings"
                subtitle="Name, photo, and contact details."
                onPress={() => router.push('/account-settings')}
              />
            </View>
          </View>

          <Button title="Sign out" variant="secondary" onPress={handleSignOut} loading={signingOut} />
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

function StatItem({ label, value }: { label: string; value: number | undefined }) {
  return (
    <View style={styles.statItem}>
      <ThemedText type="smallBold">{value === undefined ? '—' : value}</ThemedText>
      <ThemedText type="caption" themeColor="mutedForeground">
        {label}
      </ThemedText>
    </View>
  );
}

function ShortcutCard({
  icon,
  title,
  subtitle,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle: string;
  onPress: () => void;
}) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.shortcutCard,
        { backgroundColor: theme.card, borderColor: theme.border, opacity: pressed ? 0.9 : 1 },
      ]}>
      <View style={[styles.shortcutIcon, { backgroundColor: theme.accent }]}>
        <Ionicons name={icon} size={18} color={theme.accentForeground} />
      </View>
      <ThemedText type="smallBold">{title}</ThemedText>
      <ThemedText type="caption" themeColor="mutedForeground">
        {subtitle}
      </ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  scroll: {
    padding: Spacing.four,
    paddingBottom: BottomTabInset + Spacing.three,
    gap: Spacing.four,
    maxWidth: MaxContentWidth,
    width: '100%',
    alignSelf: 'center',
  },
  headerCard: {
    borderRadius: Radius.xl,
    borderWidth: 1,
    padding: Spacing.four,
    gap: Spacing.three,
  },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  avatarWrap: {
    position: 'relative',
  },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: Radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarImage: {
    width: '100%',
    height: '100%',
  },
  avatarEdit: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    width: 28,
    height: 28,
    borderRadius: Radius.pill,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  identity: {
    flex: 1,
    gap: Spacing.one,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    flexWrap: 'wrap',
  },
  rolePill: {
    alignSelf: 'flex-start',
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.half,
    borderRadius: Radius.pill,
  },
  publicProfileButton: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderRadius: Radius.pill,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one,
  },
  statsRow: {
    flexDirection: 'row',
    borderTopWidth: 1,
    paddingTop: Spacing.three,
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
  },
  card: {
    borderRadius: Radius.xl,
    borderWidth: 1,
    padding: Spacing.four,
    flexDirection: 'row',
    gap: Spacing.three,
    alignItems: 'center',
  },
  shortcutsSection: {
    gap: Spacing.two,
  },
  shortcutGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  shortcutCard: {
    flexBasis: '48%',
    flexGrow: 1,
    borderRadius: Radius.lg,
    borderWidth: 1,
    padding: Spacing.three,
    gap: Spacing.half,
  },
  shortcutIcon: {
    width: 32,
    height: 32,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.half,
  },
});
