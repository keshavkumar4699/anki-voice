// Small design system: calm surfaces with hairline borders, one accent colour,
// generous spacing. Screens compose these instead of styling from scratch.
import Feather from '@expo/vector-icons/Feather';
import type { ComponentProps, ReactNode } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing, type ThemeColor } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type IconName = ComponentProps<typeof Feather>['name'];

export function Icon({ name, size = 20, color = 'text' }: { name: IconName; size?: number; color?: ThemeColor }) {
  const theme = useTheme();
  return <Feather name={name} size={size} color={theme[color]} />;
}

/**
 * Page container. Tab screens have no navigation header, so they pad the top
 * safe area themselves (`topInset`); stack screens get it from the header.
 */
export function Screen({ children, scroll = true, topInset = false }: { children: ReactNode; scroll?: boolean; topInset?: boolean }) {
  const theme = useTheme();
  const body = <View style={styles.content}>{children}</View>;
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }} edges={topInset ? ['top', 'left', 'right'] : ['left', 'right']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {scroll ? (
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ flexGrow: 1 }}>
            {body}
          </ScrollView>
        ) : (
          body
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

export function ScreenTitle({ title, subtitle, right }: { title: string; subtitle?: string; right?: ReactNode }) {
  return (
    <View style={styles.titleRow}>
      <View style={{ flex: 1, gap: 2 }}>
        {subtitle ? (
          <ThemedText variant="caption" color="textTertiary">
            {subtitle}
          </ThemedText>
        ) : null}
        <ThemedText variant="title">{title}</ThemedText>
      </View>
      {right}
    </View>
  );
}

export function Surface({ children, style, muted }: { children: ReactNode; style?: StyleProp<ViewStyle>; muted?: boolean }) {
  const theme = useTheme();
  return (
    <View
      style={[
        styles.surface,
        muted ? { backgroundColor: theme.surfaceMuted, borderColor: 'transparent' } : { backgroundColor: theme.surface, borderColor: theme.border },
        style,
      ]}>
      {children}
    </View>
  );
}

export function Section({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <View style={{ gap: Spacing.two }}>
      <View style={styles.sectionHeader}>
        <ThemedText variant="caption" color="textTertiary">
          {title}
        </ThemedText>
        {action}
      </View>
      {children}
    </View>
  );
}

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

export function Button({
  title,
  icon,
  onPress,
  variant = 'secondary',
  size = 'md',
  disabled,
  style,
}: {
  title: string;
  icon?: IconName;
  onPress: () => void;
  variant?: ButtonVariant;
  size?: 'md' | 'lg';
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const theme = useTheme();
  const palette: Record<ButtonVariant, { bg: string; fg: ThemeColor; border: string }> = {
    primary: { bg: theme.accent, fg: 'onAccent', border: theme.accent },
    secondary: { bg: theme.surface, fg: 'text', border: theme.border },
    ghost: { bg: 'transparent', fg: 'accent', border: 'transparent' },
    danger: { bg: theme.dangerSoft, fg: 'danger', border: theme.dangerSoft },
  };
  const p = palette[variant];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ disabled }}
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.button,
        size === 'lg' && styles.buttonLg,
        { backgroundColor: p.bg, borderColor: p.border, opacity: disabled ? 0.4 : pressed ? 0.7 : 1 },
        style,
      ]}>
      {icon ? <Icon name={icon} size={size === 'lg' ? 20 : 17} color={p.fg} /> : null}
      <ThemedText variant={size === 'lg' ? 'bodyStrong' : 'smallStrong'} color={p.fg}>
        {title}
      </ThemedText>
    </Pressable>
  );
}

export function IconButton({
  icon,
  label,
  onPress,
  active,
  disabled,
  size = 44,
}: {
  icon: IconName;
  label: string;
  onPress: () => void;
  active?: boolean;
  disabled?: boolean;
  size?: number;
}) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      disabled={disabled}
      hitSlop={6}
      style={({ pressed }) => ({
        width: size,
        height: size,
        borderRadius: size / 2,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: active ? theme.accent : theme.surfaceMuted,
        opacity: disabled ? 0.4 : pressed ? 0.7 : 1,
      })}>
      <Icon name={icon} size={size * 0.42} color={active ? 'onAccent' : 'text'} />
    </Pressable>
  );
}

