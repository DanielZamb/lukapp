import { createElement, type ReactNode } from "react";
import { act, create, type ReactTestInstance, type ReactTestRenderer } from "react-test-renderer";
import {
  BaseNavigationContainer, createNavigationContainerRef, createNavigatorFactory, StackActions, StackRouter, useNavigationBuilder,
  type ParamListBase,
} from "@react-navigation/native";
import { ListRow } from "../../ui/core";
import { LanguageProvider } from "../../i18n";

function TestNavigator({ children }: { children: ReactNode }) {
  const { state, descriptors, NavigationContent } = useNavigationBuilder(StackRouter, { children });
  return createElement(NavigationContent, null, state.routes.map((route) => descriptors[route.key]!.render()));
}
const Stack = createNavigatorFactory(TestNavigator)();
const Empty = () => null;

export type RouterDouble = {
  back: (...args: unknown[]) => unknown; dismissTo: (...args: unknown[]) => unknown; push: (...args: unknown[]) => unknown;
  replace: (...args: unknown[]) => unknown; canGoBack: () => boolean;
};

/** Index → Places → a Place's page → the ending flow, with expo-router's imperative calls bound to this stack. */
export async function mountStack(router: { [K in keyof RouterDouble]: { mockImplementation(fn: RouterDouble[K]): unknown } },
  screen: () => ReactNode, language?: "es") {
  const stack = createNavigationContainerRef<ParamListBase>();
  router.back.mockImplementation(() => stack.goBack());
  router.canGoBack.mockImplementation(() => stack.canGoBack());
  router.dismissTo.mockImplementation((href: unknown) => stack.dispatch(StackActions.popTo(String(href).replace("/", ""))));
  router.push.mockImplementation((href: unknown) => typeof href === "string"
    ? stack.dispatch(StackActions.push(href.replace("/", "")))
    : stack.dispatch(StackActions.push((href as { pathname: string }).pathname.replace("/", ""), (href as { params?: object }).params)));
  router.replace.mockImplementation(() => {});
  let root: ReactTestRenderer | undefined;
  const tree = createElement(BaseNavigationContainer, {
    ref: stack,
    initialState: { index: 3, routes: [{ name: "index" }, { name: "places" }, { name: "account", params: { profileId: "wallet" } },
      { name: "place-ending", params: { profileId: "wallet" } }] },
    children: createElement(Stack.Navigator, null,
      createElement(Stack.Screen, { name: "index", component: Empty }),
      createElement(Stack.Screen, { name: "places", component: Empty }),
      createElement(Stack.Screen, { name: "account", component: Empty }),
      createElement(Stack.Screen, { name: "intake", component: Empty }),
      createElement(Stack.Screen, { name: "place-ending", children: screen }),
    ),
  });
  await act(async () => {
    root = create(language ? createElement(LanguageProvider, { initialPreference: language }, tree) : tree);
  });
  const mounted: ReactTestRenderer | undefined = root;
  if (!mounted) throw new Error("Stack not mounted");
  return {
    root: mounted,
    stack,
    routes: () => (stack.getRootState()?.routes ?? []).map((route) => route.name),
  };
}

export function screenHelpers(root: () => ReactTestRenderer) {
  const all = () => root().root;
  const texts = () => all().findAll((node) => String(node.type) === "Text").map((node) => node.children.join(""));
  const pressables = (label: string) => all().findAll((node) => String(node.type) === "Pressable" && node.props.accessibilityLabel === label);
  function pressable(label: string) {
    const found = pressables(label)[0];
    if (!found) throw new Error(`Missing control ${label}. Visible: ${texts().join(" | ")}`);
    return found;
  }
  async function press(label: string) {
    const found = pressable(label);
    if (found.props.disabled) throw new Error(`Control ${label} is disabled`);
    await act(async () => found.props.onPress());
  }
  function input(label: string): ReactTestInstance {
    const found = all().findAll((node) => String(node.type) === "TextInput" && node.props.accessibilityLabel === label)[0];
    if (!found) throw new Error(`Missing input ${label}`);
    return found;
  }
  async function type(label: string, text: string) {
    await act(async () => input(label).props.onChangeText(text));
  }
  async function row(title: string) {
    const found = all().findAll((node) => node.type === ListRow && node.props.title === title)[0];
    if (!found?.props.onPress) throw new Error(`Missing row ${title}`);
    await act(async () => found.props.onPress());
  }
  const alerts = () => all().findAll((node) => String(node.type) === "Text" && node.props.accessibilityRole === "alert").map((node) => node.children.join(""));
  const disabled = (label: string) => !!pressable(label).props.disabled;
  const has = (label: string) => pressables(label).length > 0;
  return { texts, press, input, type, row, alerts, disabled, has, pressable };
}

/** Lets a chain of awaited reads finish, as the preview's later pages do. */
export async function settle(rounds = 400) {
  await act(async () => { for (let index = 0; index < rounds; index++) await Promise.resolve(); });
}
