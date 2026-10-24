import Ionicons from "@expo/vector-icons/Ionicons";
import type {
  ComponentProps,
  ComponentType,
  PropsWithChildren,
  ReactNode,
} from "react";
import {
  Children,
  Fragment,
  createContext,
  useContext,
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
  KeyboardAvoidingView,
  Platform,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { font, fontSize, radius, spacing, themes, xxxl } from "./tokens";
import { useThemeContext } from "./themeContext";
import { Text as StyledText } from "./Text";
import { textSpecs, textStyle, textTone, type TextTone } from "./typography";
export { SheetAccessibilityBoundary } from "./SheetAccessibility";
export { Text, type TextProps } from "./Text";
export { type TextVariant, type TextTone } from "./typography";

export {
  ThemeProvider,
  ResponsiveThemeProvider,
  useTheme,
  useThemeMode,
  useSetThemeMode,
  useUi,
  useTier,
  useControls,
  useReadableLayout,
} from "./themeContext";

/** Static light theme for tests that assert palette values without a provider. */
export const theme = themes.light;

function useCore() {
  return useThemeContext();
}

export function Screen({
  children,
  contentStyle,
  footer,
}: PropsWithChildren<{
  contentStyle?: StyleProp<ViewStyle>;
  footer?: ReactNode;
}>) {
  const { ui } = useCore();
  return (
    <KeyboardAvoidingView style={ui.screen} behavior="height" enabled={Platform.OS !== "android"}>
      <SafeAreaView style={ui.screen}>
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={[ui.content, contentStyle]}
        >
          {children}
        </ScrollView>
        {footer}
      </SafeAreaView>
    </KeyboardAvoidingView>
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
  const { theme, ui, styles, layout } = useCore();
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
      <View style={{ flex: 1, minWidth: 0 }}>
        {eyebrow && <Text style={ui.label}>{eyebrow}</Text>}
        {title ? (
          <Text maxFontSizeMultiplier={textSpecs[layout.tier].screen.maxScale} accessibilityRole="header" style={[styles.headerTitle, titleStyle]}>
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
  const { theme, styles, layout } = useCore();
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
      <Text maxFontSizeMultiplier={textSpecs[layout.tier].action.maxScale} style={styles.primaryButtonLabel}>{label}</Text>
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
  tone,
}: ButtonProps & { tone?: "danger" }) {
  const { styles, layout } = useCore();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.secondaryButton,
        tone === "danger" && styles.secondaryButtonDanger,
        disabled && styles.buttonDisabled,
        pressed && !disabled && styles.buttonPressed,
      ]}
    >
      <Text maxFontSizeMultiplier={textSpecs[layout.tier].action.maxScale} style={[styles.secondaryButtonLabel, tone === "danger" && styles.secondaryButtonLabelDanger]}>{label}</Text>
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

function groupChildren(children: ReactNode, prefix = ""): ReactNode[] {
  return Children.toArray(children).flatMap((child, index) => {
    if (isValidElement<PropsWithChildren>(child) && child.type === Fragment) {
      return groupChildren(child.props.children, `${prefix}${child.key ?? index}/`);
    }
    return isValidElement(child) ? [cloneElement(child, { key: `${prefix}${child.key ?? index}` })] : [child];
  });
}

export function Group({ children, title }: PropsWithChildren<{ title?: string }>) {
  const { styles, layout } = useCore();
  const items = Children.toArray(children).filter(Boolean);
  const renderItems = (rows: ReactNode[]) => rows.map((child, index) =>
    isValidElement<{ isLast?: boolean }>(child)
      ? cloneElement(child, { isLast: index === rows.length - 1 })
      : child);
  if (layout.tier !== "xxxl") {
    const card = <View style={styles.group}>{renderItems(items)}</View>;
    return title ? <View style={{ gap: spacing.md }}><StyledText variant="section" accessibilityRole="header">{title}</StyledText>{card}</View> : card;
  }
  const rows = groupChildren(children);
  const chunks: ReactNode[][] = [];
  for (let index = 0; index < rows.length; index += 2) chunks.push(rows.slice(index, index + 2));
  return <View style={{ gap: xxxl.spacing.betweenGroups }}>
    {title ? <StyledText variant="section" accessibilityRole="header">{title}</StyledText> : null}
    {chunks.map((chunk, index) => <View key={index} style={styles.group}>{renderItems(chunk)}</View>)}
  </View>;
}

export const ListGroup = Group;

export type ValueRowProps = {
  title: string;
  value?: string;
  onPress?: () => void;
  icon?: ComponentProps<typeof Ionicons>["name"];
  leading?: ReactNode;
  titleStyle?: StyleProp<TextStyle>;
  valueStyle?: StyleProp<TextStyle>;
  tone?: TextTone;
  accessibilityLabel?: string;
  isLast?: boolean;
} & ({ meta?: string; detail?: never } | { detail?: string; meta?: never });

export function ValueRow({
  title, meta, detail, value, onPress, icon, leading, titleStyle, valueStyle, tone, accessibilityLabel, isLast,
}: ValueRowProps) {
  const { theme, styles, layout } = useCore();
  const large = layout.tier === "xxxl";
  const description = meta ?? detail;
  const color = tone ? textTone(theme, tone) : theme.foreground;
  const content = (
    <>
      {leading ?? (icon && (
        <View style={styles.rowIcon}>
          <Ionicons name={icon} size={20} color={color} />
        </View>
      ))}
      <View style={styles.rowContent}>
        <View style={styles.rowCopy}>
          {large ? <StyledText variant="rowTitle" style={titleStyle}>{title}</StyledText> : <Text style={[styles.rowTitle, titleStyle]}>{title}</Text>}
          {description ? large ? <StyledText variant="meta" tone="muted">{description}</StyledText> : <Text style={styles.rowDetail}>{description}</Text> : null}
        </View>
        {value ? large ? (
          <StyledText variant="money" tone={tone} style={valueStyle}>{value}</StyledText>
        ) : (
          <Text style={[styles.rowValue, tone && { color }, valueStyle]}>{value}</Text>
        ) : null}
      </View>
      {onPress ? <Ionicons name="chevron-forward" size={20} color={theme.mutedForeground} /> : null}
      {large && !isLast ? <View pointerEvents="none" style={styles.rowDivider} /> : null}
    </>
  );
  const rowStyle = [styles.row, isLast && styles.rowLast];
  return onPress ? (
    <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel} onPress={onPress} style={rowStyle}>{content}</Pressable>
  ) : (
    <View accessibilityLabel={accessibilityLabel} style={rowStyle}>{content}</View>
  );
}

export const ListRow = ValueRow;

const ColumnsContext = createContext(false);

export function Columns({ children }: PropsWithChildren) {
  const { layout } = useCore();
  return <ColumnsContext.Provider value={true}>
    <View style={{ flexDirection: layout.tier === "default" ? "row" : "column", flexWrap: "wrap", justifyContent: "space-between", gap: spacing.lg }}>
      {Children.toArray(children).map((child, index) => <View key={index} style={{ width: layout.tier === "default" ? "47%" : "100%" }}>{child}</View>)}
    </View>
  </ColumnsContext.Provider>;
}

export function MoneyHero({ currency, amount, negative = false, style }: {
  currency: string; amount: string; negative?: boolean; style?: StyleProp<TextStyle>;
}) {
  const { ui, layout } = useCore();
  const signedAmount = `${negative ? "−" : ""}${amount}`;
  const label = `${negative ? "−" : ""}${currency} ${amount}`;
  if (layout.tier !== "xxxl") return <Text accessibilityLabel={label} style={[ui.hero, style]} adjustsFontSizeToFit numberOfLines={1}>{label}</Text>;
  return <View accessible accessibilityLabel={label} style={{ gap: xxxl.spacing.insideRow }}>
    <StyledText accessible={false} variant="label">{currency}</StyledText>
    <StyledText accessible={false} variant="hero" style={style}>{signedAmount}</StyledText>
  </View>;
}

export function Choice({
  label,
  detail,
  selected,
  onPress,
  disabled = false,
}: {
  label: string;
  detail?: string;
  selected: boolean;
  onPress: () => void;
  disabled?: boolean;
}) {
  const { theme, styles, layout } = useCore();
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityLabel={label}
      accessibilityState={{ checked: selected, disabled }}
      disabled={disabled}
      onPress={onPress}
      style={[
        styles.choice,
        selected && styles.choiceSelected,
        disabled && styles.buttonDisabled,
      ]}
    >
      <View style={styles.rowCopy}>
        <Text maxFontSizeMultiplier={textSpecs[layout.tier].rowTitle.maxScale} style={styles.rowTitle}>{label}</Text>
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
  const { theme, styles, layout } = useCore();
  const inColumns = useContext(ColumnsContext);
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
              ...(layout.tier === "xxxl" && textStyle(layout.tier, "label")),
            }}
          >
            {count}
          </Text>
        </View>
      ) : null}
      <View style={{ flex: 1 }} />
      <Text maxFontSizeMultiplier={textSpecs[layout.tier].section.maxScale} style={{ fontSize: fontSize.title, fontFamily: font.bold, color, ...(layout.tier === "xxxl" && textStyle(layout.tier, "section")) }}>
        {title}
      </Text>
      <Text
        style={{
          fontSize: fontSize.body,
          fontFamily: font.regular,
          color: primary ? theme.primaryForeground : theme.mutedForeground,
          ...(layout.tier === "xxxl" && textStyle(layout.tier, "body")),
        }}
      >
        {detail}
      </Text>
    </>
  );
  const style = [
    styles.tile,
    ...(inColumns ? [{ width: "100%" } satisfies ViewStyle] : []),
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
