import { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button } from '@/components/ui/button';
import { BottomTabInset, MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { formatCentavos } from '@/lib/bookings';
import type { Profile } from '@/lib/database.types';
import { supabase } from '@/lib/supabase';
import { useSession } from '@/providers/session';

export default function ProfileScreen() {
  const theme = useTheme();
  const { session, signOut } = useSession();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [creditBalance, setCreditBalance] = useState<number | null>(null);
  const [signingOut, setSigningOut] = useState(false);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      supabase
        .from('profiles')
        .select('*')
        .eq('id', session?.user.id ?? '')
        .maybeSingle()
        .then(({ data }) => {
          if (!cancelled && data) setProfile(data);
        });
      // No wallet row means no credit has ever moved — a zero balance.
      supabase
        .from('user_credit_wallets')
        .select('balance')
        .eq('user_id', session?.user.id ?? '')
        .maybeSingle()
        .then(({ data, error }) => {
          if (!cancelled && !error) setCreditBalance(data?.balance ?? 0);
        });
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

        <View style={[styles.card, { backgroundColor: theme.navy, borderColor: theme.navy }]}>
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
        </View>

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
});
