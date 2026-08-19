import { FontAwesome } from '@expo/vector-icons';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { signInWithProvider, type OAuthProvider } from '@/lib/oauth';

/**
 * "Continue with Google/Facebook" — native counterpart to the web's
 * OAuthButtons.tsx. Same two providers only: Apple isn't configured in
 * Supabase yet, so a button here would just fail on tap. Icons come from
 * the FontAwesome set already bundled in @expo/vector-icons rather than
 * a dedicated brand-SVG package, so this needs no new native dependency
 * (and the rebuild that would trigger).
 */
export function OAuthButtons() {
  const theme = useTheme();
  const [pending, setPending] = useState<OAuthProvider | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handlePress = async (provider: OAuthProvider) => {
    setError(null);
    setPending(provider);
    const result = await signInWithProvider(provider);
    setPending(null);
    if (result.status === 'error') {
      setError(result.message);
    }
    // 'signed_in' needs no navigation — the root guard reacts to the new
    // session on its own. 'cancelled' needs no message — the player just
    // closed the sheet.
  };

  return (
    <View style={styles.container}>
      <Pressable
        accessibilityRole="button"
        onPress={() => handlePress('google')}
        disabled={pending !== null}
        style={({ pressed }) => [
          styles.button,
          { backgroundColor: theme.card, borderColor: theme.border, borderWidth: 1, opacity: pressed || pending !== null ? 0.85 : 1 },
        ]}>
        {pending === 'google' ? (
          <ActivityIndicator color={theme.foreground} />
        ) : (
          <FontAwesome name="google" size={18} color="#4285F4" />
        )}
        <ThemedText type="smallBold">{pending === 'google' ? 'Connecting…' : 'Continue with Google'}</ThemedText>
      </Pressable>

      <Pressable
        accessibilityRole="button"
        onPress={() => handlePress('facebook')}
        disabled={pending !== null}
        style={({ pressed }) => [
          styles.button,
          { backgroundColor: '#1877F2', opacity: pressed || pending !== null ? 0.85 : 1 },
        ]}>
        {pending === 'facebook' ? (
          <ActivityIndicator color="#ffffff" />
        ) : (
          <FontAwesome name="facebook" size={18} color="#ffffff" />
        )}
        <ThemedText type="smallBold" style={{ color: '#ffffff' }}>
          {pending === 'facebook' ? 'Connecting…' : 'Continue with Facebook'}
        </ThemedText>
      </Pressable>

      {error ? (
        <ThemedText type="small" themeColor="destructive">
          {error}
        </ThemedText>
      ) : null}

      <View style={styles.dividerRow}>
        <View style={[styles.divider, { backgroundColor: theme.border }]} />
        <ThemedText type="caption" themeColor="mutedForeground">
          or
        </ThemedText>
        <View style={[styles.divider, { backgroundColor: theme.border }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: Spacing.two,
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    minHeight: 48,
    borderRadius: Radius.pill,
    paddingHorizontal: Spacing.four,
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    marginTop: Spacing.one,
  },
  divider: {
    flex: 1,
    height: 1,
  },
});
