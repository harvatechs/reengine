# Wire Format Contract — Google Gemini (`gemini`)

Captured: 2026-11-25 (P0-06, from official Google Gemini `streamGenerateContent?alt=sse` documentation)

## Request Shape
- `POST <baseUrl>/models/<model>:streamGenerateContent?alt=sse` (default `https://generativelanguage.googleapis.com/v1beta`)
- Headers: `Content-Type: application/json`, `x-goog-api-key: <key>`.
- Body: `{ systemInstruction?: { parts: [{ text }] }, contents: [{ role: 'user'|'model', parts: [...] }], tools?: [{ functionDeclarations: [...] }], generationConfig?: { maxOutputTokens, temperature?, thinkingConfig?: { thinkingBudget?: number, includeThoughts?: boolean } } }`.

## SSE Stream Events
- `data: <GenerateContentResponse JSON>\n\n`:
  - `candidates[0].content.parts[]`:
    - `{ thought: true, text }` → `reasoning_delta`
    - `{ text }` → `text_delta`
    - `{ functionCall: { name, args } }` → whole tool call (`tool_call_start` + `tool_call_delta(JSON.stringify(args))` + `tool_call_end`, synthesized `call_<id>`)
  - `candidates[0].finishReason`: `'STOP' | 'MAX_TOKENS' | 'SAFETY' | 'RECITATION' | ...`. (Note: Gemini returns `STOP` even when `functionCall` parts were emitted; adapter emits `finish('tool_calls')` if any tool calls occurred in the turn.)
  - `usageMetadata`: `{ promptTokenCount, candidatesTokenCount, thoughtsTokenCount?, cachedContentTokenCount?, totalTokenCount }`.

## Error Mapping
- `401`/`403` → `auth`
- `429` / `RESOURCE_EXHAUSTED` → `rate_limit`
- `500`/`503` / `UNAVAILABLE` → `overloaded`
- `400` (`exceeds the maximum number of tokens`, `input token count exceeds`) → `context_length`
