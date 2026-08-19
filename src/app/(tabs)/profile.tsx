import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button } from '@/components/ui/button';
import { BottomTabInset, MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { formatCentavos } from '@/lib/bookings';
import type { Profile } from '@/lib/database.types';
import { getFollowCounts, type FollowCounts } from '@/lib/follows';
import { getProfileStats, type ProfileStats } from '@/lib/profile-stats';
import { supabase } from '@/lib/supabase';
import { useSession } from '@/providers/session';

export default function ProfileScreen() {
  const theme = useTheme();
  const { session, signOut } = useSession();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [creditBalance, setCreditBalance] = useState<number | null>(null);
  const [stats, setStats] = useState<ProfileStats | null>(null);
  const [followCounts, setFollowCounts] = useState<FollowCounts | null>(null);
  const [signingOut, setSigningOut] = useState(false);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      const userId = session?.user.id ?? '';
      supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle()
        .then(({ data }) => {
          if (!cancelled && data) setProfile(data);
        });
      // No wallet row means no credit has ever moved — a zero balance.
      supabase
        .from('user_credit_wallets')
        .select('balance')
        .eq('user_id', userId)
        .maybeSingle()
        .then(({ data, error }) => {
          if (!cancelled && !error) setCreditBalance(data?.balance ?? 0);
        });
      if (userId) {
        getProfileStats(userId).then((s) => !cancelled && setStats(s));
        getFollowCounts(userId).then((c) => !cancelled && setFollowCounts(c));
      }
      return () => {
        cancelled = true;
      };
    }, [session?.user.id])
  );

  const handleSignOut = async () => {
    setSigningOut(true);
    await signOut();
    // No navigation here either — the root guard swaps stacks.
  };

  const roleLabel =
    profile?.role === 'venue_owner' ? 'Venue owner' : profile?.role === 'admin' ? 'Admin' : 'Player';

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ThemedText type="title">Profile</ThemedText>

        <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <View style={[styles.avatar, { backgroundColor: theme.navy }]}>
            <ThemedText type="heading" style={{ color: theme.navyForeground }}>
              {(profile?.display_name ?? session?.user.email ?? '?').slice(0, 1).toUpperCase()}
            </ThemedText>
          </View>
          <View style={styles.identity}>
            <ThemedText type="subtitle">
              {profile?.display_name ?? 'Your name'}
            </ThemedText>
            <ThemedText type="small" themeColor="subtle">
              {session?.user.email}
            </ThemedText>
            <View style={[styles.rolePill, { backgroundColor: theme.neutralSoft }]}>
              <ThemedText type="caption" style={{ color: theme.neutralSoftForeground }}>
                {roleLabel}
              </ThemedText>
            </View>
          </View>
        </View>

        <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <StatItem label="Trips" value={stats?.tripCount} />
          <StatItem label="Reviews" value={stats?.reviewCount} />
          <StatItem label="Followers" value={followCounts?.followers} />
          <StatItem label="Following" value={followCounts?.following} />
        </View>

        <View style={styles.shortcutGroup}>
          <ShortcutRow
            title="COURT/Side"
            subtitle="Share your games and follow other players."
            onPress={() => router.push('/court-side')}
          />
          <ShortcutRow title="Clubs" subtitle="Find or run a local playing group." onPress={() => router.push('/clubs')} />
        </View>

        {profile?.role === 'venue_owner' || profile?.role === 'admin' ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push('/owner')}
            style={({ pressed }) => [
              styles.card,
              {
                backgroundColor: theme.card,
                borderColor: theme.border,
                opacity: pressed ? 0.9 : 1,
              },
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

        <View style={styles.spacer} />
        <Button
          title="Sign out"
          variant="secondary"
          onPress={handleSignOut}
          loading={signingOut}
        />
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

function ShortcutRow({ title, subtitle, onPress }: { title: string; subtitle: string; onPress: () => void }) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        { backgroundColor: theme.card, borderColor: theme.border, opacity: pressed ? 0.9 : 1 },
      ]}>
      <View style={styles.identity}>
        <ThemedText type="subtitle">{title}</ThemedText>
        <ThemedText type="small" themeColor="subtle">
          {subtitle}
        </ThemedText>
      </View>
      <ThemedText type="heading" themeColor="mutedForeground">
        ›
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
    padding: Spacing.four,
    paddingBottom: BottomTabInset + Spacing.three,
    gap: Spacing.four,
    maxWidth: MaxContentWidth,
    width: '100%',
    alignSelf: 'center',
  },
  card: {
    borderRadius: Radius.xl,
    borderWidth: 1,
    padding: Spacing.four,
    flexDirection: 'row',
    gap: Spacing.three,
    alignItems: 'center',
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: Radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  identity: {
    flex: 1,
    gap: Spacing.one,
  },
  rolePill: {
    alignSelf: 'flex-start',
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.half,
    borderRadius: Radius.pill,
    marginTop: Spacing.half,
  },
  spacer: {
    flex: 1,
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
  },
  shortcutGroup: {
    gap: Spacing.two,
  },
});
