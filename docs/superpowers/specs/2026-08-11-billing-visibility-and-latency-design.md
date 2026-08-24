# Billing Visibility and Latency Design

## Goal

Make signup and chat feel fast, make usage and plan state visible, give Enterprise a clear sales-managed feature set, and use short billing periods for the demo.

## Current Problems

- Signup waits for the remote Unprice customer request before it creates the session.
- A chat message waits for feature checks, a budget reservation, database writes, and first-chat title generation before the model stream starts.
- The sidebar has no persistent usage view. Its existing upgrade card starts hidden and appears only when another component opens the upgrade prompt.
- Enterprise access is enforced for artifact tools on the server, but the interface does not show the plan or its benefits.
- All plan versions bill monthly, and the Free token limit resets daily. This makes the billing lifecycle hard to see in a short demo.

## Product Decisions

- Unprice remains the source of truth for subscriptions, usage, limits, and feature access.
- Enterprise remains sales-assigned. Users cannot select it from the application.
- A persistent usage card and a limit-triggered upgrade card are separate components.
- All plans use a 15-minute billing cycle in the demo.
- Token limits reset every 5 minutes.
- Existing prices and token amounts stay unchanged for the demo.
- Enterprise includes artifact tools and public chat sharing. Free and Pro show these features as locked.

## Architecture

### Billing profile

Add one server-only billing-profile service. It reads the active subscription and feature checks from Unprice in parallel, then returns a normalized application type:

- provisioning state: `pending`, `ready`, or `failed`
- current plan: `free`, `pro`, or `enterprise`
- subscription cycle start and end
- token usage, hard limit or included allowance, and the next five-minute reset time
- reasoning, artifact-tool, and public-sharing access
- whether the plan can be changed in the application

The billing API exposes this profile to the authenticated user. The sidebar uses the same response contract. Chat enforcement calls the same server-only feature primitives, so UI display and server policy cannot drift.

Flat entitlements can use a short in-process cache. The cache key is the Unprice customer ID, and the maximum lifetime is 15 seconds. A successful plan change clears the entry. Token usage and budget state are never cached.

### Signup provisioning

Extend the local user record with a billing provisioning state and an optional failure message. Registration creates the local user and authenticated session first. A Next.js `after` task provisions the Unprice customer and stores the customer ID.

The chat page loads while provisioning continues. The usage card shows `Setting up billing…` and polls the billing-profile endpoint. If provisioning fails, the card shows a retry action. The retry endpoint uses an atomic database claim so only one request can provision a user at a time. A stale `provisioning` claim can return to `pending` after a fixed timeout.

The message endpoint rejects requests with a specific `billing_setup_pending` response until provisioning is ready. The composer shows a direct setup message instead of a generic service error.

### Message critical path

For each message, first load the chat, local user, and previous messages together. After the local user supplies the Unprice customer ID, start these independent remote operations together:

- check total-token access
- check model, artifact, and sharing access as required
- reserve the chat budget

The server validates all results before model generation. If a feature check fails after a budget reservation succeeds, the server closes the reservation as failed.

For a new chat, save a short deterministic title with the chat row. Generate the higher-quality title after streaming begins and update the row when it is ready. This removes the title model call from time to first token.

Usage consumption, assistant-message persistence, budget completion, and final title work stay outside the time-to-first-token path.

## User Interface

### Persistent usage card

The sidebar always shows a compact usage card for a registered user. It contains:

- current plan name and status
- used tokens and token limit
- a progress bar
- `Resets in …` for the five-minute token window
- `Renews in …` for the 15-minute billing cycle
- a `Manage plan` action

The card has explicit skeleton, provisioning, ready, and failed states. It refreshes after message completion, on window focus, and when either countdown reaches zero.

### Limit-triggered upgrade card

Keep the upgrade card hidden during normal use. Show it only when a server response reports `LIMIT_EXCEEDED`, `RUN_BUDGET_EXCEEDED`, or `WALLET_EMPTY`. Dismissing it hides it until the next limit response.

### Plan management

The plan dialog shows Free, Pro, and Enterprise together:

- Free shows its token allowance and basic chat access.
- Pro shows reasoning access and the existing upgrade action.
- Enterprise shows reasoning, artifact tools, and public sharing with a `Managed by sales` label.

The dialog does not offer an Enterprise upgrade button. The next billing-profile refresh reflects a sales-assigned Enterprise plan.

### Enterprise feature visibility

Add a `public-chat-sharing` Unprice feature to Enterprise. The visibility selector displays Public with an Enterprise lock for Free and Pro. Every server path that creates or changes public visibility also rejects the change without this entitlement. The plan dialog identifies artifact tools as an Enterprise capability.

## Demo Monetization Configuration

For Free, Pro, and Enterprise plan versions:

- set `billingConfig.interval` to `minute`
- set `billingConfig.intervalCount` to `15`
- use a clear billing configuration name such as `demo-15-minute`

For each `total-tokens` plan feature:

- set `resetConfig.interval` to `minute`
- set `resetConfig.intervalCount` to `5`

Free retains its hard 10,000-token limit. Pro and Enterprise retain the first 1,000,000 tokens as their included allowance, then use the existing overage price. The usage card reads the hard limit or included tier boundary from the active plan data. It does not turn the Pro and Enterprise allowance into a hard limit.

## Errors and Recovery

- Provisioning errors are stored as safe user-facing states. Detailed Unprice request IDs remain in server logs.
- Billing-profile failures keep the chat history usable but disable new sends until policy can be verified.
- A failed parallel access check closes any budget reservation that started in the same request.
- Plan changes and provisioning retries are idempotent.
- Countdown displays use server timestamps to avoid client clock drift.

## Testing

Add focused tests for:

- registration returns before delayed Unprice provisioning finishes
- concurrent provisioning retries result in one remote signup
- billing-profile normalization for Free, Pro, Enterprise, pending, and failed users
- five-minute usage reset and 15-minute renewal timestamps
- the persistent usage card states and refresh rules
- upgrade-card visibility only after limit errors
- Enterprise-only public sharing in both the selector and chat API
- message orchestration starts independent billing operations in parallel
- first-chat title generation does not block the response stream
- budget reservations close when a parallel access check fails

Run type checking, linting, focused tests, and the production build. Verify signup, first message, later messages, a five-minute usage reset, a 15-minute renewal, Pro upgrade, and a sales-assigned Enterprise account in the browser.

## Tradeoffs

- Background provisioning makes signup fast but introduces a short pending state. The explicit status and retry flow make that state safe.
- A 15-second cache reduces repeated flat-entitlement calls but can delay a sales-assigned Enterprise change by at most 15 seconds. Manual refresh and plan changes invalidate it.
- Deferred title generation can briefly show a simple title. It does not delay the answer.
- Demo prices are charged every 15 minutes in the sandbox. This configuration must not be published as a production pricing model.

## Out of Scope

- Self-service Enterprise purchase or downgrade
- A local billing ledger or webhook-based subscription mirror
- Production monthly pricing changes
- Changes to the model provider or model output speed
