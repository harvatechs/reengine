# ui-design-spec.md — Terminal UI Specification

Stack: Ink (React for terminals) + our own components. The UI is a **pure consumer of `AgentEvent`s and a reducer-driven store**; it imports nothing from `providers/`, `mcp/`, `engine/` internals (it receives view-models through the app layer).

## 1. Design principles

1. **Calm by default.** One accent color, generous alignment, no chrome that doesn't carry information.
2. **The backend is visible, not noisy.** Every tool call and engine state is observable in one glance; details are one keystroke away.
3. **Native terminal behavior wins.** No mouse capture by default (selection/copy keep working); scrollback is the terminal's; alt-screen is used *only* for the Detail Viewer and pickers that need it.
4. **Everything is a token.** No hard-coded color, border, glyph or spacing literal outside `ui/theme/` (ESLint rule `reengine/no-ui-literals` enforces).
5. **Degrade, never break.** 16-color, `NO_COLOR`, ASCII glyphs, 60 columns, non-UTF-8 locales all remain usable.

## 2. Layout

```
┌ scrollback (terminal-native, rendered via <Static>) ───────────────────────┐
│  ▍You  Analyze ./app and explain how its IPC works                          │
│                                                                              │
│  ◆ ReEngine                                                                  │
│    I'll start by mapping modules and Electron boundaries…                   │
│    ✓ mcp__rea__analyze_javascript_application  ./app            4.2 s       │
│        14 modules · 6 IPC channels · 2 preload bridges            [Ctrl+O]   │
│    ✎ edit_file  src/ipc.ts                                         ✓ applied │
└──────────────────────────────────────────────────────────────────────────────┘
┌ live region (Ink dynamic) ───────────────────────────────────────────────────┐
│  ⠋ mcp__rea__open_binary  ./bin/target     00:12  importing… 62%             │ ← Activity lane
│  ◆ streaming assistant text…▌                                                │ ← Streaming item
│  ☐ map IPC channels  ☑ inspect preload  ☐ write report                       │ ← Todo strip (opt)
├──────────────────────────────────────────────────────────────────────────────┤
│ ❯ message… (Enter send · Shift+Enter newline · / commands · @ files)         │ ← Composer
├──────────────────────────────────────────────────────────────────────────────┤
│ default │ claude-sonnet-5-5 │ ctx 34% │ $0.12 │ REA ● ghidra │ ~/proj/app    │ ← Status bar
└──────────────────────────────────────────────────────────────────────────────┘
```

**Inspector panel** (toggle `Ctrl+G`; right side if width ≥ 110 else full-width overlay): sections *Engine* (state, version, provider, pid, uptime, restart count, last 20 stderr lines), *MCP servers* (state, tool count, latency), *Targets*, *Evidence* (list with status icons), *Session* (id, tokens, cost, steps).

**Detail Viewer** (`Ctrl+O` on the last tool card, or `/output <callId>`): alternate screen, full tool output (artifact), scroll with arrows/PgUp/PgDn/`g`/`G`, search `/`, `Esc` returns. Syntax-highlights JSON, code, assembly.

**Header:** none by default (saves rows). A one-line banner is printed once at startup into scrollback: `ReEngine 1.0.0 · REA 6.x · type /help`.

## 3. Component inventory (`src/ui/components/`)

| Component | Responsibility | Key states |
|---|---|---|
| `App` | Provider tree, global key handling, screen routing | — |
| `Transcript` | `<Static>` of finalized items | — |
| `UserMessage` | Accent bar + text, pasted-block chips | — |
| `AssistantMessage` | Streaming markdown | streaming / final |
| `Reasoning` | Dim text per `ui.showReasoning` | hidden / collapsed(1 line + token count) / full |
| `ToolCard` | One tool call | pending, awaiting-permission, running(progress), success, error, cancelled, denied |
| `ActivityLane` | In-flight tool cards (live region) | 0–N, parallel |
| `EvidenceList`/`EvidenceBadge` | Evidence records with status icon+color+limitations | observed/inferred/unknown |
| `DiffView` | Unified diff, line numbers, add/remove bg tokens | collapsed/expanded |
| `CodeBlock` | Highlighted code with language label; `asm` uses RE tokenizer | — |
| `Markdown` | `marked` lexer → Ink nodes: headings, lists, tables (width-aware), quotes, code, links (OSC 8 if supported) | — |
| `Composer` | Multiline input, history, paste handling, completions | idle/streaming-disabled/permission-locked |
| `SlashPalette` | Fuzzy command list with descriptions | closed/open |
| `PermissionPrompt` | Tool summary, preview (diff/command/json), 5 choices, tainted banner | — |
| `StatusBar` | Mode · model · context% · cost · engine chip · cwd | segments collapse by priority at narrow widths |
| `EngineChip` | `REA ● ready · ghidra` / `REA ◐ starting` / `REA ✕ unavailable` | per supervisor state |
| `Inspector`, `DetailViewer` | See §2 | — |
| `ModelPicker`, `ThemePicker`, `SessionPicker`, `HelpOverlay`, `SetupWizard`, `ConfigEditor` | Overlays/screens | — |
| `Toast/Notice` | One-line non-blocking notices (3 s) | info/warn |

