import Ionicons from "@expo/vector-icons/Ionicons";
import type {
  ComponentProps,
  ComponentType,
  Ref,
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
import { TextInput as PresetTextInput } from "./TextInput";
import { EmojiTile, IconTile } from "./surfaces";
import { KeyboardFrame } from "./KeyboardFrame";
import { composeHandlers, mix } from "./design";
import { textSpecs, textStyle, textTone, type TextTone } from "./typography";
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
  scrollRef,
  scrollProps,
  onScroll,
}: PropsWithChildren<{
  contentStyle?: StyleProp<ViewStyle>;
  footer?: ReactNode;
  scrollRef?: Ref<ScrollView>;
  scrollProps?: Omit<ComponentProps<typeof ScrollView>, "children" | "ref">;
  onScroll?: ComponentProps<typeof ScrollView>["onScroll"];
}>) {
  const { ui, layout } = useCore();
  const content = (
      <SafeAreaView style={ui.screen}>
        <ScrollView
          {...(scrollRef && { ref: scrollRef })}
          {...scrollProps}
          {...(onScroll && { onScroll: composeHandlers(onScroll, scrollProps?.onScroll) })}
          keyboardShouldPersistTaps={scrollProps?.keyboardShouldPersistTaps ?? "handled"}
          contentContainerStyle={[ui.content, contentStyle, ...(scrollProps?.contentContainerStyle ? [scrollProps.contentContainerStyle] : [])]}
        >
          {children}
        </ScrollView>
        {footer}
      </SafeAreaView>
  );
  return Platform.OS === "android" && layout.tier === "xxxl" ? <KeyboardFrame>{content}</KeyboardFrame> : <KeyboardAvoidingView style={ui.screen} behavior="height" enabled={Platform.OS !== "android"}>{content}</KeyboardAvoidingView>;
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
        {eyebrow && (layout.tier === "xxxl" ? <StyledText variant="eyebrow" tone="muted">{eyebrow}</StyledText> : <Text style={ui.label}>{eyebrow}</Text>)}
        {title ? (
          layout.tier === "xxxl" ? <StyledText variant="screen" accessibilityRole="header" style={[styles.headerTitle, titleStyle]}>{title}</StyledText> : <Text maxFontSizeMultiplier={textSpecs[layout.tier].screen.maxScale} accessibilityRole="header" style={[styles.headerTitle, titleStyle]}>
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
        inactive && (layout.tier === "xxxl" ? { backgroundColor: mix(theme.foreground, theme.background, 0.12), borderColor: "transparent" } : styles.buttonDisabled),
        pressed && !inactive && styles.buttonPressed,
      ]}
    >
      {layout.tier === "xxxl" ? <StyledText variant="action" style={[styles.primaryButtonLabel, inactive && { color: theme.mutedForeground }]}>{label}</StyledText> : <Text maxFontSizeMultiplier={textSpecs[layout.tier].action.maxScale} style={styles.primaryButtonLabel}>{label}</Text>}
      {pending ? (
        <ActivityIndicator color={layout.tier === "xxxl" && inactive ? theme.mutedForeground : theme.primaryForeground} />
      ) : (
        <Ionicons name={trailingIcon} size={24} color={layout.tier === "xxxl" && inactive ? theme.mutedForeground : theme.primaryForeground} />
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
  pending,
  icon,
}: ButtonProps & { tone?: "danger"; pending?: boolean; icon?: ComponentProps<typeof Ionicons>["name"] }) {
  const { theme, styles, layout } = useCore();
  const inactive = pending ? true : disabled;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: !!inactive, ...(pending !== undefined && { busy: !!pending }) }}
      disabled={inactive}
      onPress={onPress}
      style={({ pressed }) => [
        styles.secondaryButton,
        tone === "danger" && styles.secondaryButtonDanger,
        inactive && (layout.tier === "xxxl" ? { backgroundColor: mix(theme.foreground, theme.background, 0.12), borderColor: "transparent" } : styles.buttonDisabled),
        pressed && !inactive && styles.buttonPressed,
      ]}
    >
      {layout.tier === "xxxl" && icon ? <Ionicons name={icon} size={22} color={layout.tier === "xxxl" && inactive ? theme.mutedForeground : tone === "danger" ? theme.danger : theme.foreground} /> : null}
      {pending ? <ActivityIndicator color={layout.tier === "xxxl" && inactive ? theme.mutedForeground : tone === "danger" ? theme.danger : theme.foreground} /> : null}
      {layout.tier === "xxxl" ? <StyledText variant="action" style={[styles.secondaryButtonLabel, tone === "danger" && styles.secondaryButtonLabelDanger, inactive && { color: theme.mutedForeground }]}>{label}</StyledText> : <Text maxFontSizeMultiplier={textSpecs[layout.tier].action.maxScale} style={[styles.secondaryButtonLabel, tone === "danger" && styles.secondaryButtonLabelDanger]}>{label}</Text>}
    </Pressable>
  );
}

