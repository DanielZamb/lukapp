import Ionicons from "@expo/vector-icons/Ionicons";
import type { ComponentProps, ComponentType, PropsWithChildren } from "react";
import {
  Children,
  cloneElement,
  isValidElement,
} from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  ActivityIndicator,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { font, fontSize, radius, spacing, themes, touchTarget } from "./tokens";

export const theme = themes.light;
export const ui = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.background },
  content: { padding: spacing.xxl, gap: spacing.xxl, flexGrow: 1 },
  title: {
    fontFamily: font.bold,
    fontSize: fontSize.title,
    color: theme.foreground,
  },
  body: {
    fontFamily: font.regular,
    fontSize: fontSize.body,
    color: theme.foreground,
  },
  muted: {
    fontFamily: font.regular,
    fontSize: fontSize.body,
    color: theme.mutedForeground,
  },
  label: {
    fontFamily: font.bold,
    fontSize: fontSize.label,
    color: theme.mutedForeground,
    letterSpacing: 1,
  },
  hero: {
    fontFamily: font.extrabold,
    fontSize: fontSize.hero,
    lineHeight: 52,
    color: theme.foreground,
  },
  input: {
    minHeight: touchTarget,
    fontFamily: font.regular,
    fontSize: fontSize.body,
    color: theme.foreground,
  },
  error: {
    fontFamily: font.regular,
    fontSize: fontSize.label,
    color: theme.danger,
  },
  section: { gap: spacing.md },
});

export function Screen({
  children,
  contentStyle,
}: PropsWithChildren<{ contentStyle?: StyleProp<ViewStyle> }>) {
  return (
    <SafeAreaView style={ui.screen}>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[ui.content, contentStyle]}
      >
        {children}
      </ScrollView>
    </SafeAreaView>
  );
}

export function Header({
  title,
  eyebrow,
  onBack,
  onUser,
  titleStyle,
}: {
  title: string;
  eyebrow?: string;
  onBack?: () => void;
  onUser?: () => void;
  titleStyle?: StyleProp<TextStyle>;
}) {
  return (
    <View style={styles.header}>
      {onBack && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back"
          onPress={onBack}
          style={styles.icon}
        >
          <Ionicons name="chevron-back" size={24} color={theme.foreground} />
        </Pressable>
      )}
      <View style={{ flex: 1 }}>
        {eyebrow && <Text style={ui.label}>{eyebrow}</Text>}
        {title ? (
          <Text accessibilityRole="header" style={[styles.headerTitle, titleStyle]}>
            {title}
          </Text>
        ) : null}
      </View>
      {onUser && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Your profile"
          onPress={onUser}
          style={styles.icon}
        >
          <Ionicons name="person-outline" size={24} color={theme.foreground} />
        </Pressable>
      )}
    </View>
  );
}

type ButtonProps = {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  accessibilityLabel?: string;
  trailingIcon?: ComponentProps<typeof Ionicons>["name"];
};

export function PrimaryButton({
  label,
  onPress,
  disabled,
  pending,
  accessibilityLabel,
  trailingIcon = "arrow-forward",
}: ButtonProps & { pending?: boolean }) {
  const inactive = disabled || pending;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: !!inactive, busy: !!pending }}
      disabled={inactive}
      onPress={onPress}
      style={({ pressed }) => [
        styles.primaryButton,
        inactive && styles.buttonDisabled,
        pressed && !inactive && styles.buttonPressed,
      ]}
    >
      <Text style={styles.primaryButtonLabel}>{label}</Text>
      {pending ? (
        <ActivityIndicator color={theme.primaryForeground} />
      ) : (
        <Ionicons name={trailingIcon} size={24} color={theme.primaryForeground} />
      )}
    </Pressable>
  );
}

export function SecondaryButton({
  label,
  onPress,
  disabled,
  accessibilityLabel,
}: ButtonProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.secondaryButton,
        disabled && styles.buttonDisabled,
        pressed && !disabled && styles.buttonPressed,
      ]}
    >
      <Text style={styles.secondaryButtonLabel}>{label}</Text>
    </Pressable>
  );
}

type FieldProps = {
  label: string;
  helperText?: string;
  error?: string;
  invalid?: boolean;
  InputComponent?: ComponentType<ComponentProps<typeof TextInput>>;
} & ComponentProps<typeof TextInput>;

