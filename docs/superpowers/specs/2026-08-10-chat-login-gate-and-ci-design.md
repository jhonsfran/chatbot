# Chat Login Gate and CI Repair Design

## Goal

Let anonymous visitors see and draft in the root chat UI. Require a regular,
registered session before any message generation or file upload. Repair the
Playwright workflow without embedding credentials in source control.

## Current State

The root page redirects visitors to `/api/auth/guest`. This creates a guest
session that can generate messages. The chat route allows every session type.
The Playwright workflow maps four GitHub Actions secrets into its environment,
but the repository currently has no Actions secrets. The upgraded Auth.js path
therefore fails with `MissingSecret` before tests can run.

## Chosen Design

### CI configuration

Copy these existing local values to GitHub Actions secrets for
`jhonsfran/chatbot`: `AUTH_SECRET`, `POSTGRES_URL`,
`BLOB_READ_WRITE_TOKEN`, and `REDIS_URL`. The values must never be printed or
committed. The existing workflow already reads these names, so no workflow
source change is required for the observed failure.

Rerun the failed Playwright workflow after the secrets are present. If it
exposes another failure, investigate that failure separately. Do not copy
unrelated local credentials.

### Public chat and login gate

Only the root route (`/`) is public. An anonymous visitor sees the empty chat
UI and can enter text, but has no usable server session.

Submitting text with Enter or the send button, selecting a suggested prompt,
or loading a root-page query prompt opens a login dialog. The dialog uses the
existing credentials sign-in flow and links to registration. It preserves the
draft text through the existing local-storage behaviour. A successful sign-in
refreshes the page so the same draft can be submitted as a regular user.

Chat-specific routes (`/chat/:id`) remain private. The application does not
create guest sessions for new visitors. Existing guest sessions are treated as
anonymous for this feature.

### Server enforcement

Middleware lets anonymous visitors load `/`, permits Auth.js endpoints, and
returns HTTP 401 for other application API requests unless the token belongs
to a regular user.

The chat and upload route handlers also require a regular session. These
checks prevent a crafted request from bypassing the dialog or middleware.
The guest-auth endpoint and guest provider are removed because the app no
longer supports anonymous accounts.

### Components

Extract the reusable credentials sign-in form from the login page. Use it in a
new login-gate dialog and keep `/login` as its full-page route. Pass one
explicit authentication capability from the root server page into `Chat`.
`Chat`, `MultimodalInput`, and `SuggestedActions` use that capability to
either submit normally or open the dialog. Header controls remain visible but
cannot produce server-side state for anonymous visitors.

### Tests

Replace guest-session tests with these cases:

- An anonymous visitor loads `/` without a guest redirect and sees the input.
- Enter, send, a suggested prompt, and a root-page query open the login gate
  without requesting `/api/chat`.
- Anonymous and legacy guest requests to chat and upload APIs receive 401.
- A registered user can sign in, send a message, and upload a file as before.

## Trade-offs

The dialog-plus-server gate adds a small client-state boundary, but it meets
the requested browse-first experience and keeps authorization trustworthy.
A client-only dialog would be easier but insecure. Redirecting before render
would be simpler but would hide the chatbot. A fixed CI secret in the workflow
would avoid secret setup, but it would still leave database, blob, and Redis
credentials missing and would place configuration in source control.

## Acceptance Criteria

- The GitHub workflow receives its required four secrets and starts Playwright
  without Auth.js `MissingSecret` errors.
- `/` renders for visitors without an Auth.js session.
- No anonymous or guest request can create a chat, send a message, or upload a
  file.
- The login dialog appears at every client message-submit entry point.
- Registered-user chat behaviour remains unchanged.
