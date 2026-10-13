import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useFonts } from "expo-font";
import { ActivityIndicator, Text, View } from "react-native";
import {
  Geist_400Regular,
  Geist_500Medium,
  Geist_600SemiBold,
  Geist_700Bold,
  Geist_800ExtraBold,
} from "@expo-google-fonts/geist";
import { ThemeProvider, useTheme } from "../theme/ThemeProvider";
import { font, spacing } from "../theme/tokens";

function AppStack() {
  const theme = useTheme();
  const [loaded, error] = useFonts({
    [font.regular]: Geist_400Regular,
    [font.medium]: Geist_500Medium,
    [font.semibold]: Geist_600SemiBold,
    [font.bold]: Geist_700Bold,
    [font.extrabold]: Geist_800ExtraBold,
  });
  if (!loaded)
    return (
      <View
        style={{
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: theme.background,
          padding: spacing.xxl,
        }}
      >
        {error ? (
          <Text accessibilityRole="alert" style={{ color: theme.danger }}>
            The app fonts could not load. Please reopen the app.
          </Text>
        ) : (
          <ActivityIndicator
            accessibilityLabel="Loading app fonts"
            color={theme.primary}
          />
        )}
      </View>
    );
  return (
    <>
      <StatusBar style="auto" />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: theme.background },
          headerTitleStyle: { fontFamily: font.semibold },
        }}
      />
    </>
  );
}

export default function RootLayout() {
  return (
    <ThemeProvider>
      <AppStack />
    </ThemeProvider>
  );
}