## 4. Interaction flows

- **Send:** Enter submits; while a turn runs, the composer stays editable and queues **one** next message (shown dimmed above the composer, `Esc` clears it).
- **Cancel:** `Esc` once → cancel current turn (tools aborted, transcript marked `⏹ cancelled`). `Ctrl+C` while running = same; `Ctrl+C` on idle composer with text clears it; on empty composer press twice within 2 s to exit; `Ctrl+D` on empty composer exits.
- **Permission prompt:** keys `y` allow once · `s` allow for session · `p` allow + save project rule · `n` deny · `f` deny with feedback (opens one-line input). Arrow keys + Enter also work. Banner when `tainted` explains why *always-allow* options are disabled.
- **Paste:** bracketed paste enabled; pastes > 10 lines or > 1000 chars collapse to chip `[Pasted 342 lines #1]`, expanded on send, removable with Backspace as one unit.
- **Completions:** `/` slash palette; `@` path completion (workspace + targets, `.gitignore`-aware); `@server:resource` for MCP resources (S); Tab accepts, Esc dismisses.
- **Mode cycle:** `Shift+Tab` cycles `default → acceptEdits → plan`; status bar updates; `bypass` is never reachable by cycling.
- **Resize:** re-measure on `SIGWINCH`/Ink stdout resize; wrapping recomputed; no duplicated frames.
- **Streaming end:** assistant item and finished tool cards graduate to `<Static>` in order; live region shrinks.

## 5. Rendering rules (prevent flicker/corruption)

1. Only in-flight items are in the live region; everything else is `<Static>`. Items are immutable once static (hence collapsed tool output + Detail Viewer instead of in-place expand).
2. Batch text deltas on a 33 ms timer; never `setState` per token.
3. Width: measure with `string-width`; wrap with `wrap-ansi`; never assume 1 char = 1 column (CJK, emoji).
4. **Sanitize all untrusted text** (model/tool/MCP/file content) before rendering: strip C0/C1 control characters except `\n` `\t`, strip ESC sequences (CSI/OSC/DCS/APC) entirely. Our own OSC 8 hyperlinks are emitted only by the `Markdown` component after URL validation (`http`, `https`, `file`, `mailto`). Property test with random escape payloads.
5. Tables wider than the terminal switch to key/value stacked layout.
6. Frame budget ≤ 30 fps; Ink `maxFps` set accordingly; heavy highlighting runs once per finalized block (memoized by content hash).
7. No output to stdout/stderr from anywhere except Ink (logger is file-only).
8. On exit (any path) restore terminal: show cursor, disable bracketed paste, leave alt screen, reset title if we set it. Unhandled-exception handler performs the same restore before printing the error.

## 6. Theme schema (`schemas/theme.v1.schema.json`)

Colors accept `#RRGGBB`, `#RGB`, `ansi:<black|red|green|yellow|blue|magenta|cyan|white|brightBlack|…>`, or `inherit` (terminal default). Downsampling: truecolor → 256 → 16 by nearest-color; `NO_COLOR` strips all color but keeps bold/dim/underline/reverse semantics (`textStyles`).

```jsonc
{
  "$schema": "…/theme.v1.schema.json",
  "version": 1,
  "name": "my-theme",
  "extends": "reengine-dark",            // optional: inherit then override
  "colors": {
    "text":     { "primary": "", "muted": "", "dim": "", "inverse": "" },
    "brand":    { "accent": "", "accentAlt": "" },
    "status":   { "success": "", "warning": "", "danger": "", "info": "" },
    "surface":  { "border": "", "borderFocus": "", "codeBg": "", "selectionBg": "" },
    "chat":     { "user": "", "assistant": "", "system": "", "reasoning": "" },
    "tool":     { "name": "", "pending": "", "running": "", "success": "", "error": "" },
    "diff":     { "add": "", "remove": "", "addBg": "", "removeBg": "", "hunk": "" },
    "syntax":   { "keyword": "", "string": "", "number": "", "comment": "", "function": "", "type": "", "operator": "", "variable": "", "punctuation": "" },
    "asm":      { "address": "", "bytes": "", "mnemonic": "", "register": "", "immediate": "", "label": "", "string": "", "comment": "" },
    "evidence": { "accent": "", "observed": "", "inferred": "", "unknown": "" },
    "link": ""
  },
  "textStyles": { "emphasis": "bold", "heading": "bold", "link": "underline", "muted": "dim" },
  "glyphOverrides": { "success": "✓", "error": "✗", "running": "⠋", "bullet": "•", "prompt": "❯", "quote": "▍", "assistant": "◆" }
}
```

