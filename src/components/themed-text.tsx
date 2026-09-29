import { StyleSheet, Text, type TextProps } from 'react-native';

import type { ThemeColor } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type TextVariant = 'display' | 'title' | 'heading' | 'body' | 'bodyStrong' | 'small' | 'smallStrong' | 'caption';

export type ThemedTextProps = TextProps & {
  variant?: TextVariant;
  color?: ThemeColor;
};

export function ThemedText({ style, variant = 'body', color = 'text', ...rest }: ThemedTextProps) {
  const theme = useTheme();
  return <Text style={[styles[variant], { color: theme[color] }, style]} {...rest} />;
}

const styles = StyleSheet.create({
  display: { fontSize: 40, lineHeight: 46, fontWeight: 300, letterSpacing: -0.5 },
  title: { fontSize: 28, lineHeight: 34, fontWeight: 600, letterSpacing: -0.3 },
  heading: { fontSize: 19, lineHeight: 26, fontWeight: 600 },
  body: { fontSize: 16, lineHeight: 24, fontWeight: 400 },
  bodyStrong: { fontSize: 16, lineHeight: 24, fontWeight: 600 },
  small: { fontSize: 14, lineHeight: 20, fontWeight: 400 },
  smallStrong: { fontSize: 14, lineHeight: 20, fontWeight: 600 },
  caption: { fontSize: 12, lineHeight: 16, fontWeight: 600, letterSpacing: 0.8, textTransform: 'uppercase' },
});
