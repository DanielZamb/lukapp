# Expo foundation handoff

The frozen UX, design and capability contracts remain authoritative. This unit supplies shared UI and a runnable route stack. It has no account session, posting command, Budget calculation, Recovery calculation or encrypted local storage.

## UI API

Import shared components from `src/ui`. All styles read `src/theme/tokens.ts` through `useTheme`. The token file remains unchanged. `ThemeProvider` follows device appearance. The root layout waits for all five exact Geist families before rendering the stack and exposes an explicit font-load failure.

- `Header` takes a title and optional labeled back/action callbacks. Icon controls have actual 48 by 48 point bounds and additional hit slop.
- `ListRow` takes title, supporting text and a value. `leadingEmoji` supports Places. An optional callback makes the entire row a button. `disabled` applies to interactive rows.
- `ListGroup` owns a section label and separators. It adds no enclosing card.
- `PrimaryButton` and `SecondaryButton` take label, callback, disabled and loading. Loading disables the callback and exposes busy state.
- `Choice` is a controlled radio, with label, selected, callback and disabled. The caller groups related choices with a radiogroup.
- `ActionTile` is one interactive content unit with a title and optional supporting text/value.
- `ProgressBar` takes an accessibility label and either remaining/fraction or over-limit state. The fraction is display input. The over-limit state has a danger wash and no fill. It performs no Budget calculation.
- `ConfirmationScreen` takes title, detail and one labeled action. `ConfirmationContent` is also exported so the later posting owner can reuse its message content in the settled banner without a competing form.
- `Screen` provides safe-area, scrolling and keyboard avoidance. `Copy` provides shared title/supporting typography.

Each interactive component has a 48-point minimum height and sufficient width. Text can wrap and grow with system text size. Supporting copy is plain financial language. Product balances need no outer card.

## Routes and preview

`src/app/_layout.tsx` owns theme, font startup and the normal Expo Router stack. A destination adds a route file, imports the shared components and reads the applicable owner. It does not add a global screen selector.

`/` is a truthful startup page pending F03/F04. It is not the settled Home journey. `/core-preview` and its controls, activity, entry, confirmation and ownership children are development-only inspection routes. Their layout redirects to `/` in a release bundle. Every example identifies itself as a UI fixture. None submits accounting or accesses live auth. Entry text is ephemeral and disappears when its route unmounts.

## Data ownership

`src/modules/ownership.ts` is the executable owner directory used by the dev inspection route. Its later-unit labels describe reserved integration boundaries, not functioning stores. Keep manual Local Entry Drafts and Notification Candidates in distinct encrypted device modules. Neither becomes a financial read cache. Both require their actual retention, security and online submission rules in their owning units.

`src/modules/posted-activity/source.ts` is the implemented shared read owner. Construct one source at the authorized Workspace provider boundary. Pass a transport with `subscribe(workspaceId, receive)` and its unsubscribe callback. Backend payload validation and mapping happen in that adapter, using generated Convex/query types. `PostedActivityRow` is a display projection with no balances or accounting behavior.

Call `setScope` when authenticated Workspace/connectivity changes. The first consumer opens one upstream read; additional consumers share the exact snapshot. The last unsubscribe stops the read and clears the rows. Workspace changes clear rows before a new read, and callbacks from earlier subscriptions cannot refill the source. Offline, signed-out and read failures expose no rows. There is no persistence API. A transport reports offline immediately when its connection becomes unavailable, and the session owner must set unavailable on sign-out or loss of authorization. Reconnection creates a new subscription. F02 proves these rules with a real observable source and a clearly labeled fixture transport, not a live financial account.

`PostedActivityProvider` and `usePostedActivity` share the source across components. `PostedActivityList` consumes it with a caller-supplied recent limit. Future overview/account destinations use four/three; paginated history needs its real backend query adapter and 50-row pages. The foundation does not invent pagination, reversal filtering or ledger calculations.

Budget and Recovery have separate owner boundaries. Their adapters read their own Workspace plans/contributions and obtain activity from the shared source. Alerts derives from the actual Drafts, Recovery-due and month-readiness owners. Workspace and profiles remain authorized backend reads. Month Close reads those owners and period status. No route owns a second financial model.

## Subsequent units

- F03, SEN-46/SEN-70, adds onboarding, account setup and the first cash expense. It also owns the live Clerk wiring after A02, as scoped by the coordinator. Install authorized session/Workspace/Convex providers at the root boundary, feed the shared read source's scope, and use Header, Choice, buttons, rows and confirmation for the four-answer setup and the single posting form. Foundation entry is only a keyboard fixture.
- F04, SEN-44/SEN-60/SEN-71/SEN-72/SEN-73, supplies Posted activity/category/account transaction routes. Its generated Convex adapter implements PostedTransport. Share that one source across Overview, account detail and Home consumers, with four/three recent rows and real 50-row history pagination. Reuse ListRow and its leading emoji for the later Places destination. Reversal filtering belongs to the actual query/presentation adapter, not a second ledger.
- F05, SEN-48/SEN-75, owns Budget under Plans. Add its online Workspace plan owner in `src/modules/budget`, read actual Posted expense lines through the shared activity/query owner, and pass calculated remaining or over-limit display state to ProgressBar. No Budget calculation is supplied here.
- F06, SEN-47/SEN-76, owns Savings Recovery in `src/modules/savings-recovery`. Read actual plans/contributions separately from Budget, and use the shared Posted source for supporting transfers. Reuse ProgressBar and confirmation content. Do not copy balances into Recovery.
- F07, SEN-45, owns `src/modules/local-entry-drafts` and the manual Draft flow. Implement its distinct encrypted device input store, retention and deliberate online submission. Reuse controlled choices, row groups and ConfirmationScreen. The owner directory reserves that name independently from Candidates.
- I01, SEN-53/SEN-74, owns `src/modules/notification-intake`, its separate encrypted Candidate input owner and the intake confirmation adapter. Reuse Header, buttons, Choice and ListGroup. Candidate-specific rows remain in that module. Confirm through the real ordinary online posting path and receipt, without moving Candidates into the manual Draft store.

The unit mapping above follows the coordinator's read-only units.tsv and the supplied issue records. No deferred API has a method that silently claims success. Later navigation, Alerts and Month Close owners compose these sources without financial copies. Integrated simulator acceptance remains a later unit; this foundation does not prove live Owner access, native capture, encrypted storage or physical-device behavior.