Rules: every token is **required after `extends` resolution** (validated); a unit test asserts all tokens referenced in components exist in the schema and that all built-in themes define all tokens. `theme validate` reports WCAG contrast ratios for `text.primary`, `text.muted`, `status.*`, `evidence.*` against a user-declared `surfaceBackground` (default assumption dark `#000`/light `#fff`); warn < 4.5:1, fail < 3:1 for `primary`.

## 7. Built-in themes

`reengine-dark` (default) · `reengine-light` · `high-contrast` · `mono` (no hues; relies on bold/dim/reverse; safe for color-blind and 16-color) · `solarized`.

**`reengine-dark`**

```json
{
  "version": 1, "name": "reengine-dark",
  "colors": {
    "text": { "primary": "#E6E6E6", "muted": "#9AA1AE", "dim": "#667085", "inverse": "#0B0D12" },
    "brand": { "accent": "#7AA2F7", "accentAlt": "#BB9AF7" },
    "status": { "success": "#9ECE6A", "warning": "#E0AF68", "danger": "#F7768E", "info": "#7DCFFF" },
    "surface": { "border": "#3B4252", "borderFocus": "#7AA2F7", "codeBg": "#161821", "selectionBg": "#2A3150" },
    "chat": { "user": "#7DCFFF", "assistant": "#E6E6E6", "system": "#9AA1AE", "reasoning": "#667085" },
    "tool": { "name": "#BB9AF7", "pending": "#9AA1AE", "running": "#E0AF68", "success": "#9ECE6A", "error": "#F7768E" },
    "diff": { "add": "#9ECE6A", "remove": "#F7768E", "addBg": "#1B2A1D", "removeBg": "#2D1D22", "hunk": "#7DCFFF" },
    "syntax": { "keyword": "#BB9AF7", "string": "#9ECE6A", "number": "#FF9E64", "comment": "#667085", "function": "#7AA2F7", "type": "#2AC3DE", "operator": "#89DDFF", "variable": "#E6E6E6", "punctuation": "#9AA1AE" },
    "asm": { "address": "#E0AF68", "bytes": "#667085", "mnemonic": "#7AA2F7", "register": "#BB9AF7", "immediate": "#FF9E64", "label": "#2AC3DE", "string": "#9ECE6A", "comment": "#667085" },
    "evidence": { "accent": "#2AC3DE", "observed": "#9ECE6A", "inferred": "#E0AF68", "unknown": "#9AA1AE" },
    "link": "#7DCFFF"
  },
  "textStyles": { "emphasis": "bold", "heading": "bold", "link": "underline", "muted": "dim" }
}
```

**`reengine-light`** (differences only; the file must still define every token): `text.primary #1F2328`, `muted #59636E`, `dim #818B98`, `brand.accent #0550AE`, `accentAlt #8250DF`, `status.success #1A7F37`, `warning #9A6700`, `danger #CF222E`, `info #0969DA`, `surface.border #D0D7DE`, `codeBg #F6F8FA`, `diff.addBg #DAFBE1`, `removeBg #FFEBE9`, `evidence.accent #0A7B83`, `observed #1A7F37`, `inferred #9A6700`, `unknown #59636E`, asm: address `#9A6700`, mnemonic `#0550AE`, register `#8250DF`, immediate `#BC4C00`, label `#0A7B83`.

## 8. Keybindings (defaults; all remappable in `keybindings.json`)