type FieldProps = {
  label: string;
  presentation?: "default" | "description";
  helperText?: string;
  error?: string;
  invalid?: boolean;
  InputComponent?: ComponentType<ComponentProps<typeof TextInput>>;
} & ComponentProps<typeof TextInput>;

export function Field({
  label,
  presentation = "default",
  helperText,
  error,
  invalid,
  InputComponent = TextInput,
  style,
  ...inputProps
}: FieldProps) {
  const { theme, ui, styles, layout } = useCore();
  const showError = invalid || !!error;
  const hint = error ?? helperText;
  if (presentation === "description") {
    const large = layout.tier === "xxxl";
    return <View style={{ gap: large ? 8 : 4 }}>
      <StyledText preset="fieldLabel" tone="muted">{label}</StyledText>
      <PresetTextInput InputComponent={InputComponent} {...inputProps} preset="bodyCopy" multiline
        accessibilityLabel={inputProps.accessibilityLabel ?? label}
        placeholderTextColor={inputProps.placeholderTextColor ?? theme.mutedForeground}
        style={[{ minHeight: large ? 64 : 44, padding: large ? 16 : 0, color: theme.foreground }, large && { borderRadius: 18, backgroundColor: theme.secondary, borderWidth: 1, borderColor: showError ? theme.danger : theme.ring }, style]} />
      {hint ? <StyledText variant="meta" tone={error ? "danger" : "muted"} accessibilityRole={error ? "alert" : undefined}>{hint}</StyledText> : null}
    </View>;
  }
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

export function Group({ children, title, pairGap }: PropsWithChildren<{ title?: string; pairGap?: number }>) {
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
  const cards = <View style={{ gap: pairGap ?? xxxl.spacing.betweenGroups }}>
    {chunks.map((chunk, index) => <View key={index} style={styles.group}>{renderItems(chunk)}</View>)}
  </View>;
  return title ? <View style={{ gap: xxxl.spacing.headingToContent }}><StyledText variant="section" accessibilityRole="header">{title}</StyledText>{cards}</View> : cards;
}

export const ListGroup = Group;

export type ValueRowProps = {
  presentation?: "default" | "field";
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
  trailing?: ReactNode;
  chevron?: boolean;
  disabled?: boolean;
  children?: ReactNode;
} & ({ meta?: string; detail?: never } | { detail?: string; meta?: never });

export function ValueRow({
  title, meta, detail, value, onPress, icon, leading, presentation = "default", titleStyle, valueStyle, tone, accessibilityLabel, isLast, trailing, children, chevron = true, disabled,
}: ValueRowProps) {
  const { theme, styles, layout } = useCore();
  const large = layout.tier === "xxxl";
  const description = meta ?? detail;
  const color = tone ? textTone(theme, tone) : theme.foreground;
  if (large) {
    const fullLabel = [accessibilityLabel ?? title, ...[value, description].filter(part => part && !accessibilityLabel?.includes(part))].filter(Boolean).join(", ");
    if (presentation === "field") {
      const content = <>
        {leading ?? (icon ? <IconTile icon={icon} size={48} /> : null)}
        <View style={{ flex: 1, minWidth: 0, gap: 8 }}>
          <StyledText variant="meta" tone="muted" style={titleStyle}>{title}</StyledText>
          {value ? <StyledText variant="status" tone={tone} style={valueStyle}>{value}</StyledText> : null}
          {description ? <StyledText variant="meta" tone="muted" numberOfLines={2}>{description}</StyledText> : null}
          {trailing}{children}
        </View>
        {onPress && chevron ? <Ionicons name="chevron-forward" size={20} color={theme.mutedForeground} /> : null}
        {!isLast ? <View pointerEvents="none" style={styles.rowDivider} /> : null}
      </>;
      return onPress ? <Pressable accessible accessibilityRole="button" accessibilityLabel={fullLabel} disabled={disabled} accessibilityState={{ disabled: !!disabled }} onPress={disabled ? undefined : onPress} style={[styles.row, isLast && styles.rowLast]}>{content}</Pressable>
        : <View accessible accessibilityLabel={fullLabel} style={[styles.row, isLast && styles.rowLast]}>{content}</View>;
    }
    const labelLine = <View style={{ flexDirection: "row", alignItems: "center", gap: xxxl.spacing.labelTileGap }}>
      {leading ?? (icon ? <View style={styles.rowIcon}><Ionicons name={icon} size={18} color={color} /></View> : null)}
      <StyledText variant="rowTitle" style={[{ flex: 1, minWidth: 0 }, titleStyle]}>{title}</StyledText>
      {onPress && chevron ? <Ionicons name="chevron-forward" size={20} color={theme.mutedForeground} /> : null}
    </View>;
    const content = <>
      <View style={{ flex: 1, minWidth: 0, gap: xxxl.spacing.insideRow }}>
        {labelLine}
        {value || trailing ? <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
          {value ? <StyledText variant="money" tone={tone} style={[{ flexShrink: 1 }, valueStyle]}>{value}</StyledText> : null}
          {trailing}
        </View> : null}
        {description ? <StyledText variant="meta" tone="muted" numberOfLines={2} ellipsizeMode="tail">{description}</StyledText> : null}
        {children}
      </View>
      {!isLast ? <View pointerEvents="none" style={styles.rowDivider} /> : null}
    </>;
    return onPress
      ? <Pressable accessible accessibilityRole="button" accessibilityLabel={fullLabel} {...(disabled !== undefined && { disabled, accessibilityState: { disabled } })} onPress={disabled ? undefined : onPress} style={[styles.row, isLast && styles.rowLast]}>{content}</Pressable>
      : <View accessible accessibilityLabel={fullLabel} style={[styles.row, isLast && styles.rowLast]}>{content}</View>;
  }
  const content = (
    <>
      {leading ?? (icon && (
        <View style={styles.rowIcon}>
          <Ionicons name={icon} size={20} color={color} />
        </View>
      ))}
      <View style={styles.rowContent}>
        <View style={styles.rowCopy}>
          <Text style={[styles.rowTitle, titleStyle]}>{title}</Text>
          {description ? <Text style={styles.rowDetail}>{description}</Text> : null}
        </View>
        {value ? <Text style={[styles.rowValue, tone && { color }, valueStyle]}>{value}</Text> : null}
      </View>
      {onPress ? <Ionicons name="chevron-forward" size={20} color={theme.mutedForeground} /> : null}
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

export { MoneyHero, type MoneyHeroProps } from "./MoneyHero";

export type ChoiceProps = {
  label: string; detail?: string; selected: boolean; onPress: () => void; disabled?: boolean;
  kind?: "radio" | "checkbox"; leading?: ReactNode; presentation?: "grouped" | "option"; isLast?: boolean;
  emoji?: string;
};

export function Choice({
  label,
  detail,
  selected,
  onPress,
  disabled = false, kind = "radio", leading, presentation = "grouped", isLast, emoji,
}: ChoiceProps) {
  const { theme, styles, layout } = useCore();
  if (layout.tier === "xxxl") {
    const option = presentation === "option";
    return <Pressable accessibilityRole={kind} accessibilityLabel={[label, detail].filter(Boolean).join(", ")}
      accessibilityState={{ checked: selected, disabled }} disabled={disabled} onPress={onPress}
      style={{ minHeight: option ? 60 : 72, flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: option ? (selected ? 11 : 12) : 16, paddingHorizontal: option && selected ? 15 : 16,
        ...(option ? { borderRadius: 18, borderWidth: selected ? 2 : 1, borderColor: selected ? theme.primary : theme.border, backgroundColor: selected ? `${theme.primary}17` : theme.secondary } : { borderBottomWidth: isLast ? 0 : 1, borderBottomColor: theme.border }), opacity: disabled ? 0.45 : 1 }}>
      {leading ?? (emoji !== undefined ? <EmojiTile emoji={emoji.trim() || "✨"} color={theme.primary} size={36} /> : null)}
      <View style={{ flex: 1, minWidth: 0, gap: 4 }}><StyledText variant={option ? "action" : "rowTitle"} tone={option && selected ? "primary" : "default"}>{label}</StyledText>
        {detail ? <StyledText variant="status" tone="muted" numberOfLines={1}>{detail}</StyledText> : null}</View>
      {option ? (selected ? <Ionicons name="checkmark" size={22} color={theme.primaryText} /> : null)
        : <View style={{ width: kind === "radio" ? 26 : 28, height: kind === "radio" ? 26 : 28, borderRadius: kind === "radio" ? 999 : 9, borderWidth: 2, borderColor: selected ? theme.primary : theme.ring, alignItems: "center", justifyContent: "center", backgroundColor: selected && kind === "checkbox" ? theme.primary : "transparent" }}>
          {selected ? kind === "radio" ? <View style={{ width: 12, height: 12, borderRadius: 999, backgroundColor: theme.primary }} /> : <Ionicons name="checkmark" size={20} color={theme.primaryForeground} /> : null}
        </View>}
    </Pressable>;
  }
  return (
    <Pressable
      accessibilityRole={kind}
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

export function ChoiceRow({ legacy, ...props }: ChoiceProps & { legacy?: ReactNode }) {
  const { layout } = useCore();
  if (layout.tier !== "xxxl") {
    if (legacy !== undefined) return legacy;
    if (props.kind === "checkbox" || props.presentation === "option") return null;
  }
  return <Choice {...props} />;
}
export { ActionBar, type ActionBarProps, type BarAction, type SecondaryBarAction } from "./ActionBar";
export * from "./surfaces";
export * from "./selection";
export * from "./summaries";
export * from "./feedback";
export { SheetHeader } from "./SheetHeader";
export { moneyTone } from "./design";

export { Presentation, ReflowRow, ReflowItem, useReflowStyles } from "./reflow";
export { FactRow, IconButton, type FactRowProps, type IconButtonProps } from "./adapters";
export { TextInput, useTextPreset, type TextInputProps } from "./TextInput";
export { type TextPreset } from "./textPresets";

export { AmountField, type AmountFieldProps } from "./AmountField";
export { useNativeStackHeaderOptions, useNativeStackHeaderConfig } from "./nativeStack";
