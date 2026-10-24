# T0 API

Import content components and named Text from `apps/mobile/src/ui/core`. Sheet and PickerSheet retain their existing module paths. Import SheetProvider from src/ui/SheetProvider, once around each modal provider scope.

| Export | Props or result |
| --- | --- |
| readableLayout | `{width,fontScale}` returns `{tier,reflow,pagePadding,touchTarget}`. Tier is default, reflow or xxxl. |
| useTier, useControls, useReadableLayout | Current layout tier, controls lookup entry and layout. Available from themeContext and core. |
| xxxlFontScale, controls, xxxl | Threshold1.3, compared with0.005 tolerance for Android float32; per-tier control heights; XXXL control/spacing/radius tokens. In tokens.ts. |
| textSpecs, textStyle, textTone | Per-tier variant specs, native style without maxScale, and color lookup. In typography.ts. |
| Text | Native Text props and ref, optional variant default body, optional tone default default. Applies named style and tier cap; font scaling stays enabled. |
| TextVariant | hero, screen, detailName, section, money, rowTitle, body, action, meta, label. |
| TextTone | default, muted, primary, positive, warning, danger. Primary uses primaryText. |
| ValueRow, ListRow | Direct aliases. title; optional meta or legacy detail, value, icon or leading ReactNode, onPress, titleStyle, valueStyle, tone, accessibilityLabel, isLast. |
| Group, ListGroup | Direct aliases. children and optional title. XXXL recursively flattens fragments, groups rows in pairs, injects isLast per card. Other tiers retain existing normalization/render. |
| Columns | children. Wrapping47% slots at default; full-width slots in reflow/XXXL. Nested ActionTile fills its slot. |
| MoneyHero | currency, amount, optional negative default false, optional Text style. Values are formatted presentation strings. One combined accessibility label. |
| Sheet | Existing label/onClose/children works unchanged. Optional sheetRef, presentOnMount, onDismiss, busy, dismissible, androidBack, nativeModalProps. Managed body adds tall, footer, closeLabel string or false, stickyHeader, scrollProps. Native body uses body=native and forbids tall/footer/scroll props. |
| SheetProvider | children. Owns BottomSheetModalProvider, provider-local presentation registry and background screen-reader boundary. The native portal host is outside that boundary. Supports nesting; use at both root and batch compose. |
| sheetPresentation | `(tier,tall=false)` returns page only for xxxl and tall. In Sheet.tsx. |
| PickerSheet | children; optional sheetRef, presentOnMount, busy, stickyHeader, onDismiss, androidBack, nativeModalProps, scrollProps. Retains existing defaults and always stays a sheet. |
| usePickerSheetStyles | Existing themed style lookup remains available. |

SheetModal is the private shared modal owner. SheetRef remains compatible with the existing `RefObject<BottomSheetModal|null>` callers. Native props retain native callback composition. `onDismiss` clears shell visibility before caller callbacks. Callers retain business state and success/error decisions.

Only XXXL changes existing primitive control sizes, radii and type. Existing default colors remain unchanged. New primary tone resolves dark text to #c4b5fd when adopted.

Presentation is exclusive: without a ref, presentOnMount may only be true or omitted. With sheetRef, either mount or manual presentation is supported. onClose and onDismiss are exclusive aliases. ValueRow meta and legacy detail are exclusive. busy locks dismissal and handle drag while preserving independent content panning. dismissible=false locks dismissal without changing independent content gestures. An absent backdrop stays absent; a custom backdrop is retained and touch-blocked when locked. Owned Back consumes while locked. PickerSheet explicitly retains its legacy busy content-panning lock.

XXXL tall pages use an absolute-fill, non-grouping common accessibility container, a100% modal, a56-point close action and Android adjustPan keyboard mode. Default/reflow closeLabel=false suppresses the generated action for migrated forms that already own Cancel or Close.
