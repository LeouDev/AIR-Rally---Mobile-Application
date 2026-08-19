import { router, Stack, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import {
  creditEntryLabel,
  formatCreditAmount,
  formatCreditBalance,
  getCreditBalance,
  listCreditTransactions,
  withRunningBalance,
  type CreditHistoryEntry,
} from '@/lib/credits';
import { useSession } from '@/providers/session';

export default function CreditsScreen() {
  const theme = useTheme();
  const { session } = useSession();
  const userId = session?.user.id ?? null;

  const [balance, setBalance] = useState<number | null>(null);
  const [entries, setEntries] = useState<CreditHistoryEntry[] | null>(null);

  const load = useCallback(async () => {
    if (!userId) return;
    const [bal, transactions] = await Promise.all([getCreditBalance(userId), listCreditTransactions(userId)]);
    setBalance(bal);
    setEntries(withRunningBalance(transactions, bal));
  }, [userId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  return (
    <ThemedView style={styles.container}>
      <Stack.Screen options={{ headerShown: true, title: 'AIR/Rally Credits', headerBackButtonDisplayMode: 'minimal' }} />
      <SafeAreaView style={styles.safeArea} edges={['bottom']}>
        <FlatList
          data={entries ?? []}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <View style={[styles.entryCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
              <View style={styles.entryRow}>
                <ThemedText type="small">{creditEntryLabel(item)}</ThemedText>
                <ThemedText type="smallBold" themeColor={item.amount < 0 ? 'foreground' : 'success'}>
                  {formatCreditAmount(item.amount)}
                </ThemedText>
              </View>
              <View style={styles.entryRow}>
                <ThemedText type="caption" themeColor="mutedForeground">
                  {new Intl.DateTimeFormat('en-US', { dateStyle: 'medium' }).format(new Date(item.created_at))}
                </ThemedText>
                <ThemedText type="caption" themeColor="mutedForeground">
                  Balance {formatCreditBalance(item.runningBalance)}
                </ThemedText>
              </View>
            </View>
          )}
          ItemSeparatorComponent={() => <View style={{ height: Spacing.two }} />}
          ListHeaderComponent={
            <View style={styles.headerBlock}>
              <View style={[styles.balanceCard, { backgroundColor: theme.secondary }]}>
                <ThemedText type="caption" style={[styles.balanceLabel, { color: theme.secondaryForeground }]}>
                  AIR/RALLY CREDITS
                </ThemedText>
                <ThemedText type="title" style={{ color: theme.secondaryForeground }}>
                  {balance === null ? '—' : formatCreditBalance(balance)}
                </ThemedText>
                <View style={styles.bookButton}>
                  <Button title="Book a court" onPress={() => router.push('/(tabs)')} />
                </View>
              </View>

              <View style={[styles.noticeCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
                <ThemedText type="small">
                  <ThemedText type="smallBold">Credits never expire.</ThemedText> They stay on your account until you
                  use them.
                </ThemedText>
                <ThemedText type="small">
                  <ThemedText type="smallBold">No payment fee.</ThemedText> Book with credits and the online payment
                  fee doesn&apos;t apply.
                </ThemedText>
              </View>

              <ThemedText type="smallBold">History</ThemedText>
            </View>
          }
          ListEmptyComponent={
            entries === null ? (
              <View style={styles.skeletons}>
                <Skeleton height={64} radius={Radius.lg} />
                <Skeleton height={64} radius={Radius.lg} />
              </View>
            ) : (
              <View style={[styles.emptyCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
                <ThemedText type="subtitle">No credits yet</ThemedText>
                <ThemedText type="small" themeColor="subtle">
                  You&apos;ll see credits here if a booking is cancelled. They never expire, and they cover the
                  online payment fee.
                </ThemedText>
              </View>
            )
          }
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
  },
  list: {
    padding: Spacing.four,
    maxWidth: MaxContentWidth,
    width: '100%',
    alignSelf: 'center',
  },
  headerBlock: {
    gap: Spacing.three,
    marginBottom: Spacing.one,
  },
  balanceCard: {
    borderRadius: Radius.xl,
    padding: Spacing.five,
    alignItems: 'center',
    gap: Spacing.one,
  },
  balanceLabel: {
    letterSpacing: 1.2,
  },
  bookButton: {
    marginTop: Spacing.two,
    alignSelf: 'stretch',
  },
  noticeCard: {
    borderRadius: Radius.lg,
    borderWidth: 1,
    padding: Spacing.three,
    gap: Spacing.two,
  },
  entryCard: {
    borderRadius: Radius.lg,
    borderWidth: 1,
    padding: Spacing.three,
    gap: 4,
  },
  entryRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  skeletons: {
    gap: Spacing.two,
  },
  emptyCard: {
    borderRadius: Radius.xl,
    borderWidth: 1,
    padding: Spacing.four,
    gap: Spacing.two,
  },
});
