type Ownership = {
  label: string;
  policy:
    | "online-read"
    | "encrypted-device-input"
    | "derived-view"
    | "device-preference"
    | "router-stack";
  boundary: string;
  status: "foundation" | "later-unit";
};
export const moduleOwnership = {
  postedActivity: {
    label: "Posted activity",
    policy: "online-read",
    boundary: "One shared read source. No offline copy.",
    status: "foundation",
  },
  localEntryDrafts: {
    label: "Manual Drafts",
    policy: "encrypted-device-input",
    boundary: "Separate device owner. Online submission only.",
    status: "later-unit",
  },
  notificationCandidates: {
    label: "Notification Candidates",
    policy: "encrypted-device-input",
    boundary: "Separate encrypted owner. Never manual Drafts.",
    status: "later-unit",
  },
  budget: {
    label: "Budget",
    policy: "online-read",
    boundary: "Workspace plans. Activity comes from its shared owner.",
    status: "later-unit",
  },
  recovery: {
    label: "Savings Recovery",
    policy: "online-read",
    boundary: "Plans and contributions. No copied balances.",
    status: "later-unit",
  },
  alerts: {
    label: "Alerts",
    policy: "derived-view",
    boundary: "Drafts, Recovery due and month readiness. No store.",
    status: "later-unit",
  },
  workspace: {
    label: "Workspace",
    policy: "online-read",
    boundary: "Authorized backend read. Scope clears financial reads.",
    status: "later-unit",
  },
  profiles: {
    label: "Account profiles",
    policy: "online-read",
    boundary: "Authorized backend read. No destination-owned copy.",
    status: "later-unit",
  },
  theme: {
    label: "Theme",
    policy: "device-preference",
    boundary: "Device appearance through the single theme provider.",
    status: "foundation",
  },
  navigation: {
    label: "Navigation",
    policy: "router-stack",
    boundary: "Expo Router owns the screen stack.",
    status: "foundation",
  },
} satisfies Record<string, Ownership>;
