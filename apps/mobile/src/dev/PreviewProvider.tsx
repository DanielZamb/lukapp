import { createContext, useContext, useState } from "react";
import type { PropsWithChildren } from "react";
import { PostedActivityProvider } from "../modules/posted-activity/PostedActivityProvider";
import { createFixtureActivity } from "./fixture-source";

const PreviewContext = createContext<ReturnType<
  typeof createFixtureActivity
> | null>(null);
export function PreviewProvider({ children }: PropsWithChildren) {
  const [fixture] = useState(createFixtureActivity);
  return (
    <PreviewContext value={fixture}>
      <PostedActivityProvider source={fixture.source}>
        {children}
      </PostedActivityProvider>
    </PreviewContext>
  );
}
export function usePreviewFixture() {
  const fixture = useContext(PreviewContext);
  if (!fixture) throw new Error("Core preview needs its fixture provider.");
  return fixture;
}
