# Persistent limit banner and stable hydration

## Goal

Keep the upgrade banner visible while the active usage window is exhausted. Remove it after the usage window resets or the user upgrades. Also remove the Radix hydration warning shown on the chat page.

## Root causes

`UpgradePromptProvider` owns banner visibility as local React state. The state starts as `false`, so navigation that remounts the provider or a page reload hides the banner even when the billing service still reports an exhausted allowance.

`ChatHeader` calls `useWindowSize()` with its default initialization. The server receives an undefined width, while the browser can receive its real width during the first render. The conditional New Chat tooltip then changes the Radix component order before hydration. React and Radix generate different IDs for the model selector.

## Design

### Limit state

Add a pure predicate that identifies an exhausted billing profile. A profile is exhausted only when it is ready, has a hard numeric limit, and its usage is greater than or equal to its allowance.

`UpgradePromptProvider` will read the billing profile from the existing SWR cache. The banner will be visible when either:

- the current chat has just emitted a billing-limit event and the refreshed profile has not arrived yet, or
- the current billing profile satisfies the exhausted predicate.

When a ready profile reports available usage, it will clear the temporary event state. This covers a window reset and a successful upgrade. The existing 15-second profile refresh and boundary refresh will update the banner without a reload.

The banner will not have a Dismiss action because dismissal conflicts with the required invariant. The plan dialog can still close without hiding the banner.

### Hydration

Call `useWindowSize({ initializeWithValue: false })` in `ChatHeader`. The server and the first client render will both use an undefined width and produce the same Radix tree. The hook updates the width after hydration and applies the responsive layout.

This keeps the current component structure and avoids a larger CSS or layout rewrite.

## Data flow

```text
chat limit event ───────► temporary limit state ─┐
                                                  ├─► banner visible
billing profile ─► exhausted predicate ──────────┘
       │
       └─ ready and available ─► clear temporary state ─► banner hidden
```

## Error behavior

If the billing profile request fails after a confirmed limit event, the banner stays visible. A transient billing error must not claim that capacity is available. If no limit event exists and the profile fails, the current usage error card remains the only billing warning.

## Tests

- Unit-test the exhausted-profile predicate for exhausted, available, unlimited, pending, and boundary cases.
- Run the existing unit test suite.
- Run TypeScript validation and the production build where the local environment permits it.
- Verify that the chat header produces the same initial responsive branch on the server and client through the explicit hook option.

## Scope

This change does not alter billing enforcement, allowance calculation, plan catalog behavior, or upgrade checkout. It only makes existing billing state visible and stabilizes the initial responsive render.
