import { Ionicons } from '@expo/vector-icons';
import { router, Stack, useFocusEffect } from 'expo-router';
import { type ComponentProps, useCallback, useState } from 'react';
import { Alert, KeyboardAvoidingView, Linking, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button } from '@/components/ui/button';
import { TextField } from '@/components/ui/text-field';
import { useToast } from '@/components/ui/toast';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { deleteAccount } from '@/lib/account';
import type { Profile } from '@/lib/database.types';
import { formatCreditBalance, getCreditBalance } from '@/lib/credits';
import { changePassword, PHONE_REGEX, updateEmailNotificationPreference, updateProfile } from '@/lib/profile';
import { supabase } from '@/lib/supabase';
import { useSession } from '@/providers/session';

/**
 * TextField has no built-in accessory slot, so this overlays a show/hide
 * toggle on top of it — an eye icon absolutely positioned over the input,
 * offset to sit below the label (smallBold line height 20 + wrapper gap
 * 6) and centered in the 48px-tall input beneath it.
 */
function PasswordField({ label, ...rest }: ComponentProps<typeof TextField>) {
  const theme = useTheme();
  const [visible, setVisible] = useState(false);

  return (
    <View style={styles.passwordFieldWrapper}>
      <TextField label={label} {...rest} secureTextEntry={!visible} />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={visible ? `Hide ${label.toLowerCase()}` : `Show ${label.toLowerCase()}`}
        hitSlop={4}
        onPress={() => setVisible((v) => !v)}
        style={styles.passwordToggle}>
        <Ionicons name={visible ? 'eye-off-outline' : 'eye-outline'} size={20} color={theme.mutedForeground} />
      </Pressable>
    </View>
  );
}

