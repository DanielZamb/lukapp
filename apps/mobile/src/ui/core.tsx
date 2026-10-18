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
import { useThemeContext } from "./themeContext";

export {
  ThemeProvider,
  useTheme,
  useThemeMode,
  useSetThemeMode,
  useUi,
} from "./themeContext";

/** Static light theme for tests that assert palette values without a provider. */
export const theme = themes.light;

function useCore() {
  return useThemeContext();
}

export function Screen({
  children,
  contentStyle,
}: PropsWithChildren<{ contentStyle?: StyleProp<ViewStyle> }>) {
  const { ui } = useCore();
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
  const { theme, ui, styles } = useCore();
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
  const { theme, styles } = useCore();
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
  const { styles } = useCore();
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
  const { theme, ui, styles } = useCore();
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
  const { styles } = useCore();
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
  detail?: string;
  value?: string;
  onPress?: () => void;
  icon?: ComponentProps<typeof Ionicons>["name"];
  titleStyle?: StyleProp<TextStyle>;
  valueStyle?: StyleProp<TextStyle>;
  isLast?: boolean;
};

export function ListRow({
  title,
  detail,
  value,
  onPress,
  icon,
  titleStyle,
  valueStyle,
  isLast,
}: ListRowProps) {
  const { theme, styles } = useCore();
  const content = (
    <>
      {icon ? (
        <View style={styles.rowIcon}>
          <Ionicons name={icon} size={20} color={theme.foreground} />
        </View>
      ) : null}
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
  const { theme, styles } = useCore();
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

export function AppearanceToggle() {
  const { theme, styles, mode, setMode } = useCore();
  return (
    <View style={styles.segmented}>
      <Pressable
        accessibilityRole="radio"
        accessibilityState={{ selected: mode === "light" }}
        onPress={() => setMode("light")}
        style={[styles.segment, mode === "light" && styles.segmentSelected]}
      >
        <Ionicons name="sunny-outline" size={20} color={theme.foreground} />
        <Text style={styles.segmentText}>Light</Text>
      </Pressable>
      <Pressable
        accessibilityRole="radio"
        accessibilityState={{ selected: mode === "dark" }}
        onPress={() => setMode("dark")}
        style={[styles.segment, mode === "dark" && styles.segmentSelected]}
      >
        <Ionicons name="moon-outline" size={20} color={theme.foreground} />
        <Text style={styles.segmentText}>Dark</Text>
      </Pressable>
    </View>
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
  const { theme, styles } = useCore();
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
  const { theme, styles } = useCore();
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
  const { theme, styles } = useCore();
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
