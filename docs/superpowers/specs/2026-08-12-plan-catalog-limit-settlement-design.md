# Plan Catalog and Limit Settlement Design

## Goal

Keep the plan dialog aligned with Unprice, render Markdown with valid HTML, and report all known model-token consumption when a completed response crosses a billing limit.

## Product Decisions

- The application supports only the known `free`, `pro`, and `enterprise` plan slugs.
- Plan cards use the latest active published Unprice version for each known slug.
- Unprice owns plan titles, descriptions, prices, billing cadence, and visible feature text.
- The application owns plan actions: Pro is self-service and Enterprise is sales-managed.
- A usage event rejected after model generation must still be recorded as billing evidence because the provider cost already occurred.
- Usage evidence never authorizes model generation.

## Plan Catalog

Add a server-only plan-catalog service that calls `planVersions.list` with `onlyPublished: true` and `onlyLatest: true`. It filters the response through the local known-plan slug set, then rejects inactive or archived versions.

The service returns a small client-safe contract:

- plan version ID and known slug
- title and description
- currency and flat price
- billing interval and interval count
- visible feature display text
- whether Unprice marks the plan as Enterprise

A separate authenticated `/api/billing/plans` endpoint exposes this contract. The plan dialog fetches it with SWR. A separate endpoint keeps project-level catalog caching independent from the customer billing profile, which refreshes more often.

The dialog shows an explicit loading state and an error with retry. It does not fall back to static commercial data because a fallback can drift from Unprice. The current-plan badge uses the known plan slug. Enterprise has no upgrade action. Pro keeps the existing self-service upgrade action.

## Valid Markdown Structure

The Markdown renderer assigns ownership by HTML element:

- the `pre` renderer creates the block container and its styles;
- the `code` renderer creates only a `code` element;
- inline code therefore remains `p > code`;
- fenced code remains `pre > code`.

The code renderer does not depend on the removed `inline` property from `react-markdown` v9. No renderer creates a `pre` element while it can be inside a paragraph.

## Usage Settlement

The request continues to perform all access checks and start the budget run before model work. After model generation, the AI SDK supplies the measured prompt and completion token counts.

Settlement follows this sequence:

1. Call `runs.consume` with a stable message-scoped idempotency key.
2. If it is accepted or is a duplicate, close the run as completed.
3. If it is rejected because the entitlement limit was crossed after generation, call `usage.record` with the same measured total and a different stable evidence key.
4. Await `usage.record`; do not detach the promise.
5. Close the run as failed, emit `billing-limit-reached`, and refresh the billing profile in the browser.
6. If either Unprice operation has an API error, log its operation, code, and request ID. Close the run as failed without hiding the original error.

The evidence key is derived from the same customer, chat, and message IDs plus an `evidence` suffix. A retry of the same logical message reuses both settlement keys.

This fallback applies only when model generation produced authoritative usage and synchronous settlement rejected the usage. It does not estimate tokens after a provider error that returned no usage.

## Countdown Display

Keep the five-minute reset as `m:ss`. Format longer periods by scale:

- less than one hour: `m:ss`
- less than one day: `h:mm`
- one day or more: `Xd Yh`

The existing server clock offset remains the source for countdown calculations.

## Error Handling

- Plan catalog API errors do not expose Unprice request details to the browser.
- Missing known plans are omitted individually; one missing plan does not hide the others.
- An empty known-plan result is an explicit catalog error because the dialog would otherwise show no commercial choices.
- A rejected settlement cannot be presented as successful run completion.
- A failed evidence record is observable in server logs and does not start more paid work.

## Testing

Add focused tests for:

- inline code renders without `pre` inside `p`;
- fenced code renders as `pre > code`;
- catalog normalization includes only known, active, latest published versions;
- hidden Unprice features do not appear in the dialog contract;
- accepted and duplicate run settlement do not record a second event;
- entitlement rejection records the exact measured total once with a stable evidence key;
- retry settlement reuses both idempotency keys;
- evidence-record failure closes the run as failed;
- countdown formatting at minute, hour, and day boundaries.

Run focused tests, TypeScript, lint on changed files, and the production build. Then verify inline code, fenced code, a normal response, and a response that crosses the token limit in the browser.

## Tradeoffs

- Dynamic known plans prevent pricing drift but add one catalog request. Short server caching limits that cost.
- Recording rejected post-generation usage can make displayed usage exceed the allowance. This is correct evidence of provider cost and explains why the limit prompt appears.
- `usage.record` is asynchronous inside Unprice even though the application awaits acceptance. The usage card can briefly show the prior value until ingestion completes and SWR refreshes.
- Exact tokens are unavailable when the provider fails before it emits usage. The application does not invent an estimate.

## Out of Scope

- Showing unknown Unprice plans
- Self-service Enterprise assignment
- Changing the Unprice monetization configuration
- Estimating usage when the provider supplies no token counts
- Replacing the current per-message budget-run model
