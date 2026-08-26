import { Ionicons } from '@expo/vector-icons';
import { Link, router } from 'expo-router';
import { forwardRef, useRef, useState, type ComponentProps, type ComponentType, type Ref } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
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
import { useKeyboardAwareScroll } from '@/hooks/use-keyboard-aware-scroll';
import { useTheme } from '@/hooks/use-theme';
import { getFriendlyAuthErrorMessage } from '@/lib/auth-errors';
import { CURRENT_AGREEMENT_VERSION } from '@/lib/legal';
import { supabase } from '@/lib/supabase';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// TextField isn't declared with forwardRef, but React 19 forwards a `ref`
// prop to function components at runtime regardless — this cast just
// gives that already-working runtime behavior a type that TypeScript
// (still requiring an explicit `ref` prop for non-forwardRef components)
// will accept, so First/Last name/Email can be focus-chained below.
const FocusableTextField = TextField as unknown as ComponentType<
  ComponentProps<typeof TextField> & { ref?: Ref<TextInput> }
>;

/**
 * TextField has no built-in accessory slot, so this overlays a show/hide
 * toggle on top of it — an eye icon absolutely positioned over the input,
 * offset to sit below the label (smallBold line height 20 + wrapper gap
 * 6) and centered in the 48px-tall input beneath it. forwardRef so the
 * return-key chain below can still focus the underlying TextInput.
 */
const PasswordField = forwardRef<TextInput, ComponentProps<typeof TextField>>(function PasswordField(
  { label, ...rest },
  ref
) {
  const theme = useTheme();
  const [visible, setVisible] = useState(false);

  return (
    <View style={styles.passwordFieldWrapper}>
      <FocusableTextField ref={ref} label={label} {...rest} secureTextEntry={!visible} />
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
});

export default function SignUpScreen() {
  const theme = useTheme();
  const { ref: scrollRef, props: keyboardProps, scrollFocusedIntoView } = useKeyboardAwareScroll<ScrollView>();
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [agreed, setAgreed] = useState(false);
  const [firstNameError, setFirstNameError] = useState<string | null>(null);
  const [lastNameError, setLastNameError] = useState<string | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [confirmPasswordError, setConfirmPasswordError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [awaitingConfirmation, setAwaitingConfirmation] = useState(false);

  const lastNameRef = useRef<TextInput>(null);
  const emailRef = useRef<TextInput>(null);
  const passwordRef = useRef<TextInput>(null);
  const confirmPasswordRef = useRef<TextInput>(null);

  const handleSignUp = async () => {
    setError(null);

    // Validate every field at once so a user with several mistakes sees
    // all of them on the first submit, not one per attempt.
    const nextFirstNameError = firstName.trim() ? null : 'Enter your first name.';
    const nextLastNameError = lastName.trim() ? null : 'Enter your last name.';
    const nextEmailError = !email.trim()
      ? 'Enter your email address.'
      : !EMAIL_REGEX.test(email.trim())
        ? 'Enter a valid email address.'
        : null;
    const nextPasswordError = password.length < 8 ? 'Password must be at least 8 characters.' : null;
    const nextConfirmPasswordError = password !== confirmPassword ? 'Passwords do not match.' : null;

    setFirstNameError(nextFirstNameError);
    setLastNameError(nextLastNameError);
    setEmailError(nextEmailError);
    setPasswordError(nextPasswordError);
    setConfirmPasswordError(nextConfirmPasswordError);

    if (nextFirstNameError || nextLastNameError || nextEmailError || nextPasswordError || nextConfirmPasswordError) {
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
      setError(getFriendlyAuthErrorMessage(signUpError));
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
        {/* KeyboardAvoidingView shrank the container but never scrolled
            the focused field into view, so the later fields in this form
            could still sit under the keyboard. The hook does both. */}
        <ScrollView ref={scrollRef} contentContainerStyle={styles.scroll} {...keyboardProps}>
            <View style={styles.header}>
              <Wordmark size={26} />
              <ThemedText type="heading">Create your account</ThemedText>
            </View>

            <OAuthButtons />

            <View style={styles.form}>
              <View style={styles.nameRow}>
                <View style={styles.nameField}>
                  <FocusableTextField
                    onFocus={scrollFocusedIntoView}
                    label="First name"
                    value={firstName}
                    onChangeText={(text) => {
                      setFirstName(text);
                      setFirstNameError(null);
                    }}
                    error={firstNameError}
                    autoComplete="given-name"
                    placeholder="Alex"
                    returnKeyType="next"
                    submitBehavior="submit"
                    onSubmitEditing={() => lastNameRef.current?.focus()}
                  />
                </View>
                <View style={styles.nameField}>
                  <FocusableTextField
                    onFocus={scrollFocusedIntoView}
                    ref={lastNameRef}
                    label="Last name"
                    value={lastName}
                    onChangeText={(text) => {
                      setLastName(text);
                      setLastNameError(null);
                    }}
                    error={lastNameError}
                    autoComplete="family-name"
                    placeholder="Santos"
                    returnKeyType="next"
                    submitBehavior="submit"
                    onSubmitEditing={() => emailRef.current?.focus()}
                  />
                </View>
              </View>
              <FocusableTextField
                onFocus={scrollFocusedIntoView}
                ref={emailRef}
                label="Email"
                value={email}
                onChangeText={(text) => {
                  setEmail(text);
                  setEmailError(null);
                }}
                error={emailError}
                autoCapitalize="none"
                autoComplete="email"
                keyboardType="email-address"
                placeholder="you@example.com"
                returnKeyType="next"
                submitBehavior="submit"
                onSubmitEditing={() => passwordRef.current?.focus()}
              />
              <PasswordField
                onFocus={scrollFocusedIntoView}
                ref={passwordRef}
                label="Password"
                value={password}
                onChangeText={(text) => {
                  setPassword(text);
                  setPasswordError(null);
                }}
                error={passwordError}
                autoComplete="new-password"
                placeholder="At least 8 characters"
                returnKeyType="next"
                submitBehavior="submit"
                onSubmitEditing={() => confirmPasswordRef.current?.focus()}
              />
              <PasswordField
                onFocus={scrollFocusedIntoView}
                ref={confirmPasswordRef}
                label="Confirm password"
                value={confirmPassword}
                onChangeText={(text) => {
                  setConfirmPassword(text);
                  setConfirmPasswordError(null);
                }}
                error={confirmPasswordError}
                autoComplete="new-password"
                placeholder="Repeat your password"
                returnKeyType="done"
                onSubmitEditing={handleSignUp}
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
                  {agreed ? <Ionicons name="checkmark" size={16} color={theme.primaryForeground} /> : null}
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
