# UX Parity Reference Checklist (P0-09)

Clean-room reference checklist derived from public documentation of Gemini CLI (Apache-2.0), OpenCode/Crush (archived reference), and Claude Code (proprietary — UX concepts only, zero code/prompts/assets copied per ADR-014 & R-057).

## Required UX Behaviors to Match
1. **Transcript + Live Region:** Terminal-native scrollback via `<Static>` for finalized turns; dynamic live region only for active tool activity, streaming assistant response, and optional todo strip.
2. **Composer Ergonomics:** Multiline input (`Shift+Enter`, `Ctrl+J`, `\`+Enter), prompt history (`Up`/`Down`), bracketed paste collapsing (> 10 lines or > 1000 chars → `[Pasted N lines #k]`), `/` slash palette, `@` path completion, queue-one message while busy.
3. **Permission Prompts:** Tool summary + diff/command/json preview + 5 choices (`y` once, `s` session, `p` project rule, `n` deny, `f` deny with feedback); tainted banner disables always-allow shortcuts.
4. **Overlays & Inspector:** `Ctrl+G` Inspector (Engine, MCP servers, Targets, Evidence, Session), `Ctrl+O` alt-screen Detail Viewer for full spilled artifacts, `Ctrl+K` command palette, `Alt+M` / `/model` picker, `/theme` live preview, `Shift+Tab` mode cycle (`default -> acceptEdits -> plan`).
5. **Cancellation & Terminal Safety:** `Esc` / `Ctrl+C` cancels active turn cleanly (`<= 500 ms`); double `Ctrl+C` or `Ctrl+D` on empty idle composer exits; terminal cursor/raw-mode/alt-screen/bracketed-paste restored on every exit path.
