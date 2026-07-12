import { type ReactNode } from 'react';
import { Pressable, StyleSheet, Switch, TextInput, View } from 'react-native';

import { Chip } from './chip';
import { ThemedText } from './themed-text';

import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export function FieldLabel({ children }: { children: ReactNode }) {
  return (
    <ThemedText type="smallBold" themeColor="textSecondary" style={styles.label}>
      {children}
    </ThemedText>
  );
}

export function TextField({
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType,
  autoCapitalize = 'sentences',
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  keyboardType?: 'default' | 'decimal-pad' | 'number-pad';
  autoCapitalize?: 'none' | 'sentences' | 'words';
}) {
  const theme = useTheme();
  return (
    <View style={styles.field}>
      <FieldLabel>{label}</FieldLabel>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={theme.textSecondary}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize}
        style={[
          styles.input,
          {
            backgroundColor: theme.backgroundElement,
            color: theme.text,
            borderColor: theme.border,
          },
        ]}
      />
    </View>
  );
}

export function ChipsField<T extends string>({
  label,
  options,
  value,
  onChange,
  labels,
}: {
  label: string;
  options: readonly T[];
  value: T;
  onChange: (v: T) => void;
  labels?: Partial<Record<T, string>>;
}) {
  return (
    <View style={styles.field}>
      <FieldLabel>{label}</FieldLabel>
      <View style={styles.chips}>
        {options.map((opt) => (
          <Chip
            key={opt}
            label={labels?.[opt] ?? opt}
            selected={value === opt}
            onPress={() => onChange(opt)}
          />
        ))}
      </View>
    </View>
  );
}

export function SwitchField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  const theme = useTheme();
  return (
    <View style={[styles.field, styles.switchRow]}>
      <ThemedText>{label}</ThemedText>
      <Switch value={value} onValueChange={onChange} trackColor={{ true: theme.accent }} />
    </View>
  );
}

export function Stepper({
  label,
  value,
  onChange,
  min = 1,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
}) {
  const theme = useTheme();
  return (
    <View style={[styles.field, styles.switchRow]}>
      <ThemedText>{label}</ThemedText>
      <View style={styles.stepper}>
        <Pressable onPress={() => onChange(Math.max(min, value - 1))} hitSlop={10}>
          <ThemedText type="subtitle" style={{ color: theme.accent, lineHeight: 32 }}>
            −
          </ThemedText>
        </Pressable>
        <ThemedText type="smallBold" style={styles.stepperValue}>
          {value}
        </ThemedText>
        <Pressable onPress={() => onChange(value + 1)} hitSlop={10}>
          <ThemedText type="subtitle" style={{ color: theme.accent, lineHeight: 32 }}>
            +
          </ThemedText>
        </Pressable>
      </View>
    </View>
  );
}

export function PrimaryButton({
  label,
  onPress,
  disabled,
  destructive,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  destructive?: boolean;
}) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.button,
        {
          backgroundColor: destructive ? 'transparent' : theme.accent,
          borderColor: destructive ? theme.negative : 'transparent',
          borderWidth: destructive ? StyleSheet.hairlineWidth * 2 : 0,
        },
        (pressed || disabled) && { opacity: 0.6 },
      ]}>
      <ThemedText type="smallBold" style={{ color: destructive ? theme.negative : '#14100A' }}>
        {label}
      </ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  field: { gap: 6 },
  label: { textTransform: 'uppercase', fontSize: 12, letterSpacing: 0.6 },
  input: {
    height: 44,
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: Spacing.three,
    fontSize: 16,
  },
  chips: { flexDirection: 'row', gap: Spacing.two, flexWrap: 'wrap' },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: Spacing.four },
  stepperValue: { minWidth: 28, textAlign: 'center', fontSize: 18 },
  button: {
    alignItems: 'center',
    paddingVertical: Spacing.three,
    borderRadius: Radius.md,
  },
});