export function ListRow({
  title,
  subtitle,
  right,
  onPress,
  first,
}: {
  title: string;
  subtitle?: string;
  right?: ReactNode;
  onPress?: () => void;
  first?: boolean;
}) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      style={({ pressed }) => [styles.row, !first && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.border }, pressed && { opacity: 0.6 }]}>
      <View style={{ flex: 1, gap: 2 }}>
        <ThemedText numberOfLines={2}>{title}</ThemedText>
        {subtitle ? (
          <ThemedText variant="small" color="textSecondary" numberOfLines={2}>
            {subtitle}
          </ThemedText>
        ) : null}
      </View>
      {right}
      {onPress && !right ? <Icon name="chevron-right" size={18} color="textTertiary" /> : null}
    </Pressable>
  );
}

export function Chip({ label, selected, onPress, icon }: { label: string; selected?: boolean; onPress: () => void; icon?: IconName }) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        { backgroundColor: selected ? theme.accentSoft : theme.surface, borderColor: selected ? theme.accentSoft : theme.border, opacity: pressed ? 0.7 : 1 },
      ]}>
      {icon ? <Icon name={icon} size={14} color={selected ? 'accent' : 'textSecondary'} /> : null}
      <ThemedText variant="smallStrong" color={selected ? 'accent' : 'textSecondary'}>
        {label}
      </ThemedText>
    </Pressable>
  );
}

export function ChipRow({ children }: { children: ReactNode }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: Spacing.two }} keyboardShouldPersistTaps="handled">
      {children}
    </ScrollView>
  );
}

export function Segmented<T extends string>({ value, options, onChange }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  const theme = useTheme();
  return (
    <View style={[styles.segmented, { backgroundColor: theme.surfaceMuted }]}>
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            onPress={() => onChange(o.value)}
            style={[styles.segment, selected && { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <ThemedText variant="smallStrong" color={selected ? 'text' : 'textSecondary'}>
              {o.label}
            </ThemedText>
          </Pressable>
        );
      })}
    </View>
  );
}

export function Field(props: TextInputProps & { label: string; right?: ReactNode }) {
  const theme = useTheme();
  const { label, right, style, ...rest } = props;
  return (
    <View style={{ gap: Spacing.one }}>
      <ThemedText variant="caption" color="textTertiary">
        {label}
      </ThemedText>
      <View style={[styles.field, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <TextInput placeholderTextColor={theme.textTertiary} style={[styles.input, { color: theme.text }, style]} {...rest} />
        {right ? <View style={{ paddingTop: 6, paddingRight: 6 }}>{right}</View> : null}
      </View>
    </View>
  );
}

export function SearchField({ value, onChangeText, placeholder }: { value: string; onChangeText: (t: string) => void; placeholder: string }) {
  const theme = useTheme();
  return (
    <View style={[styles.search, { backgroundColor: theme.surfaceMuted }]}>
      <Icon name="search" size={16} color="textTertiary" />
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={theme.textTertiary}
        style={{ flex: 1, color: theme.text, fontSize: 15, paddingVertical: 10 }}
        returnKeyType="search"
      />
      {value ? <IconButton icon="x" label="Clear search" size={28} onPress={() => onChangeText('')} /> : null}
    </View>
  );
}

/** A labelled number with − / + controls. */
export function Stepper({
  label,
  hint,
  value,
  step,
  min,
  max,
  format = String,
  onChange,
  first,
}: {
  label: string;
  hint?: string;
  value: number;
  step: number;
  min: number;
  max: number;
  format?: (v: number) => string;
  onChange: (v: number) => void;
  first?: boolean;
}) {
  const theme = useTheme();
  const clamp = (v: number) => Math.min(max, Math.max(min, Math.round(v * 100) / 100));
  return (
    <View style={[styles.settingRow, !first && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.border }]}>
      <View style={{ flex: 1, gap: 2 }}>
        <ThemedText>{label}</ThemedText>
        {hint ? (
          <ThemedText variant="small" color="textSecondary">
            {hint}
          </ThemedText>
        ) : null}
      </View>
      <IconButton icon="minus" label={`Decrease ${label}`} size={34} disabled={value <= min} onPress={() => onChange(clamp(value - step))} />
      <ThemedText variant="smallStrong" style={{ minWidth: 52, textAlign: 'center' }}>
        {format(value)}
      </ThemedText>
      <IconButton icon="plus" label={`Increase ${label}`} size={34} disabled={value >= max} onPress={() => onChange(clamp(value + step))} />
    </View>
  );
}

export function Toggle({ label, hint, value, onChange, first }: { label: string; hint?: string; value: boolean; onChange: (v: boolean) => void; first?: boolean }) {
  const theme = useTheme();
  return (
    <View style={[styles.settingRow, !first && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.border }]}>
      <View style={{ flex: 1, gap: 2 }}>
        <ThemedText>{label}</ThemedText>
        {hint ? (
          <ThemedText variant="small" color="textSecondary">
            {hint}
          </ThemedText>
        ) : null}
      </View>
      <Switch value={value} onValueChange={onChange} trackColor={{ true: theme.accent, false: theme.border }} thumbColor={theme.surface} />
    </View>
  );
}

