import { Link, router } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button } from '@/components/ui/button';
import { TextField } from '@/components/ui/text-field';
import { Wordmark } from '@/components/wordmark';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { supabase } from '@/lib/supabase';

const REDIRECT_URL = 'airrally://reset-password';

/**
 * Mirrors the web's /forgot-password — mobile previously had no account
 * recovery path at all. resetPasswordForEmail() always succeeds from the
 * caller's point of view (Supabase never reveals whether the address has
 * an account), so the confirmation screen is shown regardless.
 */
export default function ForgotPasswordScreen() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async () => {
    setError(null);
    if (!email.trim()) {
      setError('Enter your email address.');
      return;
    }
    setSubmitting(true);
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: REDIRECT_URL,
    });
    setSubmitting(false);
    if (resetError) {
      setError(resetError.message);
      return;
    }
    setSent(true);
  };

  if (sent) {
    return (
      <ThemedView style={styles.container}>
        <SafeAreaView style={styles.safeArea}>
          <View style={[styles.scroll, styles.confirmation]}>
            <Wordmark />
            <ThemedText type="heading">Check your email</ThemedText>
            <ThemedText themeColor="subtle">
              If an account exists for {email.trim()}, we sent a link to reset your password.
            </ThemedText>
            <Button title="Back to sign in" variant="secondary" onPress={() => router.replace('/sign-in')} />
          </View>
        </SafeAreaView>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flex}>
          <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
            <View style={styles.header}>
              <Wordmark size={26} />
              <ThemedText type="heading">Reset your password</ThemedText>
              <ThemedText themeColor="subtle">
                Enter the email on your account and we'll send you a link to set a new password.
              </ThemedText>
            </View>

            <View style={styles.form}>
              <TextField
                label="Email"
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                autoComplete="email"
                keyboardType="email-address"
                placeholder="you@example.com"
                onSubmitEditing={handleSubmit}
              />
              {error ? (
                <ThemedText type="small" themeColor="destructive">
                  {error}
                </ThemedText>
              ) : null}
              <Button title="Send reset link" onPress={handleSubmit} loading={submitting} />
            </View>

            <View style={styles.footer}>
              <Link href="/sign-in">
                <ThemedText type="smallBold" themeColor="primary">
                  Back to sign in
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
  container: { flex: 1 },
  safeArea: { flex: 1 },
  flex: { flex: 1 },
  scroll: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: Spacing.four,
    gap: Spacing.four,
    maxWidth: MaxContentWidth,
    width: '100%',
    alignSelf: 'center',
  },
  confirmation: { flex: 1, gap: Spacing.three },
  header: { gap: Spacing.two },
  form: { gap: Spacing.three },
  footer: { alignItems: 'center' },
});
