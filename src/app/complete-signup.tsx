import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button } from '@/components/ui/button';
import { Wordmark } from '@/components/wordmark';
import { MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { CURRENT_AGREEMENT_VERSION } from '@/lib/legal';
import { supabase } from '@/lib/supabase';
import { useSession } from '@/providers/session';

/**
 * The one step Google/Facebook sign-in can't do for you: Supabase
 * creates-or-signs-in transparently on OAuth, with no checkbox moment —
 * so a first-time arrival lands here, signed in but not yet agreed,
 * before the root layout's guard lets them any further. Mirrors the
 * web's /auth/callback redirect to /signup?complete=1 for the same case.
 */
export default function CompleteSignupScreen() {
  const theme = useTheme();
  const { session, signOut, markAgreementAccepted } = useSession();
  const [agreed, setAgreed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleContinue = async () => {
    if (!agreed || !session?.user.id || submitting) return;
    setSubmitting(true);
    setError(null);
    const { error: rpcError } = await supabase.rpc('record_agreement_acceptance', {
      p_user_id: session.user.id,
      p_agreement_version: CURRENT_AGREEMENT_VERSION,
    });
    setSubmitting(false);
    if (rpcError) {
      setError("That didn't go through — try again.");
      return;
    }
    markAgreementAccepted();
    // No navigation needed — the root guard swaps to (tabs) the moment
    // needsAgreement flips to false.
  };

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.content}>
          <Wordmark size={26} />
          <ThemedText type="heading">One more thing</ThemedText>
          <ThemedText themeColor="subtle">
            Before you continue, please agree to the AIR/Rally User Agreement — the same terms as
            air-rally.com/legal.
          </ThemedText>

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
              I agree to the{' '}
              <ThemedText
                type="small"
                themeColor="primary"
                onPress={() => router.push({ pathname: '/legal/[doc]', params: { doc: 'terms' } })}>
                AIR/Rally User Agreement (v{CURRENT_AGREEMENT_VERSION})
              </ThemedText>
              .
            </ThemedText>
          </Pressable>

          {error ? (
            <ThemedText type="small" themeColor="destructive">
              {error}
            </ThemedText>
          ) : null}

          <Button title="Continue" onPress={handleContinue} disabled={!agreed} loading={submitting} />
          <Button title="Sign out instead" variant="secondary" onPress={signOut} />
        </View>
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
  content: {
    flex: 1,
    justifyContent: 'center',
    padding: Spacing.four,
    gap: Spacing.three,
    maxWidth: MaxContentWidth,
    width: '100%',
    alignSelf: 'center',
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
});
