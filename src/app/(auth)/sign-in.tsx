import { Link } from 'expo-router';
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

export default function SignInScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSignIn = async () => {
    setError(null);
    if (!email.trim() || !password) {
      setError('Enter your email and password.');
      return;
    }
    setSubmitting(true);
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    setSubmitting(false);
    if (signInError) {
      setError(
        signInError.message === 'Invalid login credentials'
          ? 'Incorrect email or password.'
          : signInError.message
      );
    }
    // Success needs no navigation — the root layout's Protected guard
    // swaps to (tabs) the moment the session lands.
  };

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.flex}>
          <ScrollView
            contentContainerStyle={styles.scroll}
            keyboardShouldPersistTaps="handled"
            bounces={false}>
            <View style={styles.header}>
              <Wordmark />
              <ThemedText themeColor="subtle">Book courts. Rally your crew.</ThemedText>
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
              />
              <TextField
                label="Password"
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                autoComplete="current-password"
                placeholder="Your password"
                onSubmitEditing={handleSignIn}
              />

              {error ? (
                <ThemedText type="small" themeColor="destructive">
                  {error}
                </ThemedText>
              ) : null}

              <Button title="Sign in" onPress={handleSignIn} loading={submitting} />
            </View>

            <View style={styles.footer}>
              <ThemedText type="small" themeColor="subtle">
                New to AIR/Rally?
              </ThemedText>
              <Link href="/sign-up">
                <ThemedText type="smallBold" themeColor="primary">
                  Create an account
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
    gap: Spacing.five,
    maxWidth: MaxContentWidth,
    width: '100%',
    alignSelf: 'center',
  },
  header: {
    gap: Spacing.two,
  },
  form: {
    gap: Spacing.three,
  },
  footer: {
    flexDirection: 'row',
    gap: Spacing.one,
    alignItems: 'center',
  },
});
