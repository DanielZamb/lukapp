# Expo and React Native Learning Notes

> These notes belong to the throwaway SEN-6 UI prototype. They record reusable
> concepts learned while building it; the prototype code itself is not
> production code.

## The development loop

- `npx expo start` starts Expo CLI and Metro. Metro watches the JavaScript and
  TypeScript source, transforms the modules, and serves the app bundle to the
  native client.
- Expo Go supplies a prebuilt native runtime. Our React Native code is delivered
  to it by Metro.
- Fast Refresh applies most saved JavaScript or TypeScript changes without
  rebuilding the native app or restarting Metro.
- A development build replaces Expo Go with a project-specific native runtime,
  but it still uses Metro while developing JavaScript or TypeScript.

## Running through USB on a restricted LAN

The working commands were:

```bash
adb get-state
adb reverse tcp:8081 tcp:8081
npx expo start --localhost --go
```

- `adb get-state` checks that an authorized Android device is connected.
- `adb reverse tcp:8081 tcp:8081` forwards connections made to port `8081` on
  the phone through ADB/USB to port `8081` on the computer.
- `--localhost` makes Expo advertise a loopback address instead of the
  computer's LAN address.
- `--go` explicitly selects Expo Go as the launch target.

Without the reverse rule, `localhost` on the phone means the phone itself. With
the rule, a request from Expo Go to the phone's `localhost:8081` travels through
USB to Metro on the computer:

```text
Expo Go -> phone localhost:8081 -> ADB over USB -> Mac localhost:8081 -> Metro
```

This bypasses Wi-Fi client isolation, separate subnets, VPN routing, and similar
LAN restrictions. Inspect or remove the temporary rule with:

```bash
adb reverse --list
adb reverse --remove tcp:8081
```

## Expo Router is file-based

- `app/index.tsx` maps to the `/` route.
- `_layout.tsx` defines layout/navigation around routes in its directory.
- Files under `app/` are candidates for routes. Reusable non-route components
  should live outside `app/`, such as `components/prototype-switcher.tsx`.
- Putting `prototype-switcher.tsx` under `app/components/` can accidentally make
  Expo Router interpret it as `/components/prototype-switcher`.

## React Native is not HTML

React Native components describe native UI rather than browser DOM elements:

- `View` is a general layout container, roughly analogous to a `div`.
- `Text` displays text. Text content must generally be inside `Text`.
- `ScrollView` provides a scrollable native container.
- `Pressable` represents an interactive press target and exposes pressed-state
  behavior.

Styles are JavaScript objects rather than ordinary CSS files. Property names use
camelCase, such as `backgroundColor`.

## `ScrollView` has two styling surfaces

- `style` affects the outer scroll viewport.
- `contentContainerStyle` affects the inner container that holds the scrolling
  children.

For page padding and spacing between the children, we used:

```tsx
<ScrollView contentContainerStyle={styles.content}>
```

## `StyleSheet.create`

`StyleSheet.create` groups named React Native style objects:

```tsx
const styles = StyleSheet.create({
  content: {
    padding: 24,
    gap: 12,
  },
});
```

A component receives a style through its `style` or specialized style prop:

```tsx
<View style={styles.account}>
```

## Floating UI versus scrolling UI

An absolutely positioned element inside a `ScrollView` belongs to the scrolling
content and may move away with it. To keep the prototype switcher anchored to
the screen, the route uses a full-screen wrapper with the scroll view and
switcher as siblings:

```text
full-screen View (`flex: 1`)
├── ScrollView
└── PrototypeSwitcher (`position: "absolute"`)
```

- `flex: 1` makes the wrapper occupy the available screen.
- `position: "absolute"` plus `left`, `right`, and `bottom` anchors the switcher
  within that wrapper and removes it from normal layout flow.
- Extra `paddingBottom` on the scroll content lets its final items scroll above
  the overlay rather than remaining hidden behind it.
- The bottom offset may need to account for a device's system navigation area.


## Shareable variant state

The prototype uses a URL parameter such as `?variant=D` instead of component-only
state:

```tsx
const { variant } = useLocalSearchParams<{ variant?: string }>();
```

- URL state survives navigation/reloads better than an isolated `useState`
  selection and can be shared with another reviewer.
- Search parameters are external string input, so the route normalizes unknown
  values to variant A.
- `router.setParams({ variant: "D" })` updates the current route parameter and
  causes components reading that parameter to render again.

## Useful TypeScript ideas from the switcher

```tsx
const variants = ["A", "B", "C", "D"] as const;
type PrototypeVariant = (typeof variants)[number];
```

- `as const` preserves the exact literal values instead of widening the array to
  a general `string[]`.
- `PrototypeVariant` therefore becomes the union `"A" | "B" | "C" | "D"`.
- A component prop typed as `PrototypeVariant` cannot accidentally receive an
  arbitrary string after the URL value has been normalized.

## Prototype-only UI

React Native exposes the global `__DEV__` flag during development:

```tsx
{__DEV__ && <PrototypeSwitcher current={currentVariant} />}
```

This makes the evaluation switcher explicitly non-production. It does not make
the rest of the throwaway prototype production-ready.

## Pressable touch targets and icons

A `Pressable` is only as large as its laid-out bounds. Wrapping a single arrow
character produced a tiny target even though it sat inside a much larger bar.
The switcher therefore gives each arrow control an explicit circular width and
height and retains `hitSlop` for a little extra tolerance.

The `style` callback receives the current pressed state, which can provide
immediate visual feedback:

```tsx
style={({ pressed }) => [
  styles.arrowButton,
  pressed && styles.arrowButtonPressed,
]}
```

- `width` and `height` enlarge the actual control.
- `hitSlop` expands where a press may begin, up to the parent bounds.
- `accessibilityRole="button"` and an explicit `accessibilityLabel` explain an
  icon-only control to assistive technology.
- Ionicons use `name`, `size`, and `color`; `fontSize` on the surrounding
  `Pressable` does not size the icon.

## References for this project version

- [Expo SDK 54 reference](https://docs.expo.dev/versions/v54.0.0/)
- [Expo Router SDK 54 reference](https://docs.expo.dev/versions/v54.0.0/sdk/router/)
