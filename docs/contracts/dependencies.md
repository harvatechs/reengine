# Pinned Dependencies Contract (P0-08)

Verified via `npm view` on 2026-11-25 (`R-013`, `R-070`, `R-071`, `R-072`).
All runtime dependencies are pinned with exact versions (no `^` or `~`).

## Direct Runtime Dependencies (19 / 22 budget)

| Package | Pinned Version | License | Unpacked Size | Notes |
|---|---|---|---|---|
| `ink` | `5.1.0` | MIT | ~620 KB | Verified in P0-07 with React 18 & `ink-testing-library@4.0.0` |
| `react` | `18.3.1` | MIT | ~315 KB | Required by `ink@5.1.0` |
| `@modelcontextprotocol/sdk` | `1.32.2` | MIT | 4.49 MB | Verified in P0-03 against `rea@6.4.0` |
| `rea-agents` | `6.4.0` | MIT | ~180 MB | Built-in REA engine (excluded from 25 MB `NFR-DIST-01`; `CP-1`) |
| `zod` | `3.25.76` | MIT | ~650 KB | Compatible with `zod-to-json-schema@3.25.2` & MCP SDK |
| `ajv` | `8.20.0` | MIT | 1.03 MB | Runtime tool-arg JSON Schema validation |
| `ajv-formats` | `3.0.1` | MIT | 57 KB | Format validators for Ajv |
| `commander` | `13.1.0` | MIT | ~190 KB | CLI parser (ADR-016) |
| `jsonc-parser` | `3.3.1` | MIT | 213 KB | Comment-preserving JSONC config edits |
| `pino` | `10.4.0` | MIT | 706 KB | File-only structured logging |
| `undici` | `8.13.1` | MIT | 2.20 MB | `EnvHttpProxyAgent` + HTTP transport |
| `marked` | `18.3.0` | MIT | 620 KB | Markdown lexer |
| `highlight.js` | `11.12.0` | BSD-3-Clause | 5.50 MB | Code block syntax highlighting |
| `diff` | `9.0.0` | BSD-3-Clause | 616 KB | Unified diff generation |
| `fast-glob` | `3.3.3` | MIT | 98 KB | `.gitignore`-aware globbing |
| `ignore` | `7.0.16` | MIT | 134 KB | `.gitignore` filter |
| `execa` | `10.2.1` | MIT | 425 KB | Cross-platform process execution |
| `wrap-ansi` | `10.0.2` | MIT | 26 KB | ANSI-aware line wrapping |
| `string-width` | `9.0.0` | MIT | 17 KB | Unicode/emoji column measurement |

## Optional Runtime Dependencies

| Package | Pinned Version | License | Notes |
|---|---|---|---|
| `@napi-rs/keyring` | `2.1.2` | MIT | OS keychain secret resolution (`keychain:`) |

## Dev Dependencies

`typescript@5.8.2`, `tsup@8.4.0`, `tsx@4.23.15`, `vitest@3.0.7`, `@vitest/coverage-v8@3.0.7`, `ink-testing-library@4.0.0`, `eslint@10.15.0`, `typescript-eslint@8.74.0`, `prettier@3.10.1`, `dependency-cruiser@18.9.0`, `knip@6.48.0`, `@changesets/cli@3.0.3`, `zod-to-json-schema@3.25.2`, `simple-git-hooks@2.14.0`, `@types/node@22.13.9`, `@types/react@18.3.18`.
