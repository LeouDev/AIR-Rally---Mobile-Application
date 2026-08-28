import { useCallback, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button } from '@/components/ui/button';
import { BottomTabInset, MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { Notification } from '@/lib/database.types';
import { resolveNotificationTarget } from '@/lib/notification-links';
import { formatRelativeTime } from '@/lib/relative-time';
import { supabase } from '@/lib/supabase';
import { useSession } from '@/providers/session';

/**
 * Scoped to the signed-in user IN THE QUERY, deliberately, rather than
 * left to RLS.
 *
 * This used to read `.from('notifications').select('*')` with no
 * predicate, on the reasoning — written into the comment here — that the
 * policy "Users can view their own notifications" was the entire filter.
 * That quoted the policy name at exactly the point it stops being true.
 * It is actually "Users can view their own notifications, ADMINS SEE
 * ALL", `using (auth.uid() = user_id or public.is_admin())`, so an admin
 * opening their own Alerts tab got every user's notifications, all worded
 * in the second person. Reported as duplicate "Email confirmed" rows;
 * they were seventeen different people's.
 *
 * RLS is a security boundary, not a UI filter. Here the two want
 * different answers — the boundary is "may this account read this row",
 * the screen's question is "is this row addressed to me" — and only the
 * second one belongs in a personal feed. A screen that asks the security
 * layer what to display inherits every widening of that layer as a
 * feature.
 *
 * Today the leak is harmless: "your account is ready" tells an admin
 * nothing. The same feed carries booking confirmations, payout amounts
 * and match results as those start flowing, and it gets worse with every
 * signup.
 */
export default function NotificationsScreen() {
  const theme = useTheme();
  const { session } = useSession();
  const userId = session?.user.id ?? null;
  const [notifications, setNotifications] = useState<Notification[] | null>(null);
  const [error, setError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!userId) {
      setNotifications([]);
      setError(false);
      return;
    }
    const { data, error: fetchError } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(50);
    if (fetchError) {
      setError(true);
    } else {
      setNotifications(data);
      setError(false);
    }
  }, [userId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  /** Mark read (optimistically) and follow the notification into the app.
   * link_url uses the web's paths — "/bookings/<id>" maps onto the app's
   * booking screen; a bare "/bookings" stays on the tab bar. */
  const openNotification = useCallback((notification: Notification) => {
    if (notification.read_at === null && userId) {
      const readAt = new Date().toISOString();
      setNotifications((prev) =>
        prev?.map((n) => (n.id === notification.id ? { ...n, read_at: readAt } : n)) ?? prev
      );
      supabase
        .from('notifications')
        .update({ read_at: readAt })
        .eq('id', notification.id)
        // Belt to the query filter's braces. The UPDATE policy is also
        // `auth.uid() = user_id or is_admin()`, so an admin tapping a row
        // that wasn't theirs would have silently marked ANOTHER user's
        // notification read — that person then never sees it as new. That
        // was reachable before the list was scoped; this makes it
        // unreachable even if the list ever widens again.
        .eq('user_id', userId)
        .then(({ error }) => {
          if (error) {
            setNotifications((prev) =>
              prev?.map((n) => (n.id === notification.id ? { ...n, read_at: null } : n)) ?? prev
            );
          }
        });
    }

    // Same mapper the push-tap path uses — but from the Alerts list a
    // web-only destination should stay put rather than "navigate" to the
    // tab the user is already on. The type is passed as a fallback for
    // rows written without a link_url (see TYPE_FALLBACK).
    const target = resolveNotificationTarget(notification.link_url, notification.type);
    if (target !== '/(tabs)/notifications') {
      router.push(target);
    }
  }, [userId]);

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ThemedText type="title" style={styles.heading}>
          Alerts
        </ThemedText>
        {error && notifications !== null ? (
          <ThemedText type="small" themeColor="destructive">
            Couldn&apos;t refresh your alerts. Pull to retry.
          </ThemedText>
        ) : null}
        <FlatList
          data={notifications ?? []}
          keyExtractor={(item) => item.id}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            error ? (
              <View
                style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
                <ThemedText type="subtitle">Couldn&apos;t load your alerts</ThemedText>
                <ThemedText type="small" themeColor="subtle">
                  Check your connection and try again.
                </ThemedText>
                <Button title="Try again" variant="outline" onPress={load} />
              </View>
            ) : notifications === null ? null : (
              <View
                style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
                <ThemedText type="subtitle">You&apos;re all caught up</ThemedText>
                <ThemedText type="small" themeColor="subtle">
                  Booking confirmations, invites, and updates will show up here.
                </ThemedText>
              </View>
            )
          }
          renderItem={({ item }) => {
            const isUnread = item.read_at === null;
            return (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`${isUnread ? 'New: ' : ''}${item.title}. ${item.message}`}
                onPress={() => openNotification(item)}
                style={({ pressed }) => [
                  styles.card,
                  {
                    backgroundColor: theme.card,
                    borderColor: theme.border,
                    opacity: pressed ? 0.9 : 1,
                  },
                ]}>
                <View style={styles.cardHeader}>
                  {isUnread ? (
                    <View style={[styles.unreadDot, { backgroundColor: theme.primary }]} />
                  ) : null}
                  <ThemedText type="smallBold" style={styles.cardTitle} numberOfLines={1}>
                    {item.title}
                  </ThemedText>
                  {/* Terse by design — it must never push the title out. */}
                  <ThemedText type="caption" themeColor="mutedForeground">
                    {formatRelativeTime(item.created_at)}
                  </ThemedText>
                </View>
                <ThemedText type="small" themeColor="subtle" style={styles.cardMessage}>
                  {item.message}
                </ThemedText>
              </Pressable>
            );
          }}
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
    paddingHorizontal: Spacing.four,
    gap: Spacing.three,
    maxWidth: MaxContentWidth,
    width: '100%',
    alignSelf: 'center',
  },
  heading: {
    paddingTop: Spacing.three,
  },
  list: {
    gap: Spacing.two,
    paddingBottom: BottomTabInset + Spacing.three,
  },
  card: {
    borderRadius: Radius.xl,
    borderWidth: 1,
    padding: Spacing.three,
    gap: Spacing.one,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  cardTitle: {
    flex: 1,
  },
  cardMessage: {
    marginTop: Spacing.half,
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: Radius.pill,
  },
});
