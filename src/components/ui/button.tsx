import { type ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, type PressableProps } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type ButtonProps = Omit<PressableProps, 'children'> & {
  title: string;
  variant?: 'primary' | 'secondary' | 'ghost' | 'outline' | 'destructive';
  loading?: boolean;
  icon?: ReactNode;
  /** Whether the dimmed/disabled STYLE applies — defaults to the same
   * value as `disabled || loading`, matching every existing call site's
   * behavior unchanged. Pass `false` explicitly to keep a button looking
   * normal while it's still functionally blocked from being pressed —
   * the shape a shared "an action is in flight" guard needs: `disabled`
   * on every button in a group so none of them double-fire, but only
   * the one actually loading (or one that's unavailable for its OWN
   * reason) should visibly dim. Without this, a group of buttons that
   * all share one `busy` flag all dim together the instant ANY of them
   * is pressed — confirmed live: the founder reported all four scoring
   * buttons dimming on a single tap, twice, because a previous fix only
   * scoped the spinner (`loading`) and never the dimming. */
  disabledAppearance?: boolean;
};

/**
 * Pill-shaped like the web's CTAs. `primary` is Rally Orange — per the
 * design language at most one primary button should compete in a
 * viewport. `outline` is for the bordered secondary CTAs (referral,
 * public-profile, OAuth-style) that several screens were previously
 * hand-rolling as one-off Pressables. `destructive` is for irreversible
 * actions (account deletion) — never a plain-text Pressable for these,
 * so they read as a real, deliberate control.
 */
export function Button({ title, variant = 'primary', loading, icon, disabled, disabledAppearance, style, ...rest }: ButtonProps) {
  const theme = useTheme();
  const isDisabled = disabled || loading;
  const showDisabledStyle = disabledAppearance ?? isDisabled;

  const background =
    variant === 'primary'
      ? theme.primary
      : variant === 'secondary'
        ? theme.secondary
        : variant === 'outline'
          ? theme.card
          : variant === 'destructive'
            ? theme.destructiveSoft
            : 'transparent';
  const pressedBackground =
    variant === 'primary'
      ? theme.primaryPressed
      : variant === 'secondary'
        ? theme.navyRaised
        : variant === 'outline'
          ? theme.muted
          : variant === 'destructive'
            ? theme.destructive
            : theme.accent;
  const textColor =
    variant === 'primary'
      ? theme.primaryForeground
      : variant === 'secondary'
        ? theme.secondaryForeground
        : variant === 'destructive'
          ? theme.destructiveSoftForeground
          : theme.foreground;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      disabled={isDisabled}
      style={(state) => [
        styles.base,
        { backgroundColor: state.pressed ? pressedBackground : background },
        variant === 'outline' && { borderWidth: 1, borderColor: theme.input },
        showDisabledStyle && styles.disabled,
        typeof style === 'function' ? style(state) : style,
      ]}
      {...rest}>
      {loading ? (
        <ActivityIndicator color={textColor} />
      ) : (
        <>
          {icon}
          <ThemedText type="smallBold" style={{ color: textColor }}>
            {title}
          </ThemedText>
        </>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: 48,
    borderRadius: Radius.pill,
    paddingHorizontal: Spacing.four,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: Spacing.two,
  },
  disabled: {
    opacity: 0.5,
  },
});