export function Field({
  label,
  helperText,
  error,
  invalid,
  InputComponent = TextInput,
  style,
  ...inputProps
}: FieldProps) {
  const showError = invalid || !!error;
  const hint = error ?? helperText;
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <InputComponent
        style={[
          styles.fieldInput,
          showError && styles.fieldInputInvalid,
          style,
        ]}
        placeholderTextColor={theme.mutedForeground}
        cursorColor={theme.primary}
        selectionColor={theme.primary}
        {...inputProps}
      />
      {hint ? (
        <Text
          accessibilityRole={error ? "alert" : undefined}
          style={error ? ui.error : styles.fieldHelper}
        >
          {hint}
        </Text>
      ) : null}
    </View>
  );
}

export function ListGroup({ children }: PropsWithChildren) {
  const items = Children.toArray(children).filter(Boolean);
  return (
    <View style={styles.group}>
      {items.map((child, index) =>
        isValidElement(child)
          ? cloneElement(child, { isLast: index === items.length - 1 } as ListRowProps)
          : child,
      )}
    </View>
  );
}

type ListRowProps = {
  title: string;
  icon?: ComponentProps<typeof Ionicons>["name"];
  detail?: string;
  value?: string;
  onPress?: () => void;
  titleStyle?: StyleProp<TextStyle>;
  valueStyle?: StyleProp<TextStyle>;
  isLast?: boolean;
};

export function ListRow({
  title,
  icon,
  detail,
  value,
  onPress,
  titleStyle,
  valueStyle,
  isLast,
}: ListRowProps) {
  const content = (
    <>
      {icon ? <Ionicons name={icon} size={22} color={theme.mutedForeground} /> : null}
      <View style={styles.rowCopy}>
        <Text style={[styles.rowTitle, titleStyle]}>{title}</Text>
        {detail ? <Text style={styles.rowDetail}>{detail}</Text> : null}
      </View>
      {value ? (
        <Text style={[styles.rowValue, valueStyle]}>{value}</Text>
      ) : null}
      {onPress ? (
        <Ionicons name="chevron-forward" size={20} color={theme.mutedForeground} />
      ) : null}
    </>
  );
  const rowStyle = [styles.row, isLast && styles.rowLast];
  return onPress ? (
    <Pressable accessibilityRole="button" onPress={onPress} style={rowStyle}>
      {content}
    </Pressable>
  ) : (
    <View style={rowStyle}>{content}</View>
  );
}

export function Choice({
  label,
  detail,
  selected,
  onPress,
}: {
  label: string;
  detail?: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
      onPress={onPress}
      style={[
        styles.choice,
        selected && styles.choiceSelected,
      ]}
    >
      <View style={styles.rowCopy}>
        <Text style={styles.rowTitle}>{label}</Text>
        {detail ? <Text style={styles.rowDetail}>{detail}</Text> : null}
      </View>
      <Ionicons
        name={selected ? "checkmark-circle" : "ellipse-outline"}
        size={24}
        color={selected ? theme.primary : theme.mutedForeground}
      />
    </Pressable>
  );
}

export function ActionTile({
  title,
  detail,
  primary,
  onPress,
  icon,
  count,
}: {
  title: string;
  detail: string;
  primary?: boolean;
  onPress?: () => void;
  icon: ComponentProps<typeof Ionicons>["name"];
  count?: number;
}) {
  const color = primary ? theme.primaryForeground : theme.foreground;
  const content = (
    <>
      <Ionicons name={icon} size={28} color={color} />
      {count !== undefined ? (
        <View
          style={[
            styles.tileBadge,
            { backgroundColor: primary ? theme.primaryForeground : theme.foreground },
          ]}
        >
          <Text
            style={{
              fontSize: fontSize.label,
              fontFamily: font.bold,
              color: primary ? theme.primary : theme.background,
            }}
          >
            {count}
          </Text>
        </View>
      ) : null}
      <View style={{ flex: 1 }} />
      <Text style={{ fontSize: fontSize.title, fontFamily: font.bold, color }}>
        {title}
      </Text>
      <Text
        style={{
          fontSize: fontSize.body,
          fontFamily: font.regular,
          color: primary ? theme.primaryForeground : theme.mutedForeground,
        }}
      >
        {detail}
      </Text>
    </>
  );
  const style = [
    styles.tile,
    { backgroundColor: primary ? theme.primary : theme.secondary },
  ];
  const accessibilityLabel =
    count === undefined ? `${title}, ${detail}` : `${title}, ${count}, ${detail}`;
  return onPress ? (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      style={style}
    >
      {content}
    </Pressable>
  ) : (
    <View style={style}>{content}</View>
  );
}

export function ProgressBar({
  value,
  label,
}: {
  value: number;
  label: string;
}) {
  const percent = Math.round(Math.min(1, Math.max(0, value)) * 100);
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      accessibilityValue={{ min: 0, max: 100, now: percent }}
      style={styles.track}
    >
      <View
        style={{
          height: 6,
          width: `${percent}%`,
          backgroundColor: theme.primary,
          borderRadius: radius.full,
        }}
      />
    </View>
  );
}

