import { FontAwesome } from '@expo/vector-icons';
import * as AppleAuthentication from 'expo-apple-authentication';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useTheme } from '@/hooks/use-theme';
import { signInWithApple, signInWithProvider, type OAuthProvider } from '@/lib/oauth';

const APPLE_BUTTON_HEIGHT = 48;

/**
 * "Continue with Google/Facebook/Apple" — native counterpart to the web's
 * OAuthButtons.tsx (web doesn't offer Apple; App Store Guideline 4.8, the
 * reason Apple is here at all, only governs the iOS app). Google/Facebook
 * icons come from the FontAwesome set already bundled in
 * @expo/vector-icons rather than a dedicated brand-SVG package. Apple's
 * button is Apple's own native component, not styled to match — Apple's
 * Human Interface Guidelines require using their component as-is, a
 * custom-styled lookalike is a real rejection reason.
 */
export function OAuthButtons() {
  const theme = useTheme();
  const scheme = useColorScheme();
  const [pending, setPending] = useState<OAuthProvider | 'apple' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [appleAvailable, setAppleAvailable] = useState(false);

  useEffect(() => {
    if (Platform.OS !== 'ios') return;
    AppleAuthentication.isAvailableAsync().then(setAppleAvailable);
  }, []);

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

  const handleApplePress = async () => {
    if (pending !== null) return;
    setError(null);
    setPending('apple');
    const result = await signInWithApple();
    setPending(null);
    if (result.status === 'error') {
      setError(result.message);
    }
  };

  return (
    <View style={styles.container}>
      {appleAvailable ? (
        <AppleAuthentication.AppleAuthenticationButton
          buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
          buttonStyle={
            scheme === 'dark'
              ? AppleAuthentication.AppleAuthenticationButtonStyle.WHITE
              : AppleAuthentication.AppleAuthenticationButtonStyle.BLACK
          }
          cornerRadius={APPLE_BUTTON_HEIGHT / 2}
          style={[styles.appleButton, pending !== null && styles.appleButtonDisabled]}
          onPress={handleApplePress}
        />
      ) : null}
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
  appleButton: {
    height: APPLE_BUTTON_HEIGHT,
  },
  appleButtonDisabled: {
    opacity: 0.85,
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
