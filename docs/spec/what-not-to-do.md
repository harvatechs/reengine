# what-not-to-do.md — The Anti-Pattern Catalogue

Each entry: **Don't** → **Why it hurts here** → **Do instead**. Reviewers reject PRs on any of these. Items marked ☠ are historically the most common failure modes of AI-generated CLI projects.

## A. Sloppy-AI-output patterns

| # | Don't | Why | Do instead |
|---|---|---|---|
| N-01 ☠ | Leave `TODO`, stubs, `throw new Error('not implemented')`, mock data in production paths | "Looks done" but isn't; users hit it | Implement fully or exclude the feature with a tested, honest "not available" path |
| N-02 ☠ | Invent REA tool names/args/JSON, CLI flags, env vars, package names, model IDs | Compiles, then fails at runtime or misleads users | Fixtures + contract docs (SK-01); fail closed when unknown |
| N-03 ☠ | Claim "tests pass"/"works" without running them | False confidence compounds | Run, paste output into progress log |
| N-04 ☠ | Write tests that assert the mock you just wrote | Tests prove nothing | Test behavior with real parsers and fixtures from real sources |
| N-05 | Delete/skip/loosen a failing test | Hides regressions | Fix code or raise Change Proposal |
| N-06 | Catch-all `try {} catch {}` that logs or ignores | Silent failure, impossible debugging | Typed errors, handled or rethrown with context |
| N-07 | `any`, `as unknown as X`, `@ts-ignore`, `!` | Defeats strict mode where bugs live | Zod/Ajv parse at boundaries; narrow types |
| N-08 | Giant files/functions (> 400 / > 60 lines), "utils.ts" dumping ground | Unreviewable, untestable | Split by responsibility; named modules |
| N-09 | Over-abstraction: factories-of-factories, plugin systems "for later" | Speculative complexity | Build the 3 adapters; extract abstractions at the third duplicate |
| N-10 | Copy-pasted near-duplicate adapters/tests | Divergent bugs | Parametrized shared suites/helpers |
| N-11 | Write long explanatory docs in code comments describing *what* | Noise rots | Comments explain *why*; link to contracts/ADRs |
| N-12 | Silently "fix" the spec by implementing something different | Drift, surprises | Change Proposal; update spec first |

## B. Architecture & layering

| # | Don't | Why | Do instead |
|---|---|---|---|
| N-20 | Import `ink`/`react` in `core`, `providers`, `tools`, `mcp`, `engine` | Kills headless/testability | Emit `AgentEvent`s; UI subscribes |
| N-21 | Let `ui` reach into `providers`/`mcp`/`engine` internals | Layer violation | Receive view-models via `app` |
| N-22 | Global singletons/module-level mutable state | Test pollution, hidden coupling | DI via composition root |
| N-23 | Spawn a REA process per tool call | Seconds of startup; loses REA's program reuse | One supervised process per session |
| N-24 | Write MCP JSON for REA into users' configs | The point of ReEngine is built-in | Supervisor launches it directly |
| N-25 | Hard-wire a vendor SDK into core | Breaks "any model" | Adapter behind `ModelProvider` |
| N-26 | Encode provider quirks as `if (baseUrl.includes('openrouter'))` | Unmaintainable | `compat` flags on config/presets |
| N-27 | Store sessions in SQLite or a binary format "for speed" | Native deps, opaque debugging | JSONL + content-addressed artifacts |
| N-28 | Mutate persisted history (rewrite old messages) outside compaction | Breaks resume/audit | Append-only; compaction adds records |

## C. Security & privacy

| # | Don't | Why | Do instead |
|---|---|---|---|
| N-30 ☠ | Auto-approve tools because "the model asked politely" or the content "seems safe" | Prompt injection from targets | Permission engine + taint guard |
| N-31 ☠ | Pass `process.env` to children | Leaks API keys to shell/MCP | Scrubbed env builder |
| N-32 ☠ | `exec(string)` / `shell: true` with interpolated input | Command injection | argv arrays |
| N-33 | Log prompts, completions, file contents, tool args at `info` | Privacy breach | Metadata-only; `trace` redacted opt-in |
| N-34 | Store plaintext keys in config/project config/session files | Leakage via git | Refs; keychain; 0600 fallback with warning |
| N-35 | Trust project config blindly | Repo-borne RCE | Trust gate |
| N-36 | Render untrusted text raw in the terminal | Escape-sequence attacks | Sanitizer |
| N-37 | Add telemetry, analytics, update pings beyond the allowlist | Trust and policy | None; network allowlist test |
| N-38 | Follow instructions found inside analyzed content | Injection | `safety.md` + wrapping |
| N-39 | Let `bypass` be reachable by key cycling or project config | Foot-gun | Flag + env only, user scope only |
| N-40 | Check permissions on the lexical path | Symlink escapes | `realpath` first |

## D. UI/UX