function ProfileFields({
  profile,
  userId,
  onSaved,
}: {
  profile: Profile;
  userId: string;
  onSaved: (profile: Profile) => void;
}) {
  const { show } = useToast();
  const [firstName, setFirstName] = useState(profile.first_name ?? '');
  const [lastName, setLastName] = useState(profile.last_name ?? '');
  const [displayName, setDisplayName] = useState(profile.display_name ?? '');
  const [phone, setPhone] = useState(profile.phone ?? '');
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const dirty =
    firstName !== (profile.first_name ?? '') ||
    lastName !== (profile.last_name ?? '') ||
    displayName !== (profile.display_name ?? '') ||
    phone !== (profile.phone ?? '');

  const validatePhoneOnBlur = () => {
    setPhoneError(phone.trim() && !PHONE_REGEX.test(phone.trim()) ? 'Enter a valid phone number.' : null);
  };

  const save = async () => {
    setError(null);
    setSaved(false);
    if (!firstName.trim()) return setError('Enter your first name.');
    if (!lastName.trim()) return setError('Enter your last name.');
    if (!displayName.trim()) return setError('Enter a display name.');
    if (phone.trim() && !PHONE_REGEX.test(phone.trim())) {
      setPhoneError('Enter a valid phone number.');
      return setError('Enter a valid phone number.');
    }

    setSubmitting(true);
    try {
      const updated = await updateProfile(userId, { firstName, lastName, displayName, phone });
      onSaved(updated);
      setSaved(true);
    } catch {
      setError("That didn't save — try again.");
      show("That didn't save — try again.", 'error');
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
        onBlur={validatePhoneOnBlur}
        error={phoneError}
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
          accessibilityLabel="Email notifications"
          accessibilityState={{ checked: enabled }}
          hitSlop={{ top: 10, bottom: 10, left: 8, right: 8 }}
          onPress={toggle}
          disabled={saving}
          style={[styles.switch, { backgroundColor: enabled ? theme.primary : theme.muted }]}>
          <View
            style={[
              styles.switchThumb,
              { backgroundColor: theme.primaryForeground, transform: [{ translateX: enabled ? 20 : 2 }] },
            ]}
          />
        </Pressable>
      </View>
    </View>
  );
}

function PasswordFields() {
  const { show } = useToast();
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
      show("That didn't go through — try again.", 'error');
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
      <PasswordField
        label="New password"
        value={password}
        onChangeText={setPassword}
        autoComplete="new-password"
        placeholder="At least 8 characters"
      />
      <PasswordField
        label="Confirm new password"
        value={confirmPassword}
        onChangeText={setConfirmPassword}
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

function SupportLinks() {
  return (
    <View style={styles.block}>
      <ThemedText type="subtitle">Support</ThemedText>
      <Pressable accessibilityRole="link" onPress={() => Linking.openURL('https://air-rally.com/support')}>
        <ThemedText type="small" themeColor="primary">
          Get help
        </ThemedText>
      </Pressable>
    </View>
  );
}

function LegalLinks() {
  return (
    <View style={styles.block}>
      <ThemedText type="subtitle">Legal</ThemedText>
      <Pressable
        accessibilityRole="button"
        onPress={() => router.push({ pathname: '/legal/[doc]', params: { doc: 'terms' } })}>
        <ThemedText type="small" themeColor="primary">
          User Agreement
        </ThemedText>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        onPress={() => router.push({ pathname: '/legal/[doc]', params: { doc: 'privacy' } })}>
        <ThemedText type="small" themeColor="primary">
          Privacy Policy
        </ThemedText>
      </Pressable>
    </View>
  );
}

/**
 * Apple Guideline 5.1.1(v): a self-service, in-app way to delete the
 * account, and a confirmation the reviewer can't read as casually
 * mis-tappable — a destructive-styled system Alert naming exactly what's
 * kept (booking/payment history, for the same reason a receipt survives
 * a returned purchase) versus what's gone.
 */
function DeleteAccountSection({ userId }: { userId: string }) {
  const { signOut } = useSession();
  const { show } = useToast();
  const [deleting, setDeleting] = useState(false);
  const [checkingBalance, setCheckingBalance] = useState(false);

  const confirmedDelete = async () => {
    setDeleting(true);
    try {
      const result = await deleteAccount();
      if (!result.success) {
        show(result.error, 'error');
        return;
      }
      await signOut();
      // No further navigation here either — the root guard swaps stacks
      // once the session clears, same as the Profile tab's sign-out.
    } finally {
      setDeleting(false);
    }
  };

  const startDelete = async () => {
    setCheckingBalance(true);
    const balance = await getCreditBalance(userId).catch(() => 0);
    setCheckingBalance(false);

    const balanceLine =
      balance > 0
        ? ` You will also forfeit your remaining ${formatCreditBalance(balance)} in AIR/Rally Credits — it cannot be refunded or transferred.`
        : '';

    Alert.alert(
      'Delete your account?',
      `This removes your name, photo, and phone number, signs you out everywhere, and permanently blocks this account from signing in again. Booking and payment records are kept for accounting purposes, as required by law — they are no longer linked to any personal details.${balanceLine}\n\nThis cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete account', style: 'destructive', onPress: confirmedDelete },
      ]
    );
  };

  return (
    <View style={styles.block}>
      <ThemedText type="subtitle">Delete account</ThemedText>
      <ThemedText type="small" themeColor="subtle">
        Permanently delete your AIR/Rally account and personal data.
      </ThemedText>
      <Button
        title="Delete account"
        variant="destructive"
        onPress={startDelete}
        loading={deleting || checkingBalance}
        disabled={deleting || checkingBalance}
      />
    </View>
  );
}

export default function AccountSettingsScreen() {
  const { session } = useSession();
  const { show } = useToast();
  const userId = session?.user.id ?? null;
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!userId) return;
    setLoadError(null);
    supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle()
      .then(({ data, error }) => {
        if (error) {
          setLoadError("We couldn't load your account details.");
          show("We couldn't load your account details.", 'error');
          return;
        }
        if (data) setProfile(data);
      });
  }, [userId, show]);

  useFocusEffect(load);

  return (
    <ThemedView style={styles.container}>
      <Stack.Screen options={{ headerShown: true, title: 'Account settings', headerBackButtonDisplayMode: 'minimal' }} />
      <SafeAreaView style={styles.safeArea} edges={['bottom']}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flex}>
          <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
            <ThemedText type="small" themeColor="subtle">
              {session?.user.email}
            </ThemedText>
            {profile && userId ? (
              <>
                <ProfileFields profile={profile} userId={userId} onSaved={setProfile} />
                <NotificationsToggle userId={userId} initialEnabled={profile.email_notifications_enabled} />
                <PasswordFields />
                <SupportLinks />
                <LegalLinks />
                <DeleteAccountSection userId={userId} />
              </>
            ) : loadError ? (
              <View style={styles.block}>
                <ThemedText type="small" themeColor="destructive">
                  {loadError}
                </ThemedText>
                <Button title="Retry" variant="outline" onPress={load} />
              </View>
            ) : null}
          </ScrollView>
        </KeyboardAvoidingView>
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
  flex: {
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
  },
  passwordFieldWrapper: {
    position: 'relative',
  },
  passwordToggle: {
    position: 'absolute',
    top: 32,
    right: Spacing.two,
    padding: Spacing.two,
  },
});
