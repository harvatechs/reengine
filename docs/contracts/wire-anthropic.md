# Wire Format Contract — Anthropic Messages (`anthropic`)

Captured: 2026-11-25 (P0-06, from official Anthropic Messages API SSE documentation)

## Request Shape
- `POST <baseUrl>/messages` (default `https://api.anthropic.com/v1`)
- Headers: `Content-Type: application/json`, `x-api-key: <key>`, `anthropic-version: 2023-06-01`.
- Body: `{ model, system: string | TextBlock[], messages, tools?, max_tokens, stream: true, thinking?: { type: 'enabled', budget_tokens } }`.
- Prompt caching (`FR-PRV-11`): `cache_control: { type: 'ephemeral' }` on `system` block, final `tools` entry, and rolling prefix user/assistant message block.

## SSE Stream Events
1. `event: message_start` → `message.usage`: `{ input_tokens, output_tokens, cache_read_input_tokens?, cache_creation_input_tokens? }`.
2. `event: content_block_start` → `index`, `content_block`:
   - `{ type: 'text', text: '' }`
   - `{ type: 'thinking', thinking: '' }`
   - `{ type: 'tool_use', id, name, input: {} }`
3. `event: content_block_delta` → `index`, `delta`:
   - `{ type: 'text_delta', text }`
   - `{ type: 'thinking_delta', thinking }`
   - `{ type: 'signature_delta', signature }`
   - `{ type: 'input_json_delta', partial_json }`
4. `event: content_block_stop` → `index`.
5. `event: message_delta` → `delta: { stop_reason: 'end_turn' | 'tool_use' | 'max_tokens' | 'stop_sequence' }`, `usage: { output_tokens }`.
6. `event: message_stop` → end of stream.
- `event: ping` → ignore (resets idle timeout).
- `event: error` → `{ error: { type, message } }`.

## Error Mapping
- `401`/`403` / `authentication_error` → `auth`
- `429` / `rate_limit_error` → `rate_limit`
- `529` / `overloaded_error` / `5xx` → `overloaded`
- `400` / `413` (`prompt is too long`, `input length and max_tokens exceed context limit`) → `context_length`
