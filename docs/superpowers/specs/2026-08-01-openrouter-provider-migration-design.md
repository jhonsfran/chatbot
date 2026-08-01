# OpenRouter provider migration

## Goal

Route the chatbot's existing Grok models through OpenRouter instead of directly
through xAI, without changing the model aliases consumed elsewhere in the app.

## Scope

- Replace the xAI SDK dependency and provider import with the OpenRouter AI SDK
  provider release compatible with the app's AI SDK v4 runtime.
- Keep `myProvider`, test doubles, streaming, tool calls, and the public model
  aliases unchanged.
- Route the aliases to these OpenRouter model IDs:
  - `chat-model`: `x-ai/grok-2-vision-1212`
  - `chat-model-reasoning`: `x-ai/grok-3-mini`
  - `title-model` and `artifact-model`: `x-ai/grok-2-1212`
  - `small-model`: `x-ai/grok-imagine-image`
- Continue using the current reasoning middleware.
- Replace setup documentation for `XAI_API_KEY` with `OPENROUTER_API_KEY` and
  update OpenRouter-related deployment references.

## Constraints and trade-offs

The migration intentionally avoids an AI SDK major-version upgrade, because
that would also require changes to the application's established UI streaming
protocol. The OpenRouter model names are provider-qualified. The former
`grok-3-mini-beta` model uses OpenRouter's current `x-ai/grok-3-mini` ID.
`grok-2-image` is unavailable through OpenRouter, so image artifacts move to
the approved current xAI image model, `x-ai/grok-imagine-image`.

## Verification

- Install and lock the compatible dependency set.
- Run TypeScript checking and the production build.
- Confirm the test provider still resolves the same aliases.
- A live generation smoke test is left to an environment with a valid
  `OPENROUTER_API_KEY`.
