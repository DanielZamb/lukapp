import { Redirect, Stack } from "expo-router";
import { PreviewProvider } from "../../dev/PreviewProvider";

export default function PreviewLayout() {
  if (!__DEV__) return <Redirect href="/" />;
  return (
    <PreviewProvider>
      <Stack screenOptions={{ headerShown: false }} />
    </PreviewProvider>
  );
}