export function ConfirmationScreen({
  title,
  detail,
  onContinue,
  buttonLabel = "Continue",
}: {
  title: string;
  detail: string;
  onContinue: () => void;
  buttonLabel?: string;
}) {
  return (
    <Screen contentStyle={styles.confirmationContent}>
      <View style={styles.confirmation}>
        <View style={styles.confirmIcon}>
          <Ionicons name="checkmark" size={36} color={theme.primaryForeground} />
        </View>
        <Text style={styles.confirmTitle}>{title}</Text>
        <Text style={styles.confirmDetail}>{detail}</Text>
        <PrimaryButton label={buttonLabel} onPress={onContinue} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  icon: {
    width: touchTarget,
    height: touchTarget,
    borderRadius: radius.full,
    backgroundColor: theme.secondary,
    alignItems: "center",
    justifyContent: "center",
  },
  header: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  headerTitle: {
    fontFamily: font.extrabold,
    fontSize: 32,
    lineHeight: 37,
    letterSpacing: -0.7,
    color: theme.foreground,
  },
  buttonDisabled: { opacity: 0.45 },
  buttonPressed: { opacity: 0.72, transform: [{ scale: 0.985 }] },
  primaryButton: {
    minHeight: 56,
    borderRadius: radius.md,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: theme.primary,
  },
  primaryButtonLabel: {
    fontFamily: font.bold,
    fontSize: fontSize.action,
    color: theme.primaryForeground,
  },
  secondaryButton: {
    minHeight: touchTarget,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.background,
    borderWidth: 1,
    borderColor: theme.border,
  },
  secondaryButtonLabel: {
    fontFamily: font.semibold,
    fontSize: fontSize.body,
    color: theme.foreground,
    textAlign: "center",
  },
  field: { gap: spacing.sm },
  fieldLabel: {
    fontFamily: font.semibold,
    fontSize: 14,
    color: theme.foreground,
  },
  fieldInput: {
    minHeight: 56,
    width: "100%",
    borderWidth: 1,
    borderColor: theme.ring,
    backgroundColor: theme.secondary,
    color: theme.foreground,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    fontFamily: font.regular,
    fontSize: fontSize.body,
  },
  fieldInputInvalid: { borderColor: theme.danger },
  fieldHelper: {
    fontFamily: font.regular,
    fontSize: fontSize.label,
    color: theme.mutedForeground,
  },
  group: {
    backgroundColor: theme.secondary,
    borderRadius: radius.lg,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: theme.border,
  },
  row: {
    minHeight: 70,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.border,
  },
  rowLast: { borderBottomWidth: 0 },
  rowCopy: { flex: 1, gap: spacing.xs, minWidth: 0 },
  rowTitle: {
    fontFamily: font.semibold,
    fontSize: fontSize.body,
    lineHeight: 22,
    color: theme.foreground,
  },
  rowDetail: {
    fontFamily: font.regular,
    fontSize: 14,
    lineHeight: 20,
    color: theme.mutedForeground,
  },
  rowValue: {
    maxWidth: "42%",
    fontFamily: font.semibold,
    fontSize: 14,
    lineHeight: 20,
    color: theme.foreground,
    textAlign: "right",
  },
  choice: {
    minHeight: 76,
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: radius.md,
    padding: spacing.lg,
    gap: spacing.md,
    backgroundColor: theme.secondary,
  },
  choiceSelected: { borderWidth: 2, borderColor: theme.primary },
  tile: {
    width: "47%",
    minHeight: 156,
    justifyContent: "flex-end",
    padding: spacing.lg,
    borderRadius: radius.xl,
    gap: spacing.sm,
  },
  tileBadge: {
    position: "absolute",
    top: spacing.lg,
    right: spacing.lg,
    minWidth: 26,
    minHeight: 26,
    borderRadius: radius.full,
    paddingHorizontal: spacing.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  track: {
    height: 6,
    borderRadius: radius.full,
    backgroundColor: theme.border,
    overflow: "hidden",
  },
  confirmationContent: { flexGrow: 1, justifyContent: "center" },
  confirmation: {
    alignItems: "center",
    gap: spacing.xl,
  },
  confirmIcon: {
    width: 68,
    height: 68,
    borderRadius: radius.full,
    backgroundColor: theme.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  confirmTitle: {
    fontFamily: font.extrabold,
    fontSize: 30,
    lineHeight: 36,
    color: theme.foreground,
    textAlign: "center",
  },
  confirmDetail: {
    fontFamily: font.regular,
    fontSize: fontSize.body,
    lineHeight: 24,
    color: theme.mutedForeground,
    textAlign: "center",
  },
});
