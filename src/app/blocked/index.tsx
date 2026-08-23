import { Stack, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Avatar } from '@/components/post-card';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useToast } from '@/components/ui/toast';
import { Skeleton } from '@/components/ui/skeleton';
import { MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { listMyBlocks, unblockUser } from '@/lib/blocks';
import type { BlockedUser } from '@/lib/database.types';
import { useSession } from '@/providers/session';

/**
 * Same list-with-remove shape as favorites/index.tsx, one deliberate
 * difference: unblocking optimistically removes the row, but a failure
 * RESTORES it and says why, rather than silently reloading the whole
 * list. A block or unblock that appears to work and didn't is the same
 * failure family as everything else tonight — someone believes they've
 * unblocked someone and hasn't, with the row just as silently back next
 * time they open this screen. Restoring the row immediately, in place,
 * is the honest version of that same moment.
 */
export default function BlockedPlayersScreen() {
  const theme = useTheme();
  const { session } = useSession();
  const { show } = useToast();
  const userId = session?.user.id ?? null;

  const [blocked, setBlocked] = useState<BlockedUser[] | null>(null);
  const [error, setError] = useState(false);

  const load = useCallback(() => {
    listMyBlocks()
      .then((rows) => {
        setBlocked(rows);
        setError(false);
      })
      .catch(() => setError(true));
  }, []);

  useFocusEffect(load);

  const unblock = async (target: BlockedUser) => {
    if (!userId) return;
    setBlocked((prev) => prev?.filter((b) => b.blocked_id !== target.blocked_id) ?? prev);
    try {
      await unblockUser(userId, target.blocked_id);
    } catch {
      // Restore in place rather than a full reload — the row that
      // failed to unblock is the one piece of state that's actually
      // wrong, and reloading everything would hide that specificity.
      setBlocked((prev) => (prev ? [target, ...prev] : prev));
      show(`Couldn't unblock ${target.display_name ?? 'them'}. Try again.`, 'error');
    }
  };

  return (
    <ThemedView style={styles.container}>
      <Stack.Screen options={{ headerShown: true, title: 'Blocked players', headerBackButtonDisplayMode: 'minimal' }} />
      <SafeAreaView style={styles.safeArea} edges={['bottom']}>
        <FlatList
          data={blocked ?? []}
          keyExtractor={(item) => item.blocked_id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <View style={[styles.row, { backgroundColor: theme.card, borderColor: theme.border }]}>
              <Avatar profile={{ id: item.blocked_id, display_name: item.display_name, avatar_url: item.avatar_url }} size={40} />
              <ThemedText type="smallBold" style={styles.name} numberOfLines={1}>
                {item.display_name ?? 'A player'}
              </ThemedText>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Unblock ${item.display_name ?? 'this player'}`}
                onPress={() => unblock(item)}
                hitSlop={8}>
                <ThemedText type="smallBold" themeColor="primary">
                  Unblock
                </ThemedText>
              </Pressable>
            </View>
          )}
          ItemSeparatorComponent={() => <View style={{ height: Spacing.two }} />}
          ListEmptyComponent={
            error ? (
              <View style={[styles.empty, { backgroundColor: theme.card, borderColor: theme.border }]}>
                <ThemedText type="subtitle">Couldn&apos;t load your blocked players</ThemedText>
                <ThemedText type="small" themeColor="subtle">
                  Check your connection and try again.
                </ThemedText>
              </View>
            ) : blocked === null ? (
              <View style={styles.skeletons}>
                <Skeleton height={64} radius={Radius.lg} />
                <Skeleton height={64} radius={Radius.lg} />
              </View>
            ) : (
              <View style={[styles.empty, { backgroundColor: theme.card, borderColor: theme.border }]}>
                <ThemedText type="subtitle">You haven&apos;t blocked anyone</ThemedText>
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
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    borderRadius: Radius.lg,
    borderWidth: 1,
    padding: Spacing.three,
  },
  name: {
    flex: 1,
  },
  skeletons: {
    gap: Spacing.two,
  },
  empty: {
    borderRadius: Radius.xl,
    borderWidth: 1,
    padding: Spacing.four,
    gap: Spacing.two,
  },
});
