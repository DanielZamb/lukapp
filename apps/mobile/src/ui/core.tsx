import Ionicons from "@expo/vector-icons/Ionicons";
import type { ComponentProps, PropsWithChildren } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
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
    fontSize: fontSize.body,
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
        <Text accessibilityRole="header" style={[ui.title, titleStyle]}>
          {title}
        </Text>
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
function Button({
  label,
  onPress,
  disabled,
  accessibilityLabel,
  primary,
  trailingIcon,
}: ButtonProps & { primary: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        {
          backgroundColor: primary ? theme.primary : theme.secondary,
          opacity: disabled ? 0.45 : pressed ? 0.75 : 1,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
        },
      ]}
    >
      <Text
        style={{
          fontFamily: font.bold,
          fontSize: fontSize.action,
          color: primary ? theme.primaryForeground : theme.secondaryForeground,
        }}
      >
        {label}
      </Text>
      {trailingIcon && (
        <Ionicons
          name={trailingIcon}
          size={24}
          color={primary ? theme.primaryForeground : theme.secondaryForeground}
        />
      )}
    </Pressable>
  );
}
export function PrimaryButton(props: ButtonProps) {
  return <Button {...props} primary />;
}
export function SecondaryButton(props: ButtonProps) {
  return <Button {...props} primary={false} />;
}

export function ListGroup({ children }: PropsWithChildren) {
  return <View style={styles.group}>{children}</View>;
}
export function ListRow({
  title,
  detail,
  value,
  onPress,
  titleStyle,
  valueStyle,
}: {
  title: string;
  detail?: string;
  value?: string;
  onPress?: () => void;
  titleStyle?: StyleProp<TextStyle>;
  valueStyle?: StyleProp<TextStyle>;
}) {
  const content = (
    <>
      <View style={{ flex: 1, gap: spacing.xs }}>
        <Text style={[ui.body, titleStyle]}>{title}</Text>
        {detail && <Text style={ui.muted}>{detail}</Text>}
      </View>
      {value && <Text style={[ui.body, valueStyle]}>{value}</Text>}
      {onPress && <Text style={ui.muted}>›</Text>}
    </>
  );
  return onPress ? (
    <Pressable accessibilityRole="button" onPress={onPress} style={styles.row}>
      {content}
    </Pressable>
  ) : (
    <View style={styles.row}>{content}</View>
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
        { borderColor: selected ? theme.primary : theme.border },
      ]}
    >
      <View style={{ flex: 1 }}>
        <Text style={ui.title}>{label}</Text>
        {detail && <Text style={ui.muted}>{detail}</Text>}
      </View>
      <Text style={{ color: selected ? theme.primary : theme.mutedForeground }}>
        {selected ? "●" : "○"}
      </Text>
    </Pressable>
  );
}
export function ActionTile({
  title,
  detail,
  primary,
  onPress,
  icon,
}: {
  title: string;
  detail: string;
  primary?: boolean;
  onPress?: () => void;
  icon: ComponentProps<typeof Ionicons>["name"];
}) {
  const color = primary ? theme.primaryForeground : theme.foreground;
  const content = (
    <>
      <Ionicons name={icon} size={28} color={color} />
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
  return onPress ? (
    <Pressable accessibilityRole="button" onPress={onPress} style={style}>
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
}: {
  title: string;
  detail: string;
  onContinue: () => void;
}) {
  return (
    <Screen>
      <View style={{ flex: 1, justifyContent: "center", gap: spacing.xxl }}>
        <Text style={ui.hero}>{title}</Text>
        <Text style={ui.body}>{detail}</Text>
        <PrimaryButton label="Continue" onPress={onContinue} />
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
  button: {
    minHeight: touchTarget,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    justifyContent: "center",
  },
  group: {
    backgroundColor: theme.secondary,
    borderRadius: radius.xl,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: theme.border,
  },
  row: {
    minHeight: 64,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    padding: spacing.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.border,
  },
  choice: {
    minHeight: touchTarget,
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 2,
    borderRadius: radius.full,
    padding: spacing.lg,
    gap: spacing.md,
  },
  tile: {
    width: "47%",
    minHeight: 156,
    justifyContent: "flex-end",
    padding: spacing.lg,
    borderRadius: radius.xl,
    gap: spacing.sm,
  },
  track: {
    height: 6,
    borderRadius: radius.full,
    backgroundColor: theme.border,
    overflow: "hidden",
  },
});
