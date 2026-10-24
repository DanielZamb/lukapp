---
name: Lukapp · XXXL text
version: 0.1 (concept, 2026-10-20)
applies-when: "React Native fontScale >= 1.3 (iOS xxxLarge and up, Samsung's largest font steps)"
drawn-at: "fontScale 1.5 on a 320 pt wide viewport, the narrow Samsung layout"
source-tokens: apps/mobile/src/ui/tokens.ts
colors:
  background: "#ffffff"
  foreground: "#0a0a0a"
  paper: "#fbfafc"
  primary: "#6d28d9"
  primary-foreground: "#f5f3ff"
  primary-text: "#6d28d9"
  secondary: "#f4f4f5"
  secondary-foreground: "#18181b"
  muted-foreground: "#6e6e6e"
  border: "#e5e5e5"
  ring: "#8a8a8a"
  positive: "#047857"
  warning: "#9c5f06"
  danger: "#b91c1c"
  tint: "#f6f1fd"
  tint-border: "#e6d9fa"
  dark:
    background: "#0a0a0a"
    foreground: "#fafafa"
    primary: "#7c3aed"
    primary-text: "#c4b5fd"  # violet text on dark tint; #7c3aed measured 3.07:1
    secondary: "#27272a"
    muted-foreground: "#a3a3a3"
    border: "rgba(255,255,255,0.10)"
    positive: "#34d399"
    warning: "#fbbf24"
    danger: "#f87171"
typography:
  family: Geist (400, 500, 600)
  # Rendered sizes at fontScale 1.5. "cap" is the RN maxFontSizeMultiplier.
  hero:        { base: 44, cap: 1.2,  size: 53, line: 1.04, weight: 600, tracking: -0.05em }
  screen:      { base: 32, cap: 1.25, size: 40, line: 1.1,  weight: 600, tracking: -0.045em }
  detail-name: { base: 30, cap: 1.25, size: 38, line: 1.12, weight: 600, tracking: -0.04em }
  section:     { base: 20, cap: 1.35, size: 27, line: 1.25, weight: 600, tracking: -0.025em }
  money:       { base: 18, cap: 1.5,  size: 27, line: 1.2,  weight: 600, tracking: -0.035em }
  row-title:   { base: 16, cap: 1.5,  size: 24, line: 1.3,  weight: 600, tracking: -0.02em }
  body:        { base: 16, cap: none, size: 24, line: 1.45, weight: 400, tracking: -0.01em }
  action:      { base: 17, cap: 1.4,  size: 24, line: 1.25, weight: 600, tracking: -0.015em }
  meta:        { base: 14, cap: none, size: 21, line: 1.4,  weight: 400, tracking: 0 }
  label:       { base: 12, cap: none, size: 18, line: 1.35, weight: 500, tracking: 0 }
spacing:
  unit: 4
  inside-row: 10
  row-padding: "24 vertical / 20 horizontal"
  between-rows: "hairline only, no gap"
  between-groups: 40
  between-sections: 48
  page-padding: 16
rounded:
  control: 18
  row-icon: 14
  card: 24
  sheet: 28
  pill: 9999
controls:
  touch-target: 56
  primary-button: 68
  secondary-button: 60
  input: 64
  choice-row: 72
elevation:
  flat: none
  card: "1px border, no shadow"
  sheet: "0 -2px 8px rgb(29 9 44 / 0.04)"
  glass: "inset 0 1px .5px rgb(255 255 255 / .9), 0 12px 30px rgb(14 6 30 / .26), 0 2px 6px rgb(14 6 30 / .14)"
motion:
  pill-spring: "cubic-bezier(.2,1.18,.36,1), 500 ms"
  dock-delay: "3000 ms (1200 ms with Reduce Motion, no spring)"
---

# Lukapp · XXXL text

## Overview

The XXXL variant is a layout tier, not a bigger copy of the default screens. When text is this large, the risk is no longer "too dense". It is "the screen stops making sense": amounts break mid-number, labels and values separate, and cards become longer than the screen. Every rule below keeps one decision readable in one glance.

The tier turns on from `fontScale >= 1.3`. Specs are drawn at fontScale 1.5. Above 1.5 (iOS accessibility sizes, Android 200 %), the same layout holds; only the caps stop growth of the hero, titles and money.

## Colors