/** Single choice with a description under each option. */
export function RadioList<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: string; description?: string }[];
  onChange: (v: T) => void;
}) {
  const theme = useTheme();
  return (
    <View>
      {options.map((o, i) => {
        const selected = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            onPress={() => onChange(o.value)}
            style={[styles.radioRow, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.border }]}>
            <View style={[styles.radio, { borderColor: selected ? theme.accent : theme.textTertiary }]}>
              {selected ? <View style={[styles.radioDot, { backgroundColor: theme.accent }]} /> : null}
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <ThemedText>{o.label}</ThemedText>
              {o.description ? (
                <ThemedText variant="small" color="textSecondary">
                  {o.description}
                </ThemedText>
              ) : null}
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

export function ProgressBar({ value, color = 'accent', height = 4 }: { value: number; color?: ThemeColor; height?: number }) {
  const theme = useTheme();
  return (
    <View style={{ height, borderRadius: height, backgroundColor: theme.surfaceMuted, overflow: 'hidden' }}>
      <View style={{ width: `${Math.round(Math.min(1, Math.max(0, value)) * 100)}%`, height, backgroundColor: theme[color] }} />
    </View>
  );
}

export function Stat({ value, label }: { value: string; label: string }) {
  return (
    <View style={{ flex: 1, gap: 2 }}>
      <ThemedText variant="heading">{value}</ThemedText>
      <ThemedText variant="small" color="textSecondary">
        {label}
      </ThemedText>
    </View>
  );
}

export function EmptyState({ icon, title, body, action }: { icon: IconName; title: string; body: string; action?: ReactNode }) {
  const theme = useTheme();
  return (
    <View style={styles.empty}>
      <View style={[styles.emptyIcon, { backgroundColor: theme.surfaceMuted }]}>
        <Icon name={icon} size={24} color="textSecondary" />
      </View>
      <ThemedText variant="heading" style={{ textAlign: 'center' }}>
        {title}
      </ThemedText>
      <ThemedText color="textSecondary" style={{ textAlign: 'center', maxWidth: 320 }}>
        {body}
      </ThemedText>
      {action}
    </View>
  );
}

const styles = StyleSheet.create({
  content: { flexGrow: 1, paddingHorizontal: 20, paddingTop: Spacing.three, paddingBottom: 48, gap: Spacing.four },
  titleRow: { flexDirection: 'row', alignItems: 'flex-end', gap: Spacing.two, paddingTop: Spacing.two },
  surface: { borderRadius: Radius.lg, borderWidth: StyleSheet.hairlineWidth, padding: Spacing.three, gap: Spacing.two },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 20 },
  button: {
    flexDirection: 'row',
    gap: Spacing.two,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 11,
    paddingHorizontal: 16,
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    minHeight: 44,
  },
  buttonLg: { paddingVertical: 16, borderRadius: Radius.lg, minHeight: 56 },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, paddingVertical: 14 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: Radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
  },
  segmented: { flexDirection: 'row', borderRadius: Radius.md, padding: 3 },
  segment: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 8,
    borderRadius: Radius.md - 3,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'transparent',
  },
  field: { flexDirection: 'row', borderRadius: Radius.md, borderWidth: StyleSheet.hairlineWidth },
  input: { flex: 1, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16, lineHeight: 22, minHeight: 48, textAlignVertical: 'top' },
  search: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, borderRadius: Radius.md, paddingLeft: 12, paddingRight: 6 },
  settingRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, paddingVertical: 12 },
  radioRow: { flexDirection: 'row', gap: Spacing.three, paddingVertical: 12, alignItems: 'flex-start' },
  radio: { width: 20, height: 20, borderRadius: 10, borderWidth: 1.5, marginTop: 2, alignItems: 'center', justifyContent: 'center' },
  radioDot: { width: 10, height: 10, borderRadius: 5 },
  empty: { alignItems: 'center', gap: Spacing.two, paddingVertical: Spacing.five },
  emptyIcon: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', marginBottom: Spacing.two },
});
