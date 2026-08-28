import { DatePicker, Host } from '@expo/ui/swift-ui';
import { datePickerStyle, environment, labelsHidden } from '@expo/ui/swift-ui/modifiers';
import { Platform, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { TextField } from '@/components/ui/text-field';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { formatFilterDate, formatFilterTime, parseFilterDate, parseFilterTime } from '@/lib/filter-dates';

/**
 * A date or time input backed by the real iOS control.
 *
 * `@expo/ui` was already a dependency at the RC commit, so its SwiftUI
 * DatePicker is autolinked into the shipped binary and this needs no new
 * native module — which is the only reason it can go out as an
 * over-the-air update rather than waiting for a build.
 *
 * The value stays a STRING in the caller's state rather than a Date,
 * deliberately. The sheet's own guard — which refuses to apply a value
 * it could not parse instead of silently dropping it — is the thing
 * that actually fixes the bug here, and it has to keep running for
 * every platform and every future caller. Making the picker write into
 * the same string state means it is purely an input method layered on
 * top of that guard, not a replacement for it. A picker cannot protect
 * a code path that does not go through the picker.
 *
 * Android and web keep the text field. That path is safe now precisely
 * because of the guard, so the fallback degrades in appearance, not in
 * correctness.
 */
export function DateTimeField({
  label,
  mode,
  value,
  onChangeText,
  error,
  editable = true,
  /** The day a time belongs to — times are only meaningful alongside one. */
  relativeTo,
}: {
  label: string;
  mode: 'date' | 'time';
  value: string;
  onChangeText: (value: string) => void;
  error?: string | null;
  editable?: boolean;
  relativeTo?: string;
}) {
  const theme = useTheme();

  if (Platform.OS !== 'ios') {
    return (
      <TextField
        label={label}
        value={value}
        onChangeText={onChangeText}
        placeholder={mode === 'date' ? 'YYYY-MM-DD' : 'HH:MM'}
        error={error}
        editable={editable}
      />
    );
  }

  const anchorDay = parseFilterDate(relativeTo) ?? new Date();
  const selection =
    mode === 'date' ? (parseFilterDate(value) ?? new Date()) : (parseFilterTime(value, anchorDay) ?? anchorDay);

  return (
    <View style={styles.wrapper}>
      <ThemedText type="smallBold">{label}</ThemedText>
      <View
        style={[
          styles.host,
          {
            backgroundColor: theme.card,
            borderColor: error ? theme.destructive : theme.input,
            opacity: editable ? 1 : 0.5,
          },
        ]}>
        <Host matchContents>
          <DatePicker
            selection={selection}
            displayedComponents={[mode === 'date' ? 'date' : 'hourAndMinute']}
            onDateChange={(date) => {
              if (!editable) return;
              onChangeText(mode === 'date' ? formatFilterDate(date) : formatFilterTime(date));
            }}
            /* The app is forced light (hooks/use-color-scheme.ts), but this is
               a real SwiftUI view and follows the PHONE, not us. On a
               dark-mode device it painted its value in dark-mode white on
               our light pill — the date became unreadable, which is worse
               than merely inconsistent. Pinning the SwiftUI environment
               keeps the control in step with the app that hosts it.
               Remove this if the app ever follows the system again. */
            modifiers={[datePickerStyle('compact'), labelsHidden(), environment({ key: 'colorScheme', value: 'light' })]}
          />
        </Host>
      </View>
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
  host: {
    minHeight: 48,
    borderRadius: Radius.lg,
    borderWidth: 1,
    paddingHorizontal: Spacing.two,
    justifyContent: 'center',
  },
});
