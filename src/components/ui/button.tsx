import { ActivityIndicator, Pressable, StyleSheet, type PressableProps } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type ButtonProps = Omit<PressableProps, 'children'> & {
  title: string;
  variant?: 'primary' | 'secondary' | 'ghost';
  loading?: boolean;
};

/**
 * Pill-shaped like the web's CTAs. `primary` is Rally Orange — per the
 * design language at most one primary button should compete in a
 * viewport.
 */
export function Button({ title, variant = 'primary', loading, disabled, style, ...rest }: ButtonProps) {
  const theme = useTheme();
  const isDisabled = disabled || loading;

  const background =
    variant === 'primary' ? theme.primary : variant === 'secondary' ? theme.secondary : 'transparent';
  const pressedBackground =
    variant === 'primary' ? theme.primaryPressed : variant === 'secondary' ? theme.navyRaised : theme.accent;
  const textColor =
    variant === 'primary'
      ? theme.primaryForeground
      : variant === 'secondary'
        ? theme.secondaryForeground
        : theme.foreground;

  return (
    <Pressable
      accessibilityRole="button"
      disabled={isDisabled}
      style={(state) => [
        styles.base,
        { backgroundColor: state.pressed ? pressedBackground : background },
        isDisabled && styles.disabled,
        typeof style === 'function' ? style(state) : style,
      ]}
      {...rest}>
      {loading ? (
        <ActivityIndicator color={textColor} />
      ) : (
        <ThemedText type="smallBold" style={{ color: textColor }}>
          {title}
        </ThemedText>
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
