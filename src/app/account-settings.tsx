import { Stack, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button } from '@/components/ui/button';
import { TextField } from '@/components/ui/text-field';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { Profile } from '@/lib/database.types';
import { changePassword, PHONE_REGEX, updateEmailNotificationPreference, updateProfile } from '@/lib/profile';
import { supabase } from '@/lib/supabase';
import { useSession } from '@/providers/session';

function ProfileFields({
  profile,
  userId,
  onSaved,
}: {
  profile: Profile;
  userId: string;
  onSaved: (profile: Profile) => void;
}) {
  const [firstName, setFirstName] = useState(profile.first_name ?? '');
  const [lastName, setLastName] = useState(profile.last_name ?? '');
  const [displayName, setDisplayName] = useState(profile.display_name ?? '');
  const [phone, setPhone] = useState(profile.phone ?? '');
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const dirty =
    firstName !== (profile.first_name ?? '') ||
    lastName !== (profile.last_name ?? '') ||
    displayName !== (profile.display_name ?? '') ||
    phone !== (profile.phone ?? '');

  const save = async () => {
    setError(null);
    setSaved(false);
    if (!firstName.trim()) return setError('Enter your first name.');
    if (!lastName.trim()) return setError('Enter your last name.');
    if (!displayName.trim()) return setError('Enter a display name.');
    if (phone.trim() && !PHONE_REGEX.test(phone.trim())) return setError('Enter a valid phone number.');

    setSubmitting(true);
    try {
      const updated = await updateProfile(userId, { firstName, lastName, displayName, phone });
      onSaved(updated);
      setSaved(true);
    } catch {
      setError("That didn't save — try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View style={styles.block}>
      <ThemedText type="subtitle">Account details</ThemedText>
      <View style={styles.nameRow}>
        <View style={styles.nameField}>
          <TextField label="First name" value={firstName} onChangeText={setFirstName} autoComplete="given-name" />
        </View>
        <View style={styles.nameField}>
          <TextField label="Last name" value={lastName} onChangeText={setLastName} autoComplete="family-name" />
        </View>
      </View>
      <TextField label="Display name" value={displayName} onChangeText={setDisplayName} />
      <TextField
        label="Phone"
        value={phone}
        onChangeText={setPhone}
        keyboardType="phone-pad"
        placeholder="+63 900 000 0000"
      />
      {error ? (
        <ThemedText type="small" themeColor="destructive">
          {error}
        </ThemedText>
      ) : saved ? (
        <ThemedText type="small" themeColor="success">
          Profile updated.
        </ThemedText>
      ) : null}
      <Button title={submitting ? 'Saving…' : 'Save changes'} onPress={save} disabled={!dirty || submitting} loading={submitting} />
    </View>
  );
}

function NotificationsToggle({ userId, initialEnabled }: { userId: string; initialEnabled: boolean }) {
  const theme = useTheme();
  const [enabled, setEnabled] = useState(initialEnabled);
  const [saving, setSaving] = useState(false);

  const toggle = async () => {
    const next = !enabled;
    setEnabled(next);
    setSaving(true);
    try {
      await updateEmailNotificationPreference(userId, next);
    } catch {
      setEnabled(!next);
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.block}>
      <ThemedText type="subtitle">Notifications</ThemedText>
      <View style={[styles.toggleRow, { backgroundColor: theme.card, borderColor: theme.border }]}>
        <View style={styles.toggleText}>
          <ThemedText type="smallBold">Email notifications</ThemedText>
          <ThemedText type="caption" themeColor="mutedForeground">
            Get an email copy of your notifications — bookings, credits, and more. This never affects what shows up
            in the app itself.
          </ThemedText>
        </View>
        <Pressable
          accessibilityRole="switch"
          accessibilityState={{ checked: enabled }}
          onPress={toggle}
          disabled={saving}
          style={[styles.switch, { backgroundColor: enabled ? theme.primary : theme.muted }]}>
          <View style={[styles.switchThumb, { transform: [{ translateX: enabled ? 20 : 2 }] }]} />
        </Pressable>
      </View>
    </View>
  );
}

function PasswordFields() {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const save = async () => {
    setError(null);
    setSaved(false);
    if (password.length < 8) return setError('Password must be at least 8 characters.');
    if (password !== confirmPassword) return setError("Passwords don't match.");

    setSubmitting(true);
    try {
      await changePassword(password);
      setSaved(true);
      setPassword('');
      setConfirmPassword('');
    } catch {
      setError("That didn't go through — try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View style={styles.block}>
      <ThemedText type="subtitle">Password</ThemedText>
      <ThemedText type="small" themeColor="subtle">
        Change the password for this account.
      </ThemedText>
      <TextField
        label="New password"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        autoComplete="new-password"
        placeholder="At least 8 characters"
      />
      <TextField
        label="Confirm new password"
        value={confirmPassword}
        onChangeText={setConfirmPassword}
        secureTextEntry
        autoComplete="new-password"
        placeholder="Re-enter your new password"
      />
      {error ? (
        <ThemedText type="small" themeColor="destructive">
          {error}
        </ThemedText>
      ) : saved ? (
        <ThemedText type="small" themeColor="success">
          Password updated.
        </ThemedText>
      ) : null}
      <Button title={submitting ? 'Updating…' : 'Update password'} onPress={save} disabled={submitting} loading={submitting} />
    </View>
  );
}

export default function AccountSettingsScreen() {
  const { session } = useSession();
  const userId = session?.user.id ?? null;
  const [profile, setProfile] = useState<Profile | null>(null);

  const load = useCallback(() => {
    if (!userId) return;
    supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle()
      .then(({ data }) => data && setProfile(data));
  }, [userId]);

  useFocusEffect(load);

  return (
    <ThemedView style={styles.container}>
      <Stack.Screen options={{ headerShown: true, title: 'Account settings', headerBackButtonDisplayMode: 'minimal' }} />
      <SafeAreaView style={styles.safeArea} edges={['bottom']}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <ThemedText type="small" themeColor="subtle">
            {session?.user.email}
          </ThemedText>
          {profile && userId ? (
            <>
              <ProfileFields profile={profile} userId={userId} onSaved={setProfile} />
              <NotificationsToggle userId={userId} initialEnabled={profile.email_notifications_enabled} />
              <PasswordFields />
            </>
          ) : null}
        </ScrollView>
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
  scroll: {
    padding: Spacing.four,
    gap: Spacing.five,
  },
  block: {
    gap: Spacing.three,
  },
  nameRow: {
    flexDirection: 'row',
    gap: Spacing.three,
  },
  nameField: {
    flex: 1,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    borderRadius: Radius.lg,
    borderWidth: 1,
    padding: Spacing.three,
  },
  toggleText: {
    flex: 1,
    gap: 4,
  },
  switch: {
    width: 44,
    height: 24,
    borderRadius: Radius.pill,
    justifyContent: 'center',
  },
  switchThumb: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#ffffff',
  },
});
