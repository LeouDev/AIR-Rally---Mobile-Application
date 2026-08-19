import { useCallback, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { Notification } from '@/lib/database.types';
import { resolveNotificationTarget } from '@/lib/notification-links';
import { formatRelativeTime } from '@/lib/relative-time';
import { supabase } from '@/lib/supabase';

/**
 * Straight supabase-js read — the RLS policy ("Users can view their own
 * notifications") is the entire filter; no user_id predicate needed or
 * wanted client-side.
 */
export default function NotificationsScreen() {
  const theme = useTheme();
  const [notifications, setNotifications] = useState<Notification[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from('notifications')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50);
    if (!error) setNotifications(data);
  }, []);

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
    if (notification.read_at === null) {
      const readAt = new Date().toISOString();
      setNotifications((prev) =>
        prev?.map((n) => (n.id === notification.id ? { ...n, read_at: readAt } : n)) ?? prev
      );
      supabase
        .from('notifications')
        .update({ read_at: readAt })
        .eq('id', notification.id)
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
    // tab the user is already on.
    const target = resolveNotificationTarget(notification.link_url);
    if (target !== '/(tabs)/notifications') {
      router.push(target);
    }
  }, []);

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ThemedText type="title" style={styles.heading}>
          Alerts
        </ThemedText>
        <FlatList
          data={notifications ?? []}
          keyExtractor={(item) => item.id}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            notifications === null ? null : (
              <View
                style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
                <ThemedText type="subtitle">You&apos;re all caught up</ThemedText>
                <ThemedText type="small" themeColor="subtle">
                  Booking confirmations, invites, and updates will show up here.
                </ThemedText>
              </View>
            )
          }
          renderItem={({ item }) => (
            <Pressable
              accessibilityRole="button"
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
                {item.read_at === null ? (
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
          )}
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