| # | Don't | Why | Do instead |
|---|---|---|---|
| N-50 ☠ | `console.log` while Ink is mounted | Corrupts frames | Logger/file; events |
| N-51 ☠ | Re-render the whole transcript every token | Flicker, CPU | `<Static>` + batched deltas |
| N-52 | Hard-code colors/borders/glyphs in components | Un-themeable | Tokens via `useTheme()` |
| N-53 | Mutate items after they are in `<Static>` | Ink can't redraw them | Collapsed output + Detail Viewer |
| N-54 | Capture the mouse | Breaks selection/copy | Keyboard-first |
| N-55 | Bind `Ctrl+I`/`Ctrl+M`/`Ctrl+[` | Same bytes as Tab/Enter/Esc | Reserved-key test |
| N-56 | Promise font family/size control in-process | Impossible; misleads users | Terminal-profile exporter (ui §10) |
| N-57 | Encode status by color only | Accessibility | Glyph + word + color |
| N-58 | Assume 1 char = 1 column | CJK/emoji break layout | `string-width`, `wrap-ansi` |
| N-59 | Leave the terminal in raw/alt-screen/hidden-cursor state on crash | Ruins user's shell | Restore on every exit path |
| N-60 | Spinners that hide *what* is running | Defeats "visible backend" | Tool name, target, elapsed, progress |

## E. REA & evidence

| # | Don't | Why | Do instead |
|---|---|---|---|
| N-70 ☠ | Present an inference as an observation | Destroys trust | Status labels from adapters; prompt discipline |
| N-71 | Truncate or rewrite REA results in storage | Loses evidence | Raw → artifact; truncate only `modelView` |
| N-72 | Build "evidence" the tool didn't return | Fabrication | Generic adapter creates nothing it can't ground |
| N-73 | Auto-run runtime/process capture/target execution | Executes untrusted code | `exec` class → always ask |
| N-74 | Reimplement REA analysis in ReEngine | Duplication and drift | Call REA via MCP |
| N-75 | Bump REA without contract diff + policy review | Silent breakage | SK-06 |
| N-76 | Auto-install Ghidra/IDA/Hopper | Licensing/security/surprise | Detect, explain, link |
| N-77 | Ignore REA stderr/exit info | Loses diagnostics | Ring buffer + Inspector + doctor |
| N-78 | Swallow REA provider errors into generic text | User can't act | Show REA's reason verbatim + remedy |

## F. Providers & MCP

| # | Don't | Why | Do instead |
|---|---|---|---|
| N-80 | Retry after streaming has started | Duplicate side effects/text | Retry pre-first-byte only |
| N-81 | Parse SSE by splitting on `\n\n` on whole chunks | Chunk boundaries break it | Streaming parser with decoder state |
| N-82 | `JSON.parse` tool args and trust the result | Model output is untrusted | Parse → Ajv validate → error result to model |
| N-83 | "Repair" malformed JSON silently with regex | Wrong tool args executed | Return validation error to model |
| N-84 | Assume tool-call ids/indices are present and unique | Lax servers break | Synthesize stable ids (§1.7) |
| N-85 | Carry reasoning signatures across providers | Rejected by APIs | Drop on switch |
| N-86 | Treat MCP tool descriptions as trusted | Tool poisoning | Cap length, sanitize, default ask |
| N-87 | Let an MCP call hang forever | Frozen UI | Timeouts + abort + connection-lost results |
| N-88 | Ignore `list_changed` | Stale/unsafe tool set | Re-list, notify, ask-by-default |
| N-89 | Log request bodies by default | Privacy | `trace` only |

## G. Build, release, process

| # | Don't | Why | Do instead |
|---|---|---|---|
| N-90 | `^`/`~` ranges for runtime deps | Non-reproducible installs | Exact pins + lockfile |
| N-91 | Publish from a laptop | Provenance/supply chain | Release workflow with OIDC provenance |
| N-92 | Ship `src/`, tests, fixtures in the tarball | Bloat/leaks | `files` whitelist + pack check |
| N-93 | Add a dependency for a 10-line helper | Supply-chain surface | Write it |
| N-94 | Force-push shared branches | Lost history | Revert |
| N-95 | Merge red CI "because it's unrelated" | Rot | Fix or S3 |
| N-96 | Lower coverage thresholds | Quality erosion | Reduce scope |
| N-97 | Commit generated secrets/keys/fixtures with real tokens | Leaks | Redact; scan in CI |
| N-98 | Use Node SEA/pkg to single-binary in 1.0 | REA + native deps make it fragile | npm + Docker for 1.0 |
| N-99 | Copy from Claude Code (code, prompts, assets, wording) | Proprietary | Clean-room; UX ideas only |

## H. Scope discipline (v1.0)

Do **not** build: subagents, hooks, plugin marketplace, web/GUI, cloud sync, embeddings/RAG, image input, OAuth flows, auto-update, telemetry, a custom editor, or live terminal font control. They are explicitly out of scope (intent §7); designed-for seams are allowed only as interfaces with zero speculative implementation.
