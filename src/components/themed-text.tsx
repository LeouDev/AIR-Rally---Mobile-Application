import { StyleSheet, Text, type TextProps } from 'react-native';

import { Fonts, ThemeColor } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type ThemedTextProps = TextProps & {
  type?: 'default' | 'title' | 'heading' | 'subtitle' | 'small' | 'smallBold' | 'caption' | 'code';
  themeColor?: ThemeColor;
};

export function ThemedText({ style, type = 'default', themeColor, ...rest }: ThemedTextProps) {
  const theme = useTheme();

  return (
    <Text
      style={[
        { color: theme[themeColor ?? 'foreground'] },
        type === 'default' && styles.default,
        type === 'title' && styles.title,
        type === 'heading' && styles.heading,
        type === 'subtitle' && styles.subtitle,
        type === 'small' && styles.small,
        type === 'smallBold' && styles.smallBold,
        type === 'caption' && [styles.caption, { color: theme[themeColor ?? 'mutedForeground'] }],
        type === 'code' && styles.code,
        style,
      ]}
      {...rest}
    />
  );
}

const styles = StyleSheet.create({
  default: {
    fontSize: 16,
    lineHeight: 24,
  },
  title: {
    fontSize: 34,
    lineHeight: 40,
    fontWeight: 700,
    letterSpacing: -0.5,
  },
  heading: {
    fontSize: 24,
    lineHeight: 30,
    fontWeight: 700,
    letterSpacing: -0.3,
  },
  subtitle: {
    fontSize: 18,
    lineHeight: 24,
    fontWeight: 600,
  },
  small: {
    fontSize: 14,
    lineHeight: 20,
  },
  smallBold: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: 600,
  },
  caption: {
    fontSize: 13,
    lineHeight: 18,
  },
  code: {
    fontFamily: Fonts.mono,
    fontSize: 13,
  },
});
