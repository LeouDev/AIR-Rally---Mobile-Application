import { Link, router } from 'expo-router';
import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { OAuthButtons } from '@/components/oauth-buttons';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button } from '@/components/ui/button';
import { TextField } from '@/components/ui/text-field';
import { Wordmark } from '@/components/wordmark';
import { MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { supabase } from '@/lib/supabase';
import { useTheme } from '@/hooks/use-theme';

/** Mirrors the web's CURRENT_AGREEMENT_VERSION (src/lib/legal.ts) — bump
 * both together when the User Agreement changes. */
const CURRENT_AGREEMENT_VERSION = '2026-08-17';

export default function SignUpScreen() {
  const theme = useTheme();
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [agreed, setAgreed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [awaitingConfirmation, setAwaitingConfirmation] = useState(false);

  const handleSignUp = async () => {
    setError(null);
    if (!firstName.trim() || !lastName.trim()) {
      setError('Enter your first and last name.');
      return;
    }
    if (!email.trim()) {
      setError('Enter a valid email address.');
      return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    if (!agreed) {
      setError('Please agree to the User Agreement to continue.');
      return;
    }

    setSubmitting(true);
    // Same metadata contract as the web signup — handle_new_user() builds
    // the profiles row from these keys.
    const { data, error: signUpError } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        data: {
          first_name: firstName.trim(),
          last_name: lastName.trim(),
          display_name: `${firstName.trim()} ${lastName.trim()}`.trim(),
        },
      },
    });

    if (signUpError) {
      setSubmitting(false);
      setError(signUpError.message);
      return;
    }

    // Recorded via the same SECURITY DEFINER RPC the web uses; the
    // checkbox only gated getting this far. Failure is logged, not
    // blocking — the account already exists (see web auth.ts rationale).
    if (data.user) {
      const { error: agreementError } = await supabase.rpc('record_agreement_acceptance', {
        p_user_id: data.user.id,
        p_agreement_version: CURRENT_AGREEMENT_VERSION,
      });
      if (agreementError) console.warn('record_agreement_acceptance failed', agreementError.message);
    }

    setSubmitting(false);
    if (data.session === null) {
      setAwaitingConfirmation(true);
    }
    // With a live session the root guard swaps to (tabs) on its own.
  };

  if (awaitingConfirmation) {
    return (
      <ThemedView style={styles.container}>
        <SafeAreaView style={styles.safeArea}>
          <View style={[styles.scroll, styles.confirmation]}>
            <Wordmark />
            <ThemedText type="heading">Check your email</ThemedText>
            <ThemedText themeColor="subtle">
              We sent a confirmation link to {email.trim()}. Confirm your address, then come back
              and sign in.
            </ThemedText>
            <Button title="Back to sign in" variant="secondary" onPress={() => router.back()} />
          </View>
        </SafeAreaView>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.flex}>
          <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
            <View style={styles.header}>
              <Wordmark size={26} />
              <ThemedText type="heading">Create your account</ThemedText>
            </View>

            <OAuthButtons />

            <View style={styles.form}>
              <View style={styles.nameRow}>
                <View style={styles.nameField}>
                  <TextField
                    label="First name"
                    value={firstName}
                    onChangeText={setFirstName}
                    autoComplete="given-name"
                    placeholder="Alex"
                  />
                </View>
                <View style={styles.nameField}>
                  <TextField
                    label="Last name"
                    value={lastName}
                    onChangeText={setLastName}
                    autoComplete="family-name"
                    placeholder="Santos"
                  />
                </View>
              </View>
              <TextField
                label="Email"
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                autoComplete="email"
                keyboardType="email-address"
                placeholder="you@example.com"
              />
              <TextField
                label="Password"
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                autoComplete="new-password"
                placeholder="At least 8 characters"
              />
              <TextField
                label="Confirm password"
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                secureTextEntry
                autoComplete="new-password"
                placeholder="Repeat your password"
              />

              <Pressable
                accessibilityRole="checkbox"
                accessibilityState={{ checked: agreed }}
                onPress={() => setAgreed((v) => !v)}
                style={styles.agreementRow}>
                <View
                  style={[
                    styles.checkbox,
                    {
                      borderColor: agreed ? theme.primary : theme.input,
                      backgroundColor: agreed ? theme.primary : theme.card,
                    },
                  ]}>
                  {agreed ? (
                    <ThemedText type="smallBold" style={{ color: theme.primaryForeground }}>
                      ✓
                    </ThemedText>
                  ) : null}
                </View>
                <ThemedText type="small" themeColor="subtle" style={styles.agreementText}>
                  I agree to the AIR/Rally User Agreement (v{CURRENT_AGREEMENT_VERSION}) — the same
                  terms as air-rally.com/legal.
                </ThemedText>
              </Pressable>

              {error ? (
                <ThemedText type="small" themeColor="destructive">
                  {error}
                </ThemedText>
              ) : null}

              <Button title="Create account" onPress={handleSignUp} loading={submitting} />
            </View>

            <View style={styles.footer}>
              <ThemedText type="small" themeColor="subtle">
                Already have an account?
              </ThemedText>
              <Link href="/sign-in">
                <ThemedText type="smallBold" themeColor="primary">
                  Sign in
                </ThemedText>
              </Link>
            </View>
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
    flexGrow: 1,
    justifyContent: 'center',
    padding: Spacing.four,
    gap: Spacing.four,
    maxWidth: MaxContentWidth,
    width: '100%',
    alignSelf: 'center',
  },
  confirmation: {
    flex: 1,
    gap: Spacing.three,
  },
  header: {
    gap: Spacing.two,
  },
  form: {
    gap: Spacing.three,
  },
  nameRow: {
    flexDirection: 'row',
    gap: Spacing.three,
  },
  nameField: {
    flex: 1,
  },
  agreementRow: {
    flexDirection: 'row',
    gap: Spacing.two,
    alignItems: 'flex-start',
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: Radius.sm,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  agreementText: {
    flex: 1,
  },
  footer: {
    flexDirection: 'row',
    gap: Spacing.one,
    alignItems: 'center',
  },
});