| Action id | Default | Context |
|---|---|---|
| `submit` | Enter | composer |
| `newline` | Shift+Enter, Ctrl+J, `\`+Enter | composer |
| `cancel` | Esc, Ctrl+C | running / overlays |
| `exit` | Ctrl+D (empty), Ctrl+C×2 | idle |
| `historyPrev` / `historyNext` | Up / Down | composer (first/last line) |
| `historySearch` | Ctrl+R | composer |
| `complete` | Tab | completions |
| `clearScreen` | Ctrl+L | global |
| `commandPalette` | Ctrl+K | global |
| `toggleInspector` | Ctrl+G | global |
| `openDetail` | Ctrl+O | global (last tool card) |
| `toggleTodo` | Ctrl+T | global |
| `cycleMode` | Shift+Tab | global |
| `modelPicker` | Alt+M (also `/model`) | global |
| `editExternal` | Ctrl+X Ctrl+E (uses `$VISUAL`/`$EDITOR`) | composer |
| `permissionAllowOnce/Session/Project/Deny/Feedback` | y / s / p / n / f | permission prompt |

Terminal-reality notes: Shift+Enter is indistinguishable from Enter on many terminals unless the kitty keyboard protocol is available — enable it when detected, and always provide `Ctrl+J` and `\`+Enter fallbacks. `Ctrl+I` = Tab and `Ctrl+M` = Enter, so they are never bound. A test enumerates bindings and fails on reserved collisions. Customization supports chords as space-separated sequences (`"ctrl+x ctrl+e"`).

## 9. Slash commands

| Command | Behavior |
|---|---|
| `/help` | Overlay: commands, keys, current mode |
| `/model [ref]` | Picker or switch directly |
| `/provider` | Manage providers inline (add/test) |
| `/theme [name]` | Live-preview picker; Enter applies for the session; `s` saves to user config |
| `/config` | Interactive editor over `ui.*`, `model.*`, `permissions.mode`, `engine.rea.provider` (writes comment-preserving) |
| `/mcp` | Inspector → MCP section; `/mcp reconnect <name>` |
| `/engine` | Inspector → Engine; `/engine restart`, `/engine doctor` |
| `/targets [add\|remove\|list]` | Manage targets |
| `/evidence` | Open evidence list; Enter shows record + raw artifact |
| `/tools` | List active tools with risk and permission status |
| `/permissions` | Mode + rules viewer/editor |
| `/compact [focus]` | Force compaction (optional focus text) |
| `/clear` | New session context (keeps config/targets); old session remains on disk |
| `/sessions`, `/resume` | Picker |
| `/output <callId>` | Detail Viewer for a tool result |
| `/report [path]` | Export Markdown report (default `.reengine/reports/<session>.md`) |
| `/init` | Generate a starter `REENGINE.md` by inspecting the project (uses the model, previews before write) |
| `/doctor` | Run diagnostics in an overlay |
| `/status` | Session/model/engine/usage summary |
| `/exit` | Quit |
| `/mcp__<server>__<prompt>` | MCP prompts (dynamic) |

## 10. Fonts, size, and terminal profile (honest design)

A terminal program cannot choose the terminal's **font family, font size, ligatures, or line height** — the emulator owns them. ReEngine therefore:

1. **Fully controls** inside the terminal: every color token, bold/dim/italic/underline use, border style, glyph set (ASCII / Unicode / Nerd Font), density (padding & blank-line rhythm), wrap width and max content width, spinner, layout toggles.
2. **Exports** matching terminal configuration via `reengine theme export --terminal <kitty|wezterm|alacritty|ghostty|iterm2|windows-terminal|vscode>` which reads the active theme + `ui.terminalProfile.{fontFamily,fontSize,lineHeight,ligatures}` and writes a ready-to-include snippet/file (e.g. kitty `font_family`, `font_size`, color0–15 + foreground/background/cursor; WezTerm Lua table; Alacritty TOML; Windows Terminal JSON scheme + font block; iTerm2 `.itermcolors` plist; VS Code `terminal.integrated.*` settings). Output goes to stdout by default, `--out <file>` to write. Golden-file tests per target. The command prints exact instructions for where to place the result and never edits terminal config files itself.
3. **Detects** Nerd Font availability heuristically (user flag `glyphs: nerd` only; no unreliable auto-detect) and warns that wrong glyph settings show tofu boxes.
4. **Post-1.0 (C):** live font/size application on terminals exposing a documented control API (kitty remote control, WezTerm, iTerm2). Not in MVP because behavior is terminal-specific and fragile.

The ANSI 16-color palette is also exported: the theme's semantic tokens map onto ANSI slots by a documented table (`theme/ansi-map.ts`) so that exported terminal palettes produce the same look as truecolor inside ReEngine.

## 11. Accessibility

- `ui.plain` / `--plain` / non-TTY: no spinners, no cursor movement, no alt-screen; linear append-only output with textual prefixes (`[tool] …`, `[ok]`, `[error]`); permission prompts become simple `y/n` line prompts.
- Never encode meaning by color alone: statuses always pair a glyph/word (`✓ observed`, `~ inferred`, `? unknown`).
- `mono` and `high-contrast` themes are tested against the same snapshots.
- Respect `reduce motion` convention: `spinner: none` and no animated progress when `plain` or `TERM=dumb`.

## 12. Copy and tone

Short, factual, lowercase-friendly. Errors state *what happened → why (if known) → what to do* in ≤ 3 lines, with a doc pointer. Examples:

- `REA unavailable: could not resolve rea-agents. Run \`reengine engine doctor\`.`
- `Model "x/y" does not support tool calling. Pick another with /model.`
- `Denied by rule deny:shell(rm *). Edit with /permissions.`

Never use marketing language, emoji (beyond the glyph set), or exclamation marks in system messages.
