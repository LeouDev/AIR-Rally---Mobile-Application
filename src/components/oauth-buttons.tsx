import { FontAwesome } from '@expo/vector-icons';
import * as AppleAuthentication from 'expo-apple-authentication';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, View } from 'react-native';

import { GoogleMark } from '@/components/ui/google-mark';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useTheme } from '@/hooks/use-theme';
import { signInWithApple, signInWithProvider, type OAuthProvider } from '@/lib/oauth';

/** One height for all three, so the stack reads as a single control
 * group. Apple's button is a native component whose internal typography
 * cannot be restyled (their HIG requires it as-is), so height, corner
 * radius and width are the dimensions actually available to unify. */
const OAUTH_BUTTON_HEIGHT = 48;
const APPLE_BUTTON_HEIGHT = OAUTH_BUTTON_HEIGHT;

/**
 * Google's values, not AIR/Rally's — deliberately hardcoded rather than
 * mapped onto theme tokens.
 *
 * developers.google.com/identity/branding-guidelines specifies the
 * button surface exactly: light is #FFFFFF with a 1px #747775 stroke and
 * #1F1F1F text; dark is #131314 with a 1px #8E918F stroke and #E3E3E3
 * text. It also forbids the standard-colour mark on any background other
 * than light, dark or neutral — which the previous implementation broke
 * in dark mode, where `theme.card` is navy #132a49.
 *
 * Pulling these from the palette would let a future theme change quietly
 * make the button non-compliant, so they are pinned here with their
 * source.
 */
const GOOGLE_BUTTON = {
  light: { fill: '#FFFFFF', stroke: '#747775', text: '#1F1F1F' },
  dark: { fill: '#131314', stroke: '#8E918F', text: '#E3E3E3' },
} as const;

/** Google's iOS spacing: 16 before the mark, 12 between mark and label,
 * 16 after the label. */
const GOOGLE_PADDING = { edge: 16, gap: 12 } as const;

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
  const googleColors = scheme === 'dark' ? GOOGLE_BUTTON.dark : GOOGLE_BUTTON.light;

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
        accessibilityLabel="Continue with Google"
        onPress={() => handlePress('google')}
        disabled={pending !== null}
        style={({ pressed }) => [
          styles.button,
          styles.googleButton,
          {
            backgroundColor: googleColors.fill,
            borderColor: googleColors.stroke,
            borderWidth: 1,
            opacity: pressed || pending !== null ? 0.85 : 1,
          },
        ]}>
        {pending === 'google' ? (
          <ActivityIndicator color={googleColors.text} />
        ) : (
          <GoogleMark size={20} />
        )}
        {/* "Continue with Google" is one of the three call-to-action
            strings Google's guidelines permit. */}
        <ThemedText type="smallBold" style={{ color: googleColors.text }}>
          {pending === 'google' ? 'Connecting…' : 'Continue with Google'}
        </ThemedText>
      </Pressable>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Continue with Facebook"
        onPress={() => handlePress('facebook')}
        disabled={pending !== null}
        style={({ pressed }) => [
          styles.button,
          styles.brandButton,
          { backgroundColor: '#1877F2', opacity: pressed || pending !== null ? 0.85 : 1 },
        ]}>
        {pending === 'facebook' ? (
          <ActivityIndicator color="#ffffff" />
        ) : (
          <FontAwesome name="facebook" size={20} color="#ffffff" />
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
    minHeight: OAUTH_BUTTON_HEIGHT,
    borderRadius: Radius.pill,
  },
  /* Google's own iOS padding, and its mark sits at a fixed size — the
     guidelines forbid resizing it relative to the button. */
  googleButton: {
    justifyContent: 'center',
    gap: GOOGLE_PADDING.gap,
    paddingLeft: GOOGLE_PADDING.edge,
    paddingRight: GOOGLE_PADDING.edge,
  },
  /* Matched to Google's metrics so the two custom buttons read as one
     pair rather than two unrelated controls. */
  brandButton: {
    justifyContent: 'center',
    gap: GOOGLE_PADDING.gap,
    paddingHorizontal: GOOGLE_PADDING.edge,
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
