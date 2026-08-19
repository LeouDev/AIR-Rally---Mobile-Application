import { useId } from 'react';
import { StyleSheet, TextInput, View, type TextInputProps } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type TextFieldProps = TextInputProps & {
  label: string;
  error?: string | null;
};

/** Input on the 12px radius step, card-white fill, Court Clay border. */
export function TextField({ label, error, style, ...rest }: TextFieldProps) {
  const theme = useTheme();
  const labelId = useId();

  return (
    <View style={styles.wrapper}>
      <ThemedText type="smallBold" nativeID={labelId}>
        {label}
      </ThemedText>
      <TextInput
        placeholderTextColor={theme.placeholder}
        accessibilityLabel={label}
        accessibilityLabelledBy={labelId}
        style={[
          styles.input,
          {
            backgroundColor: theme.card,
            borderColor: error ? theme.destructive : theme.input,
            color: theme.cardForeground,
          },
          style,
        ]}
        {...rest}
      />
      {error ? (
        <ThemedText type="caption" themeColor="destructive">
          {error}
        </ThemedText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    gap: Spacing.one + Spacing.half,
  },
  input: {
    minHeight: 48,
    borderRadius: Radius.lg,
    borderWidth: 1,
    paddingHorizontal: Spacing.three,
    fontSize: 16,
  },
});