The same roles as the default theme (`tokens.ts`). XXXL changes no colors. Muted text must be at least 4.5:1 on its own surface, because at this size people often have low vision, not only a preference for big text.

## Typography

- Body text follows the system scale with no cap. Never shrink body text to make a layout fit.
- Hero amounts, screen titles and money are capped so a full amount fits on one line at 320 pt.
- Currency sits on its own line above the hero amount (`COP` in `label`, then `184.000` in `hero`).
- The minimum rendered size is 18 (label). Nothing is smaller at XXXL.

## Layout

1. **One column.** No side-by-side tiles, chips or two-column stats. Action tiles stack at full width.
2. **At most two items per group.** A third item starts a new group 40 pt below, or becomes "View all".
3. **At most two facts per row.** Title + one value. If a fact repeats across rows (the date, the account), raise it to the group heading: "19 October" heads the group, and its rows show only name + amount.
4. **Values never share a line with their label.** The label goes on top and the value below. Money goes on its own line under the row title.
5. **Space marks the grouping.** 10 inside a row, a hairline between rows, 40 between groups, 48 between sections.
6. **Detail pages lead with the summary.** The hero amount, its meaning ("spent this month"), then one 2-row group (limit / left). Activity and actions follow.

## Elevation and glass

Cards are flat with a 1 px border. Only floating layers have shadow. The top pill uses Liquid Glass: lensing rim, light blur with saturation, a light tint and dark text (Regular). Clear is allowed only over dark content. With Reduce Transparency, use Solid.

## Components

- **Primary button:** 68 tall, full width, `control` radius, `action` type. One per screen.
- **Secondary button:** 60 tall, outline or tinted secondary.
- **Row group (Card):** 1 px border, `card` radius, 2 rows max, hairline dividers inset 20.
- **Money row:** `row-title`, then `money` on the next line. A chevron when it opens a detail.
- **Labelled value row:** `label` on top, `money` or `row-title` value below.
- **Choice row:** 72 tall, single column, radio or check at the end.
- **Input:** 64 tall. Currency prefix as an addon. The label is always above the field, never inside it.
- **Badge:** status only (Posted, Draft). `label` type and pill radius. Never used as the only way to read a number.
- **Bottom sheet (Drawer):** title row 56 tall plus a 56 close button. The content scrolls, and the top pill is never inside the sheet.

### Top pill: context that survives scrolling

The pill appears once the sheet's summary scrolls out of view. It shows the one fact the user needs while reading the rows below. Tapping it scrolls back to the summary. Swiping up hides it until the summary is visible again.

- **Camera island** (preferred). On phones with a top-centre camera cutout (iOS Dynamic Island, or Android with a centred punch hole reported by `DisplayCutout`). Compact: 44 tall, screen width − 16. The emoji sits before the camera and the amount after it, in `positive` colour. Tap to expand: name, two labelled figures, and a "Back to summary" button.
- **Peek, then dock** (fallback). A banner below the status bar with name, amount left, and "of COP 200.000" plus a bar. After 3 s it docks into a one-line glass pill: emoji, "COP 80.000 left", chevron. If that line doesn't fit, drop the word "left" and keep the colour and the screen-reader label.
- Both are one button for screen readers: "Back to summary, Food & drink, COP 80,000 left".

## Do's and Don'ts

- Do keep two items per group. Don't add a third row "because it fits".
- Do put money on its own line. Don't let "COP 120.000" wrap after "Food & drink".
- Do stack action tiles. Don't keep the 2 × 2 home grid at XXXL.
- Do raise shared facts (dates) to the group heading. Don't repeat them in every row.
- Do let body text grow. Don't set `allowFontScaling={false}` on anything but the brand lockup.
- Don't put the context pill inside the sheet or over the sheet's close button when docked.
- Don't use Clear glass over light rows.

## Responsive

The tier depends on `fontScale`, not width. The effective width `width / fontScale` decides reflow (already `readableLayout().reflow`). XXXL also forces one column and the 56 touch target.

## Known gaps

- Detecting a centred camera cutout on Android needs a native module (`DisplayCutout`). Until then, the island ships on iOS only and Android uses peek-then-dock.
- Real Liquid Glass on iOS 26 maps to `expo-glass-effect`. Android has no lensing: it uses a blur view with Regular tint, or Solid.
- Not yet checked on the Samsung itself at the largest step, or with TalkBack/VoiceOver.
