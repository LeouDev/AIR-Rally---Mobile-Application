import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button } from '@/components/ui/button';
import { TextField } from '@/components/ui/text-field';
import { Wordmark } from '@/components/wordmark';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { supabase } from '@/lib/supabase';

type Stage = 'exchanging' | 'invalid' | 'form' | 'done';

/**
 * Landing point for the airrally://reset-password link sent by
 * forgot-password.tsx. Registered unconditionally (see _layout.tsx) since
 * it has to be reachable whether or not a session already exists — the
 * same reasoning as legal/[doc]. The `code` param is a PKCE recovery
 * code, exchanged the same way lib/oauth.ts exchanges an OAuth code.
 * After a successful password update we sign out and send the user back
 * to sign in, rather than trusting the recovery session as a normal
 * signed-in session.
 */
export default function ResetPasswordScreen() {
  const { code } = useLocalSearchParams<{ code?: string }>();
  const [stage, setStage] = useState<Stage>('exchanging');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!code) {
      setStage('invalid');
      return;
    }
    supabase.auth.exchangeCodeForSession(code).then(({ error: exchangeError }) => {
      setStage(exchangeError ? 'invalid' : 'form');
    });
  }, [code]);

  const handleSubmit = async () => {
    setError(null);
    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords don't match.");
      return;
    }
    setSubmitting(true);
    const { error: updateError } = await supabase.auth.updateUser({ password });
    if (updateError) {
      setSubmitting(false);
      setError(updateError.message);
      return;
    }
    await supabase.auth.signOut();
    setSubmitting(false);
    setStage('done');
  };

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.content}>
          <Wordmark size={26} />

          {stage === 'exchanging' ? (
            <ThemedText themeColor="subtle">Confirming your link…</ThemedText>
          ) : null}

          {stage === 'invalid' ? (
            <>
              <ThemedText type="heading">That link didn't work</ThemedText>
              <ThemedText themeColor="subtle">
                This reset link is invalid or has expired. Request a new one from the sign-in screen.
              </ThemedText>
              <Button title="Back to sign in" variant="secondary" onPress={() => router.replace('/sign-in')} />
            </>
          ) : null}

          {stage === 'form' ? (
            <>
              <ThemedText type="heading">Set a new password</ThemedText>
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
                onSubmitEditing={handleSubmit}
              />
              {error ? (
                <ThemedText type="small" themeColor="destructive">
                  {error}
                </ThemedText>
              ) : null}
              <Button title="Update password" onPress={handleSubmit} loading={submitting} />
            </>
          ) : null}

          {stage === 'done' ? (
            <>
              <ThemedText type="heading">Password updated</ThemedText>
              <ThemedText themeColor="subtle">Sign in with your new password.</ThemedText>
              <Button title="Back to sign in" onPress={() => router.replace('/sign-in')} />
            </>
          ) : null}
        </View>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1 },
  content: {
    flex: 1,
    justifyContent: 'center',
    padding: Spacing.four,
    gap: Spacing.three,
    maxWidth: MaxContentWidth,
    width: '100%',
    alignSelf: 'center',
  },
});
