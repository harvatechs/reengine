# Wire Format Contract — OpenAI-Compatible (`openai-compatible`)

Captured: 2026-11-25 (P0-06, from official OpenAI Chat Completions API SSE documentation)

## Request Shape
- `POST <baseUrl>/chat/completions`
- Headers: `Content-Type: application/json`, `Authorization: Bearer <key>` (or custom `auth.header`), plus `headers`.
- Body: `{ model, messages, tools?, stream: true, stream_options?: { include_usage: true }, [compat.maxTokensParam]: maxOutputTokens, [compat.reasoningParam]?: ... }`
- Roles: `compat.systemRole` (`system` or `developer`), `user`, `assistant` (with `tool_calls`), `tool` (`tool_call_id`, `content`).

## SSE Stream Events
- `data: <JSON>\n\n` where `<JSON>` is `chat.completion.chunk`:
  - `choices[0].delta.content`: incremental assistant text.
  - `choices[0].delta.reasoning_content` / `reasoning` (compat-dependent): incremental reasoning text.
  - `choices[0].delta.tool_calls`: array of `{ index, id?, type?: 'function', function?: { name?, arguments? } }`. Concatenate `arguments` per `index`. Synthesize `id` if missing/duplicated.
  - `choices[0].finish_reason`: `'stop' | 'tool_calls' | 'length' | 'content_filter' | null`.
  - Final usage chunk (when `include_usage: true`): `choices: []`, `usage: { prompt_tokens, completion_tokens, total_tokens, prompt_tokens_details?: { cached_tokens }, completion_tokens_details?: { reasoning_tokens } }`.
- Termination sentinel: `data: [DONE]`.

## Error Mapping
- `401`/`403` → `auth` (non-retryable)
- `429` → `rate_limit` (retryable pre-first-byte, honor `Retry-After`)
- `500`/`502`/`503`/`504`/`408` → `overloaded` / `timeout` (retryable pre-first-byte)
- `400`/`413` with context-length message (`maximum context length`, `context_length_exceeded`, `too many tokens`) → `context_length`
